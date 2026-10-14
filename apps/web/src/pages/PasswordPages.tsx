import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { Field, FormError, SubmitButton } from '../components/Field';
import { api } from '../lib/api';
import { errorMessage } from '../lib/auth';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const forgot = useMutation({
    mutationFn: () => api('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    forgot.mutate();
  }

  return (
    <AuthShell eyebrow="Acceso" title="Recuperar contraseña"
      footer={<Link to="/ingresar" className="text-ink-strong underline decoration-peach decoration-2 underline-offset-4 hover:decoration-accent-ink">Volver a ingresar</Link>}>
      {forgot.isSuccess ? (
        <p className="text-muted">
          Si hay una cuenta con <strong className="text-ink-strong">{email}</strong>, te llegará un enlace para elegir una contraseña nueva. Vence en 1 hora.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <FormError>{forgot.isError ? errorMessage(forgot.error) : undefined}</FormError>
          <SubmitButton pending={forgot.isPending}>Enviar enlace</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const reset = useMutation({
    mutationFn: () =>
      api<{ redirectTo: string }>('/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({ token: params.get('token') ?? '', password }),
      }),
    onSuccess: async ({ redirectTo }) => {
      qc.clear();
      navigate(redirectTo, { replace: true });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    reset.mutate();
  }

  return (
    <AuthShell eyebrow="Acceso" title="Elegí una contraseña nueva">
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Contraseña nueva" type="password" autoComplete="new-password" required minLength={10}
          hint="Al menos 10 caracteres. Se cerrarán tus otras sesiones." value={password}
          onChange={(e) => setPassword(e.target.value)} />
        <FormError>{reset.isError ? errorMessage(reset.error) : undefined}</FormError>
        <SubmitButton pending={reset.isPending}>Guardar contraseña</SubmitButton>
      </form>
    </AuthShell>
  );
}
