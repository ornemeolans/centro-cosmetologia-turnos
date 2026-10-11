import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { FormError } from '../components/Field';
import { api } from '../lib/api';
import { errorMessage } from '../lib/auth';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sent = useRef(false);

  const verify = useMutation({
    mutationFn: () => api<{ redirectTo: string }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
    onSuccess: async ({ redirectTo }) => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate(redirectTo, { replace: true });
    },
  });

  // El token es de un solo uso: evitamos el doble envío de StrictMode en desarrollo.
  useEffect(() => {
    if (token && !sent.current) {
      sent.current = true;
      verify.mutate();
    }
  }, [token, verify]);

  return (
    <AuthShell eyebrow="Cuenta nueva" title="Confirmando tu email…">
      <FormError>{!token ? errorMessage('INVALID_OR_EXPIRED_TOKEN') : verify.isError ? errorMessage(verify.error) : undefined}</FormError>
      {(verify.isError || !token) && <Link to="/registro" className="text-ink-strong underline decoration-peach decoration-2 underline-offset-4 hover:decoration-accent-ink">Volver a registrarme</Link>}
    </AuthShell>
  );
}
