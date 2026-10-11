import type { Notification, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { sendEmail } from '../lib/email';
import { dateTimeLabel, dayLabel, money, timeLabel } from '../lib/format';
import { sendTemplate, whatsappConfigured, WhatsAppError } from '../lib/whatsapp';
import { signAppointmentLink } from './offers';

/**
 * Plantillas de WhatsApp (hay que darlas de alta en Meta con estos nombres y variables, idioma es_AR).
 * Cada una tiene su versión de email, que se usa como respaldo.
 */
export type Template =
  | 'turno_confirmado'
  | 'turno_agendado'
  | 'turno_reprogramado'
  | 'turno_cancelado'
  | 'recordatorio_turno'
  | 'aviso_plazo'
  | 'turno_disponible';

const MAX_ATTEMPTS = 5;

export interface NotifyInput {
  template: Template;
  appointmentId?: string;
  clientRecordId?: string;
  payload?: Prisma.InputJsonObject;
  scheduledFor?: Date;
}

/** Encola un aviso. Se intenta por WhatsApp y, si no se puede, por email. */
export async function notify(input: NotifyInput): Promise<void> {
  await prisma.notification.create({
    data: {
      template: input.template,
      appointmentId: input.appointmentId,
      clientRecordId: input.clientRecordId,
      payload: input.payload,
      scheduledFor: input.scheduledFor ?? new Date(),
      channel: 'WHATSAPP',
      to: '',
    },
  });
  kick();
}

/** Para avisos programados (recordatorio, aviso de plazo): uno solo por turno. */
export async function notifyOnce(template: Template, appointmentId: string, payload?: Prisma.InputJsonObject): Promise<boolean> {
  const exists = await prisma.notification.findFirst({ where: { template, appointmentId } });
  if (exists) return false;
  await notify({ template, appointmentId, payload });
  return true;
}

/** En la API real el envío arranca enseguida; en tests se llama a dispatchDue a mano. */
function kick() {
  if (env.NODE_ENV === 'test') return;
  setImmediate(() => dispatchDue().catch((err) => console.error('Error despachando avisos', err)));
}

interface Rendered {
  phone: string | null;
  email: string | null;
  whatsapp: { params: string[]; buttons?: string[] };
  subject: string;
  text: string;
}

const calendarLink = (appointmentId: string) => `${env.WEB_ORIGIN}/c/${signAppointmentLink(appointmentId)}`;

async function render(n: Notification): Promise<Rendered | null> {
  const payload = (n.payload ?? {}) as Record<string, unknown>;

  if (n.template === 'turno_disponible') {
    const record = await prisma.clientRecord.findUnique({ where: { id: n.clientRecordId! } });
    if (!record) return null;
    // Si el horario ya se ocupó (por ejemplo, en la primera ronda), no se avisa.
    const start = new Date(payload.start as string);
    const taken = await prisma.appointment.findFirst({
      where: { professionalId: payload.professionalId as string, startAt: { lt: new Date(payload.end as string) }, blockedUntil: { gt: start }, status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] } },
    });
    if (taken || start < new Date()) return null;
    const link = payload.link as string;
    return {
      phone: record.phoneE164, email: record.email,
      whatsapp: { params: [record.firstName, payload.professionalName as string, dayLabel(start), timeLabel(start), link] },
      subject: 'Se liberó un turno',
      text: `Hola ${record.firstName}: se liberó un turno con ${payload.professionalName} el ${dateTimeLabel(start)}.\nSi lo querés, reservalo acá (se lo queda la primera que paga la seña): ${link}`,
    };
  }

  const a = await prisma.appointment.findUnique({
    where: { id: n.appointmentId! },
    include: { clientRecord: true, professional: true, items: { include: { treatment: true }, orderBy: { sort: 'asc' } } },
  });
  if (!a) return null;
  const r = a.clientRecord;
  const treatments = a.items.map((i) => i.treatment.name).join(' + ');
  const base = { phone: r.phoneE164, email: r.email };
  const cal = calendarLink(a.id);

  switch (n.template as Template) {
    case 'turno_confirmado':
    case 'turno_agendado': {
      if (a.status !== 'CONFIRMED') return null;
      const verb = n.template === 'turno_confirmado' ? 'quedó confirmado' : 'quedó agendado';
      return {
        ...base,
        whatsapp: { params: [r.firstName, treatments, a.professional.displayName, dayLabel(a.startAt), timeLabel(a.startAt), cal] },
        subject: `Tu turno ${verb}`,
        text: `Hola ${r.firstName}: tu turno de ${treatments} con ${a.professional.displayName} ${verb} para el ${dateTimeLabel(a.startAt)}.\n` +
          (a.depositPaidCents > 0 ? `Seña registrada: ${money(a.depositPaidCents)}. El resto se abona en el local.\n` : '') +
          `Agregalo a tu calendario: ${cal}`,
      };
    }
    case 'turno_reprogramado': {
      const prev = new Date(payload.previousStartAt as string);
      return {
        ...base,
        whatsapp: { params: [r.firstName, dateTimeLabel(prev), dayLabel(a.startAt), timeLabel(a.startAt), cal] },
        subject: 'Tu turno cambió de horario',
        text: `Hola ${r.firstName}: tu turno del ${dateTimeLabel(prev)} pasó al ${dateTimeLabel(a.startAt)} con ${a.professional.displayName}.\nActualizá tu calendario: ${cal}`,
      };
    }
    case 'turno_cancelado': {
      const outcome = payload.outcome as string;
      const detail = outcome === 'CREDIT'
        ? `Tu seña de ${money(payload.creditCents as number)} queda como saldo a favor con ${a.professional.displayName} para reservar dentro de los próximos ${payload.validDays} días.`
        : outcome === 'FORFEIT'
          ? 'Como se canceló fuera del plazo, la seña no se reintegra.'
          : 'No había seña registrada.';
      return {
        ...base,
        whatsapp: { params: [r.firstName, dateTimeLabel(a.startAt), detail] },
        subject: 'Tu turno fue cancelado',
        text: `Hola ${r.firstName}: se canceló tu turno del ${dateTimeLabel(a.startAt)} con ${a.professional.displayName}.\n${detail}`,
      };
    }
    case 'recordatorio_turno': {
      if (a.status !== 'CONFIRMED') return null;
      return {
        ...base,
        whatsapp: { params: [r.firstName, timeLabel(a.startAt), treatments, a.professional.displayName], buttons: [`CONFIRMO:${a.id}`, `CANCELO:${a.id}`] },
        subject: 'Te esperamos mañana',
        text: `Hola ${r.firstName}: te recordamos tu turno de ${treatments} con ${a.professional.displayName} mañana a las ${timeLabel(a.startAt)}.\n` +
          `Si cancelás a esta altura, la seña no se reintegra. Tus turnos: ${env.WEB_ORIGIN}/mis-turnos`,
      };
    }
    case 'aviso_plazo': {
      if (a.status !== 'CONFIRMED') return null;
      const deadline = new Date(payload.deadline as string);
      return {
        ...base,
        whatsapp: { params: [r.firstName, dateTimeLabel(a.startAt), timeLabel(deadline), `${env.WEB_ORIGIN}/mis-turnos`] },
        subject: 'Hoy vence el plazo para cambiar tu turno',
        text: `Hola ${r.firstName}: si necesitás cambiar o cancelar tu turno del ${dateTimeLabel(a.startAt)}, tenés tiempo hasta hoy a las ${timeLabel(deadline)} sin perder la seña.\n${env.WEB_ORIGIN}/mis-turnos`,
      };
    }
    default:
      return null;
  }
}

async function deliver(n: Notification) {
  const msg = await render(n);
  if (!msg) {
    await prisma.notification.update({ where: { id: n.id }, data: { status: 'SKIPPED' } });
    return;
  }

  if (n.channel === 'WHATSAPP' && whatsappConfigured() && msg.phone) {
    try {
      const id = await sendTemplate(msg.phone, n.template, msg.whatsapp.params, msg.whatsapp.buttons);
      await prisma.notification.update({ where: { id: n.id }, data: { status: 'SENT', to: msg.phone, providerMessageId: id, sentAt: new Date(), attempts: { increment: 1 } } });
      return;
    } catch (err) {
      const attempts = n.attempts + 1;
      const permanent = err instanceof WhatsAppError && err.permanent;
      if (!permanent && attempts < MAX_ATTEMPTS) {
        await prisma.notification.update({
          where: { id: n.id },
          data: { status: 'QUEUED', attempts, error: String(err), scheduledFor: new Date(Date.now() + 2 ** attempts * 60_000) },
        });
        return;
      }
      await prisma.notification.update({ where: { id: n.id }, data: { status: 'FAILED', attempts, error: String(err) } });
      return sendEmailFallback(n, msg);
    }
  }
  // Sin WhatsApp configurado, sin teléfono o canal EMAIL: va por email.
  if (n.channel === 'WHATSAPP') await prisma.notification.update({ where: { id: n.id }, data: { status: 'SKIPPED', error: 'Sin WhatsApp: se envía por email' } });
  return sendEmailFallback(n, msg, n.channel === 'EMAIL' ? n.id : undefined);
}

async function sendEmailFallback(n: Notification, msg: Rendered, existingId?: string) {
  if (!msg.email) return;
  const row = existingId
    ? await prisma.notification.findUniqueOrThrow({ where: { id: existingId } })
    : await prisma.notification.create({
        data: { template: n.template, appointmentId: n.appointmentId, clientRecordId: n.clientRecordId, payload: n.payload ?? undefined, channel: 'EMAIL', to: msg.email, status: 'SENDING' },
      });
  try {
    await sendEmail({ to: msg.email, subject: msg.subject, text: msg.text });
    await prisma.notification.update({ where: { id: row.id }, data: { status: 'SENT', to: msg.email, sentAt: new Date(), attempts: { increment: 1 } } });
  } catch (err) {
    const attempts = row.attempts + 1;
    await prisma.notification.update({
      where: { id: row.id },
      data: attempts < MAX_ATTEMPTS
        ? { status: 'QUEUED', attempts, error: String(err), scheduledFor: new Date(Date.now() + 2 ** attempts * 60_000) }
        : { status: 'FAILED', attempts, error: String(err) },
    });
  }
}

/** Envía los avisos vencidos. Cada fila se "toma" con un update condicional para no enviarla dos veces. */
export async function dispatchDue(now = new Date()): Promise<number> {
  const due = await prisma.notification.findMany({ where: { status: 'QUEUED', scheduledFor: { lte: now } }, orderBy: { scheduledFor: 'asc' }, take: 50 });
  let sent = 0;
  for (const n of due) {
    const { count } = await prisma.notification.updateMany({ where: { id: n.id, status: 'QUEUED' }, data: { status: 'SENDING' } });
    if (count === 0) continue;
    try {
      await deliver(n);
      sent++;
    } catch (err) {
      await prisma.notification.update({ where: { id: n.id }, data: { status: 'QUEUED', error: String(err), attempts: { increment: 1 }, scheduledFor: new Date(Date.now() + 5 * 60_000) } });
    }
  }
  return sent;
}

/** Meta avisó que un WhatsApp no se entregó: se manda por email. */
export async function whatsappFailed(providerMessageId: string, error: string) {
  const n = await prisma.notification.findUnique({ where: { providerMessageId } });
  if (!n || n.status === 'FAILED') return;
  await prisma.notification.update({ where: { id: n.id }, data: { status: 'FAILED', error } });
  const msg = await render(n);
  if (msg) await sendEmailFallback(n, msg);
}
