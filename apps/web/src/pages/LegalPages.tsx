import type { ReactNode } from 'react';
import { CENTER_WHATSAPP } from '../lib/api';

const CENTER_NAME = import.meta.env.VITE_CENTER_NAME ?? 'Centro de Cosmetología';
const CENTER_EMAIL = import.meta.env.VITE_CENTER_EMAIL ?? '';
const UPDATED = '10 de octubre de 2026';

function Legal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl space-y-6 [&_h2]:mt-10 [&_h2]:text-2xl [&_li]:ml-5 [&_li]:list-disc [&_p]:text-ink">
      <h1 className="text-4xl">{title}</h1>
      <p className="text-sm text-muted">Última actualización: {UPDATED}</p>
      {children}
    </article>
  );
}

const contact = (
  <>
    {CENTER_EMAIL && <>por email a <a className="underline" href={`mailto:${CENTER_EMAIL}`}>{CENTER_EMAIL}</a> o </>}
    por WhatsApp al <a className="underline" href={`https://wa.me/${CENTER_WHATSAPP}`}>+{CENTER_WHATSAPP}</a>
  </>
);

export function PrivacyPage() {
  return (
    <Legal title="Política de privacidad">
      <p>
        {CENTER_NAME} (en adelante, "el centro") es responsable de la base de datos de clientas y trata los datos personales
        conforme a la Ley 25.326 de Protección de los Datos Personales de la República Argentina.
      </p>

      <h2>Qué datos usamos</h2>
      <ul>
        <li>Datos de identificación y contacto: nombre, apellido, email y celular.</li>
        <li>Datos de tu cuenta: si ingresás con Google, recibimos solo tu nombre, tu email y un identificador de la cuenta. No accedemos a tus contactos, archivos ni a ningún otro dato de Google.</li>
        <li>Datos de salud y de la ficha estética: antecedentes, alergias, medicación, tipo de piel, notas de las sesiones y, si lo autorizás expresamente, fotos de antes y después.</li>
        <li>Turnos, señas pagadas y saldos a favor. Los pagos los procesa Mercado Pago: no recibimos ni guardamos los datos de tu tarjeta.</li>
      </ul>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Gestionar tus turnos, confirmarlos y enviarte recordatorios por WhatsApp o email.</li>
        <li>Llevar tu ficha para que la profesional pueda atenderte de forma segura.</li>
        <li>Cobrar la seña de las reservas online y administrar tu saldo a favor.</li>
        <li>Avisarte de turnos liberados, solo si lo activás.</li>
      </ul>
      <p>No vendemos ni cedemos tus datos a terceros, ni los usamos para publicidad.</p>

      <h2>Quién accede</h2>
      <p>
        Tu ficha solo la ven la profesional que te atiende y quienes ella autorice, además de la dirección del centro. La recepción
        solo ve tus datos de contacto y tus turnos, nunca la historia clínica ni las fotos.
      </p>
      <p>
        Usamos proveedores que guardan o envían la información por cuenta del centro: Supabase (base de datos y archivos),
        Render y Vercel (servidores de la aplicación), Google (ingreso y envío de emails), Meta (WhatsApp) y Mercado Pago (pagos).
        Algunos de estos servidores están fuera de Argentina.
      </p>

      <h2>Consentimiento</h2>
      <p>
        Los datos de salud y las fotos se registran solo con tu consentimiento expreso, que podés revocar en cualquier momento.
        Si revocás el consentimiento de fotos, se borran todas tus fotos.
      </p>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>
        La historia de tu ficha se conserva 2 años desde tu último turno. Pasado ese plazo se borran la historia, las fotos y las
        recomendaciones, y se conservan solo los datos de contacto y el registro de turnos y pagos.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés pedir acceder a tus datos, rectificarlos, actualizarlos o suprimirlos, {contact}. Respondemos el acceso dentro de
        los 10 días corridos y la rectificación o supresión dentro de los 5 días hábiles, como indica la ley.
      </p>
      <p className="text-sm text-muted">
        La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley 25.326, tiene la atribución
        de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las
        normas vigentes en materia de protección de datos personales.
      </p>
    </Legal>
  );
}

export function TermsPage() {
  return (
    <Legal title="Términos y condiciones">
      <p>Estas condiciones regulan el uso del sistema de turnos de {CENTER_NAME}. Al reservar, las aceptás.</p>

      <h2>Cuenta</h2>
      <p>
        Para usar el sistema tenés que ingresar con el mismo email que le diste a tu cosmetóloga, con Google o con una cuenta
        propia. Sos responsable de mantener tu contraseña en reserva. Para tu primer turno, comunicate por WhatsApp.
      </p>

      <h2>Reservas y seña</h2>
      <ul>
        <li>Las reservas online requieren el pago de una seña, que es un porcentaje del precio del tratamiento. El resto se abona en el centro.</li>
        <li>Mientras pagás, el horario queda reservado por 20 minutos. Si el pago no se acredita en ese plazo, el horario se libera.</li>
        <li>El turno queda confirmado cuando Mercado Pago acredita la seña. Te avisamos por WhatsApp o email.</li>
      </ul>

      <h2>Cambios y cancelaciones</h2>
      <ul>
        <li>Podés reprogramar o cancelar sin perder la seña hasta 2 días hábiles completos antes del día del turno (por ejemplo, un turno del lunes se puede cambiar hasta el miércoles anterior, al cierre del centro).</li>
        <li>Cada turno se puede reprogramar hasta 2 veces.</li>
        <li>Si cancelás a tiempo, la seña queda como saldo a favor con la misma profesional y la podés usar en una reserva confirmada dentro de los 30 días. Vencido ese plazo, el saldo se pierde.</li>
        <li>Si cancelás fuera de plazo o no te presentás, la seña no se reintegra.</li>
        <li>Si el centro necesita cancelar o mover tu turno, la seña queda a tu favor o, si lo pedís, se reintegra.</li>
      </ul>

      <h2>Comunicaciones</h2>
      <p>
        Al dejar tu celular aceptás recibir por WhatsApp las confirmaciones, recordatorios y avisos de tus turnos. Las alertas de
        turnos liberados las recibís solo si las activás, con un máximo de 3 por semana.
      </p>

      <h2>Datos personales</h2>
      <p>El tratamiento de tus datos se rige por la <a className="underline" href="/privacidad">Política de privacidad</a>.</p>

      <h2>Contacto</h2>
      <p>Por consultas sobre estas condiciones, escribinos {contact}.</p>
    </Legal>
  );
}
