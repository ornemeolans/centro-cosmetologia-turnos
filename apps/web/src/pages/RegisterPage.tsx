import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { Field, FormError, SubmitButton } from '../components/Field';
import { api } from '../lib/api';
import { errorMessage } from '../lib/auth';

export function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const register = useMutation({
    mutationFn: () => api('/auth/register', { method: 'POST', body: JSON.stringify(form) }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    register.mutate();
  }

  if (register.isSuccess) {
    return (
      <AuthShell eyebrow="Último paso" title="Revisá tu email"
        intro={<>Te enviamos un enlace a <strong className="text-ink-strong">{form.email}</strong> para activar tu cuenta. Vence en 24 horas.</>}>
        <p className="rounded-xl bg-sunken px-4 py-3 text-sm text-muted">¿No te llegó? Mirá en spam o promociones.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Cuenta nueva" title="Crear cuenta"
      intro="Usá el email que le diste a tu cosmetóloga: así vas a ver tu ficha y tus turnos."
      footer={<p>¿Ya tenés cuenta? <Link to="/ingresar" className="text-ink-strong underline decoration-peach decoration-2 underline-offset-4 hover:decoration-accent-ink">Ingresá</Link></p>}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Nombre y apellido" autoComplete="name" required value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Field label="Email" type="email" autoComplete="email" required value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field label="Contraseña" type="password" autoComplete="new-password" required minLength={10}
          hint="Al menos 10 caracteres." value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <FormError>{register.isError ? errorMessage(register.error) : undefined}</FormError>
        <SubmitButton pending={register.isPending}>Crear cuenta</SubmitButton>
      </form>
    </AuthShell>
  );
}
