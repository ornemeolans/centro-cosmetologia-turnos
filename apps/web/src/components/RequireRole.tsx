import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { homeFor, useMe, type Role } from '../lib/auth';

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const location = useLocation();

  if (isLoading) return <p className="text-stone-600">Cargando…</p>;
  if (!me) return <Navigate to="/ingresar" replace state={{ from: location.pathname }} />;
  if (!roles.includes(me.user.role)) return <Navigate to={homeFor(me.user.role)} replace />;
  return <>{children}</>;
}
