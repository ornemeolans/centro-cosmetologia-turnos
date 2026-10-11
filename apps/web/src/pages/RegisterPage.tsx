import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
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
      <section className="mx-auto max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Revisá tu email</h1>
        <p className="text-stone-600">
          Te enviamos un enlace a <strong>{form.email}</strong> para activar tu cuenta. Vence en 24 horas.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">Crear cuenta</h1>
      <p className="text-sm text-stone-600">
        Usá el email que le diste a tu cosmetóloga: así vas a ver tu ficha y tus turnos.
      </p>
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
      <p className="text-sm">¿Ya tenés cuenta? <Link to="/ingresar" className="text-brand underline">Ingresá</Link></p>
    </section>
  );
}
