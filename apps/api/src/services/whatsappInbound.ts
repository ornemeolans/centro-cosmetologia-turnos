import { prisma } from '../db';
import { dateTimeLabel } from '../lib/format';
import { sendButtons, sendText, whatsappConfigured } from '../lib/whatsapp';
import { cancelAppointment, rulesFor } from './appointments';
import { whatsappFailed } from './notifications';

interface WebhookBody {
  entry?: {
    changes?: {
      value?: {
        statuses?: { id: string; status: string; errors?: { title?: string; message?: string }[] }[];
        messages?: {
          from: string;
          type: string;
          button?: { payload: string };
          interactive?: { button_reply?: { id: string } };
        }[];
      };
    }[];
  }[];
}

/** Estados de entrega y respuestas a los botones "Confirmo" / "Cancelo". */
export async function handleWhatsAppWebhook(body: WebhookBody) {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        if (s.status === 'failed') {
          await whatsappFailed(s.id, s.errors?.map((e) => e.message ?? e.title).join('; ') ?? 'failed');
        } else if (['sent', 'delivered', 'read'].includes(s.status)) {
          await prisma.notification.updateMany({ where: { providerMessageId: s.id }, data: { status: s.status.toUpperCase() } });
        }
      }
      for (const m of change.value?.messages ?? []) {
        const payload = m.button?.payload ?? m.interactive?.button_reply?.id;
        if (payload) await handleButton(`+${m.from}`, payload);
      }
    }
  }
}

async function handleButton(fromE164: string, payload: string) {
  const [action, appointmentId] = payload.split(':');
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { clientRecord: { include: { user: true } } } });
  // Solo responde al teléfono de la ficha dueña del turno.
  if (!appt || appt.clientRecord.phoneE164 !== fromE164 || !whatsappConfigured()) return;

  if (action === 'CONFIRMO') {
    await prisma.appointment.update({ where: { id: appt.id }, data: { clientConfirmedAt: new Date() } });
    await sendText(fromE164, '¡Gracias por confirmar! Te esperamos.');
    return;
  }
  if (action === 'CANCELO') {
    if (appt.status !== 'CONFIRMED') return sendText(fromE164, 'Ese turno ya no está activo.');
    const rules = await rulesFor(appt);
    const warning = rules.onTime
      ? 'Tu seña queda como saldo a favor para tu próxima reserva.'
      : 'Como ya pasó el plazo para cambios, la seña no se reintegra.';
    await sendButtons(fromE164, `¿Querés cancelar tu turno del ${dateTimeLabel(appt.startAt)}? ${warning}`, [
      { id: `CANCELAR_SI:${appt.id}`, title: 'Sí, cancelar' },
      { id: `CANCELAR_NO:${appt.id}`, title: 'No, mantener' },
    ]);
    return;
  }
  if (action === 'CANCELAR_SI') {
    if (appt.status !== 'CONFIRMED' || !appt.clientRecord.user) return sendText(fromE164, 'Ese turno ya no está activo.');
    // La clienta aceptó explícitamente perder la seña si está fuera del plazo.
    await cancelAppointment(appt.clientRecord.user, appt.id, { acceptForfeit: true });
    return;
  }
  if (action === 'CANCELAR_NO') await sendText(fromE164, 'Perfecto, tu turno sigue en pie.');
}
