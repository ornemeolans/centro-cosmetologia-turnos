import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';

export type Role = 'CLIENT' | 'PROFESSIONAL' | 'RECEPTION' | 'OWNER';

export interface Me {
  user: { id: string; name: string; email: string | null; role: Role };
  record: { id: string; status: 'PRIMERA_VEZ' | 'ACTIVA'; firstName: string } | null;
  needsPhone: boolean;
}

/** Sesión actual; null si no hay sesión (401). */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<Me>('/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST', body: '{}' }),
    // Se descarta todo lo guardado en memoria: la próxima persona en esta pestaña no debe ver datos de la anterior.
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  });
}

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: 'El email o la contraseña no son correctos.',
  EMAIL_NOT_VERIFIED: 'Todavía no confirmaste tu email. Revisá tu casilla (y la carpeta de spam).',
  TOO_MANY_ATTEMPTS: 'Demasiados intentos. Esperá 15 minutos y probá de nuevo.',
  TOO_MANY_REQUESTS: 'Hiciste varios pedidos seguidos. Esperá un rato y probá de nuevo.',
  INVALID_OR_EXPIRED_TOKEN: 'El enlace ya se usó o venció. Pedí uno nuevo.',
  WRONG_PASSWORD: 'La contraseña no coincide con la que elegiste al registrarte. Si no la recordás, registrate de nuevo.',
  APPOINTMENT_CHANGED: 'El turno cambió mientras tanto. Actualizá la página y revisalo.',
  ACCOUNT_DISABLED: 'Esta cuenta está desactivada. Consultá con el centro.',
  GOOGLE_NOT_CONFIGURED: 'El ingreso con Google todavía no está configurado.',
  GOOGLE_CANCELLED: 'Cancelaste el ingreso con Google.',
  GOOGLE_STATE: 'El ingreso con Google se interrumpió. Probá de nuevo.',
  GOOGLE_PROFILE: 'No pudimos leer tu cuenta de Google. Probá de nuevo.',
  BAD_REQUEST: 'Revisá los datos ingresados.',
  SLOT_TAKEN: 'Ese horario se acaba de ocupar. Elegí otro.',
  OUTSIDE_NOTICE_PERIOD: 'Ya pasó el plazo para hacer cambios en este turno.',
  RESCHEDULE_LIMIT: 'Este turno ya se reprogramó la cantidad máxima de veces.',
  LATE_CANCEL_FORFEITS_DEPOSIT: 'Si cancelás ahora perdés la seña.',
  COMBO_NOT_ALLOWED: 'Esos tratamientos no se pueden reservar juntos.',
  TREATMENT_NOT_OFFERED: 'Ese tratamiento no está disponible con esta profesional.',
  PROFESSIONAL_MP_NOT_CONNECTED: 'Esta profesional todavía no recibe reservas online. Escribinos por WhatsApp.',
  FIRST_VISIT_PENDING: 'Vas a poder reservar online después de tu primera sesión.',
  HOLD_EXPIRED: 'La reserva temporal venció. Elegí el horario de nuevo.',
  RECORD_EXISTS: 'Ya existe una ficha con ese email.',
  USERNAME_TAKEN: 'Ese nombre de usuario ya existe.',
  ALREADY_STAFF: 'Ese email ya pertenece a alguien del equipo.',
  NO_RECORD_ACCESS: 'No tenés acceso a esta ficha.',
  NOT_TITULAR: 'Solo la profesional titular o la dueña pueden hacer esto.',
  PHOTO_CONSENT_REQUIRED: 'Primero registrá el consentimiento para fotos.',
  OVERLAPPING_BLOCKS: 'Hay franjas del mismo día que se pisan.',
  NOT_STARTED: 'El turno todavía no empezó.',
  CANNOT_DISABLE_OWNER: 'La dueña no se puede desactivar.',
  TREATMENT_EXISTS: 'Ese tratamiento ya está en el catálogo.',
  MP_NOT_CONFIGURED: 'Falta configurar la aplicación de Mercado Pago del centro.',
};

const fieldMessages: Record<string, string> = {
  phoneE164: 'Revisá el celular: con código de área, por ejemplo 351 732 6453.',
  email: 'Revisá el email.',
  password: 'La contraseña tiene que tener al menos 10 caracteres.',
  birthDate: 'Revisá la fecha de nacimiento.',
  firstName: 'Completá el nombre.',
  lastName: 'Completá el apellido.',
};

export function errorMessage(err: unknown): string {
  const code = err instanceof ApiError ? err.code : typeof err === 'string' ? err : '';
  // Error de validación: decir qué campo revisar en lugar de un mensaje genérico.
  if (err instanceof ApiError && code === 'BAD_REQUEST') {
    const issues = (err.body.issues ?? []) as { path?: (string | number)[] }[];
    const field = issues.map((i) => String(i.path?.at(-1) ?? '')).find((f) => fieldMessages[f]);
    if (field) return fieldMessages[field];
  }
  return messages[code] ?? 'Algo salió mal. Probá de nuevo en unos minutos.';
}

export function homeFor(role: Role): string {
  return role === 'CLIENT' ? '/mis-turnos' : '/agenda';
}
