import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BrandMark, Close, Menu } from './components/icons';
import { StatusCard } from './components/AuthShell';
import { RequireRole } from './components/RequireRole';
import { Button } from './components/ui';
import { homeFor, useLogout, useMe, type Role } from './lib/auth';
import { BookingWizard } from './pages/BookingWizard';
import { CalendarLinkPage } from './pages/CalendarLinkPage';
import { ClientDashboard } from './pages/ClientDashboard';
import { LandingPage } from './pages/LandingPage';
import { PrivacyPage, TermsPage } from './pages/LegalPages';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages';
import { PaymentResultPage } from './pages/PaymentResultPage';
import { RegisterPage } from './pages/RegisterPage';
import { AdminPage } from './pages/staff/AdminPage';
import { AgendaPage } from './pages/staff/AgendaPage';
import { RecordDetailPage } from './pages/staff/RecordDetailPage';
import { RecordsPage } from './pages/staff/RecordsPage';
import { ReportsPage } from './pages/staff/ReportsPage';
import { SettingsPage } from './pages/staff/SettingsPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';

const STAFF: Role[] = ['PROFESSIONAL', 'RECEPTION', 'OWNER'];
const PRO: Role[] = ['PROFESSIONAL', 'OWNER'];

const navFor: Record<Role, { to: string; label: string }[]> = {
  CLIENT: [{ to: '/mis-turnos', label: 'Mis turnos' }, { to: '/reservar', label: 'Reservar' }],
  RECEPTION: [{ to: '/agenda', label: 'Agenda' }, { to: '/fichas', label: 'Clientas' }],
  PROFESSIONAL: [{ to: '/agenda', label: 'Agenda' }, { to: '/fichas', label: 'Fichas' }, { to: '/configuracion', label: 'Configuración' }, { to: '/reportes', label: 'Reportes' }],
  OWNER: [
    { to: '/agenda', label: 'Agenda' }, { to: '/fichas', label: 'Fichas' }, { to: '/configuracion', label: 'Mi configuración' },
    { to: '/reportes', label: 'Reportes' }, { to: '/admin', label: 'Administración' },
  ],
};

const CENTER_NAME = import.meta.env.VITE_CENTER_NAME ?? 'Centro de Cosmetología';

function Header() {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [location.pathname]);

  const links = me ? navFor[me.user.role] : [];
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 transition-colors ${isActive ? 'bg-daisy text-ink-strong' : 'text-muted hover:text-ink-strong'}`;
  const signOut = () => logout.mutate(undefined, { onSuccess: () => navigate('/') });

  return (
    <header className="sticky top-0 z-20 px-3 pt-3 sm:px-5">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-2xl border border-line/70 bg-surface py-2 pl-4 pr-2">
        <Link to={me ? homeFor(me.user.role) : '/'} className="flex items-center gap-2.5 text-[17px] font-medium tracking-tight text-ink-strong">
          <BrandMark className="size-7" />
          {CENTER_NAME}
        </Link>
        {me ? (
          <>
            <nav className="hidden items-center gap-0.5 font-mono text-[13px] lg:flex" aria-label="Principal">
              {links.map((n) => <NavLink key={n.to} to={n.to} className={linkClass}>{n.label}</NavLink>)}
              <span className="mx-2 h-5 w-px bg-line" />
              <span className="max-w-40 truncate px-2 text-muted">{me.user.name}</span>
              <Button variant="ghost" onClick={signOut}>Salir</Button>
            </nav>
            <button type="button" aria-label="Menú" aria-expanded={open} onClick={() => setOpen(!open)}
              className="grid size-11 place-items-center rounded-lg bg-peach text-n8 lg:hidden">
              {open ? <Close /> : <Menu />}
            </button>
          </>
        ) : (
          <Link to="/ingresar" className="inline-flex min-h-10 items-center rounded-lg bg-peach px-4 text-[15px] font-medium text-n8 hover:bg-[#b07a7d]">
            Ingresar
          </Link>
        )}
      </div>
      {me && open && (
        <nav aria-label="Principal" className="mx-auto mt-2 grid max-w-6xl gap-1 rounded-2xl border border-line/70 bg-surface p-2 text-[16px] lg:hidden">
          {links.map((n) => <NavLink key={n.to} to={n.to} className={linkClass}>{n.label}</NavLink>)}
          <div className="mt-1 flex items-center justify-between border-t border-line px-3 pt-2">
            <span className="truncate text-sm text-muted">{me.user.name}</span>
            <Button variant="ghost" onClick={signOut}>Salir</Button>
          </div>
        </nav>
      )}
    </header>
  );
}

export function App() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-5 sm:py-16">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/ingresar" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route path="/verificar" element={<VerifyEmailPage />} />
          <Route path="/recuperar" element={<ForgotPasswordPage />} />
          <Route path="/restablecer" element={<ResetPasswordPage />} />
          <Route path="/c/:token" element={<CalendarLinkPage />} />
          <Route path="/privacidad" element={<PrivacyPage />} />
          <Route path="/terminos" element={<TermsPage />} />

          <Route path="/mis-turnos" element={<RequireRole roles={['CLIENT']}><ClientDashboard /></RequireRole>} />
          <Route path="/reservar" element={<RequireRole roles={['CLIENT']}><BookingWizard /></RequireRole>} />
          <Route path="/pago/:status" element={<RequireRole roles={['CLIENT']}><PaymentResultPage /></RequireRole>} />

          <Route path="/agenda" element={<RequireRole roles={STAFF}><AgendaPage /></RequireRole>} />
          <Route path="/fichas" element={<RequireRole roles={STAFF}><RecordsPage /></RequireRole>} />
          <Route path="/fichas/:id" element={<RequireRole roles={STAFF}><RecordDetailPage /></RequireRole>} />
          <Route path="/configuracion" element={<RequireRole roles={PRO}><SettingsPage /></RequireRole>} />
          <Route path="/reportes" element={<RequireRole roles={PRO}><ReportsPage /></RequireRole>} />
          <Route path="/admin" element={<RequireRole roles={['OWNER']}><AdminPage /></RequireRole>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="px-3 sm:px-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-t-2xl bg-panel px-5 py-6 font-mono text-[13px] text-daisy/75">
          <span className="flex items-center gap-2.5 text-daisy">
            <BrandMark className="size-5" />
            {CENTER_NAME}
          </span>
          <span className="flex flex-wrap gap-x-6 gap-y-1">
            <Link to="/privacidad" className="hover:text-daisy">Política de privacidad</Link>
            <Link to="/terminos" className="hover:text-daisy">Términos y condiciones</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <StatusCard icon={<span className="font-mono text-lg">404</span>} eyebrow="Error 404" title="Esta página no existe"
      text="Puede que el enlace esté incompleto o que la página se haya movido.">
      <Link to="/" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-peach px-5 font-medium text-n8 transition hover:bg-[#b07a7d]">Ir al inicio</Link>
    </StatusCard>
  );
}
