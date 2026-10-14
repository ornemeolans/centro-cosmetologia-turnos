import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { Field, FormError, SubmitButton } from '../components/Field';
import { api } from '../lib/api';
import { errorMessage } from '../lib/auth';

const linkClass = 'text-ink-strong underline decoration-peach decoration-2 underline-offset-4 hover:decoration-accent-ink';

/**
 * Para activar la cuenta se pide la contraseña elegida al registrarse: así nadie puede crear
 * una cuenta con el email de otra persona y hacer que ella la active con un clic.
 */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const qc = useQueryClient();

  const verify = useMutation({
    mutationFn: () => api<{ redirectTo: string }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token, password }) }),
    onSuccess: async ({ redirectTo }) => {
      qc.clear();
      navigate(redirectTo, { replace: true });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    verify.mutate();
  }

  if (!token) {
    return (
      <AuthShell eyebrow="Cuenta nueva" title="El enlace no es válido">
        <FormError>{errorMessage('INVALID_OR_EXPIRED_TOKEN')}</FormError>
        <Link to="/registro" className={linkClass}>Volver a registrarme</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Cuenta nueva" title="Confirmá tu email"
      intro="Para activar tu cuenta, escribí la contraseña que elegiste al registrarte."
      footer={<p>¿No te registraste vos? Ignorá este enlace: la cuenta no se activa sin la contraseña.</p>}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Contraseña" type="password" autoComplete="current-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} />
        <FormError>{verify.isError ? errorMessage(verify.error) : undefined}</FormError>
        <SubmitButton pending={verify.isPending}>Activar mi cuenta</SubmitButton>
      </form>
      {verify.isError && <Link to="/registro" className={linkClass}>Volver a registrarme</Link>}
    </AuthShell>
  );
}
