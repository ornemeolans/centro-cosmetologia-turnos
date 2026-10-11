import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { RequireRole } from './components/RequireRole';
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

function Header() {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <Link to={me ? homeFor(me.user.role) : '/'} className="font-serif text-lg text-ink-strong">Centro de Cosmetología</Link>
        {me ? (
          <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Principal">
            {navFor[me.user.role].map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `rounded-md px-2.5 py-1.5 ${isActive ? 'bg-sunken text-ink-strong' : 'text-muted hover:text-ink-strong'}`}>
                {n.label}
              </NavLink>
            ))}
            <span className="mx-2 hidden h-4 w-px bg-line sm:block" />
            <span className="hidden text-muted sm:inline">{me.user.name}</span>
            <button type="button" className="rounded-md px-2.5 py-1.5 text-muted hover:text-ink-strong"
              onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}>
              Salir
            </button>
          </nav>
        ) : (
          <Link to="/ingresar" className="text-sm text-muted hover:text-ink-strong">Ingresar</Link>
        )}
      </div>
    </header>
  );
}

export function App() {
  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
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
          <Route path="*" element={<p className="text-muted">Página no encontrada.</p>} />
        </Routes>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-1 px-4 py-6 text-xs text-muted">
          <Link to="/privacidad" className="hover:text-ink-strong">Política de privacidad</Link>
          <Link to="/terminos" className="hover:text-ink-strong">Términos y condiciones</Link>
        </div>
      </footer>
    </div>
  );
}
