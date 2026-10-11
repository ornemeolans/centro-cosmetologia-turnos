import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
    <section className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">Recuperar contraseña</h1>
      {forgot.isSuccess ? (
        <p className="text-stone-600">
          Si hay una cuenta con <strong>{email}</strong>, te llegará un enlace para elegir una contraseña nueva. Vence en 1 hora.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <FormError>{forgot.isError ? errorMessage(forgot.error) : undefined}</FormError>
          <SubmitButton pending={forgot.isPending}>Enviar enlace</SubmitButton>
        </form>
      )}
      <Link to="/ingresar" className="text-sm text-brand underline">Volver a ingresar</Link>
    </section>
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
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate(redirectTo, { replace: true });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    reset.mutate();
  }

  return (
    <section className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">Elegí una contraseña nueva</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Contraseña nueva" type="password" autoComplete="new-password" required minLength={10}
          hint="Al menos 10 caracteres. Se cerrarán tus otras sesiones." value={password}
          onChange={(e) => setPassword(e.target.value)} />
        <FormError>{reset.isError ? errorMessage(reset.error) : undefined}</FormError>
        <SubmitButton pending={reset.isPending}>Guardar contraseña</SubmitButton>
      </form>
    </section>
  );
}
