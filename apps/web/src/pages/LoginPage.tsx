import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Field, FormError, SubmitButton } from '../components/Field';
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
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate(redirectTo);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate();
  }

  const googleError = params.get('error');

  return (
    <section className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">Ingresar</h1>
      <p className="text-sm text-stone-600">Usá el mismo email que le indicaste a tu cosmetóloga.</p>

      <FormError>{googleError ? errorMessage(googleError) : undefined}</FormError>

      {/* Navegación completa (no fetch): la API redirige a Google y vuelve con la sesión iniciada. */}
      <a href="/api/v1/auth/google/start"
        className="block w-full rounded-lg border border-stone-300 bg-white px-4 py-2 text-center font-medium">
        Continuar con Google
      </a>

      <div className="flex items-center gap-3 text-xs text-stone-500">
        <span className="h-px flex-1 bg-stone-200" />o con tu email<span className="h-px flex-1 bg-stone-200" />
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Email o usuario" autoComplete="username" required value={identifier}
          onChange={(e) => setIdentifier(e.target.value)} />
        <Field label="Contraseña" type="password" autoComplete="current-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} />
        <FormError>{login.isError ? errorMessage(login.error) : undefined}</FormError>
        <SubmitButton pending={login.isPending}>Ingresar con email</SubmitButton>
      </form>

      <div className="flex justify-between text-sm">
        <Link to="/registro" className="text-brand underline">Crear cuenta</Link>
        <Link to="/recuperar" className="text-stone-600 underline">Olvidé mi contraseña</Link>
      </div>
    </section>
  );
}
