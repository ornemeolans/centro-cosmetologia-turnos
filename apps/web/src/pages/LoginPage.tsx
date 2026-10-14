import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { Field, FormError, SubmitButton } from '../components/Field';
import { GoogleMark } from '../components/icons';
import { api } from '../lib/api';
import { errorMessage } from '../lib/auth';

export function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const login = useMutation({
    mutationFn: () => api<{ redirectTo: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }),
    onSuccess: async ({ redirectTo }) => {
      qc.clear();
      navigate(redirectTo);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate();
  }

  const googleError = params.get('error');

  return (
    <AuthShell eyebrow="Acceso" title="Ingresar" intro="Usá el mismo email que le indicaste a tu cosmetóloga."
      footer={
        <div className="flex flex-wrap justify-between gap-3">
          <Link to="/registro" className="text-ink-strong underline decoration-peach decoration-2 underline-offset-4 hover:decoration-accent-ink">Crear cuenta</Link>
          <Link to="/recuperar" className="text-muted underline underline-offset-4 hover:text-ink-strong">Olvidé mi contraseña</Link>
        </div>
      }>

      <FormError>{googleError ? errorMessage(googleError) : undefined}</FormError>

      {/* Navegación completa (no fetch): la API redirige a Google y vuelve con la sesión iniciada. */}
      <a href="/api/v1/auth/google/start"
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-lg border border-line bg-surface px-4 font-medium text-ink-strong transition hover:border-n4">
        <GoogleMark />Continuar con Google
      </a>

      <div className="flex items-center gap-3 font-mono text-[12px] text-muted">
        <span className="h-px flex-1 bg-line" />o con tu email<span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Email o usuario" autoComplete="username" required value={identifier}
          onChange={(e) => setIdentifier(e.target.value)} />
        <Field label="Contraseña" type="password" autoComplete="current-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} />
        <FormError>{login.isError ? errorMessage(login.error) : undefined}</FormError>
        <SubmitButton pending={login.isPending}>Ingresar con email</SubmitButton>
      </form>
    </AuthShell>
  );
}
