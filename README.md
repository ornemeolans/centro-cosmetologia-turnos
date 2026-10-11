# Turnos — Centro de Cosmetología

Sistema de turnos para un centro de cosmetología: las clientas reservan pagando una seña en la cuenta de Mercado Pago de cada profesional, reciben confirmación y recordatorios por WhatsApp (con email de respaldo) y agregan el turno a su calendario. El equipo maneja agenda, fichas clínicas, accesos y reportes.

Las reglas de negocio (plazo de 48 h hábiles, saldo a favor, lista de espera, roles) están en el documento de diseño del proyecto, tabla "Decisiones tomadas".

## Qué hace

| Rol | Puede |
| --- | --- |
| Clienta | Entrar con Google o email, reservar uno o varios tratamientos combinables, pagar la seña, agregar al calendario, reprogramar (máx. 2) o cancelar, usar su saldo a favor, ver recomendaciones, anotarse en lista de espera y alertas de último momento |
| Profesional | Agenda del día, turnos sin seña, fichas (titular o con acceso compartido), historia, recomendaciones, consentimientos, fotos antes/después, horarios, bloqueos, tratamientos con % de seña, combos, anticipación, conectar su Mercado Pago, sus reportes |
| Recepción | Agenda de todas, perfiles de primera vez, turnos para cualquier profesional, datos de contacto (sin historia clínica ni fotos). Entra con usuario y contraseña o con un Google autorizado |
| Dueña (OWNER) | Todo lo anterior + invitar profesionales, accesos de recepción, horario del centro, feriados, reglas, cambios fuera de plazo, tablero general |

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `apps/web` | React + Vite + TanStack Query + Zustand + Tailwind |
| `apps/api` | Node.js + Express + Prisma (PostgreSQL / Supabase) |
| `packages/shared` | Reglas puras con tests: plazo de cambios, disponibilidad encadenada, franjas del día, seña, clienta cumplidora, calendario (.ics y Google) |
| `e2e` | Playwright (escritorio y celular) |

## Probarlo ya, sin configurar nada

```bash
npm run demo
```

Abre http://localhost:5199 con datos de prueba y Mercado Pago simulado (el "checkout" confirma el pago y vuelve a la web). Usuarios, todos con la contraseña `una-clave-segura`:

| Usuario | Rol |
| --- | --- |
| `duena@centro.test` | Dueña |
| `ana@centro.test` | Profesional (Ana Pérez, con agenda y tratamientos) |
| `recepcion` | Recepción |

Para una clienta: crear cuenta con `lucia-chromium@example.com` (tiene ficha). Los emails de verificación se ven en http://localhost:3199/api/v1/dev/outbox. La base es descartable: se borra al cerrar.

## Desarrollo local

Cada comando en su propia terminal, desde la carpeta del proyecto.

1. Base de datos local (Postgres embebido, sin Docker; se detiene con Ctrl+C):

   ```bash
   npm run db:local --workspace apps/api
   ```

2. La primera vez, tablas y datos iniciales:

   ```bash
   npm run db:deploy --workspace apps/api
   ```

   ```bash
   npm run db:seed --workspace apps/api
   ```

3. API y web:

   ```bash
   npm run dev
   ```

   Web: http://localhost:5173 · API: http://localhost:3000/api/v1/health

Sin `EMAIL_API_KEY` los emails se muestran en la consola de la API y en `/api/v1/dev/outbox`. Poné tu email en `OWNER_EMAIL` (en `apps/api/.env`) para entrar como dueña.

## Tests

```bash
npm test
```

```bash
npm run test:e2e
```

- `npm test`: 22 tests de reglas de negocio y 40 de la API contra un Postgres real descartable (login, permisos de fichas, reserva con seña, webhook firmado, saldo a favor, cancelación tardía, límite de reprogramaciones, cambios forzados, fotos, vencimiento de reservas, lista de espera, calendario, reportes). Mercado Pago está simulado: ningún test sale a internet.
- `npm run test:e2e`: 16 tests de Playwright en escritorio y celular (usa los puertos 3199, 5199 y 54331).

## Puesta en producción

### 1. Supabase (base de datos y fotos)

1. Crear un proyecto en [supabase.com](https://supabase.com) (región São Paulo).
2. Project Settings → Database → Connection string → **Session pooler**: esa URI va en `DATABASE_URL`.
3. Storage → crear un bucket **privado** llamado `fichas`. Project Settings → API: `SUPABASE_URL` y la `service_role` key en `SUPABASE_SERVICE_ROLE_KEY` (solo en el servidor, nunca en la web).
4. Tablas y datos iniciales:

   ```bash
   npm run db:deploy --workspace apps/api
   ```

   ```bash
   npm run db:seed --workspace apps/api
   ```

### 2. Google

1. [Google Cloud Console](https://console.cloud.google.com): pantalla de consentimiento OAuth (Externo) y credencial **ID de cliente OAuth → Aplicación web**.
2. URI de redireccionamiento: `https://TU-DOMINIO/api/v1/auth/google/callback` (y `http://localhost:5173/...` para desarrollo).
3. `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.

### 3. Mercado Pago (cada profesional cobra en su cuenta)

1. En [Mercado Pago Developers](https://www.mercadopago.com.ar/developers/panel) crear una aplicación del centro de tipo **Marketplace / pagos online con OAuth**.
2. URL de redirección: `https://TU-DOMINIO/api/v1/oauth/mercadopago/callback`.
3. Webhooks: activar el evento **Pagos**; el secreto de firma va en `MP_WEBHOOK_SECRET`. (Cada preferencia ya indica su `notification_url`.)
4. `MP_CLIENT_ID`, `MP_CLIENT_SECRET` y una clave para cifrar los tokens:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

   en `TOKEN_ENCRYPTION_KEY`.
5. Cada profesional entra a **Configuración → Conectar Mercado Pago**. Sin conectar, no recibe reservas online (sí turnos cargados por el equipo).

### 4. WhatsApp (Meta Cloud API)

En el administrador de WhatsApp Business, dar de alta estas plantillas (categoría *Utility*, idioma **Spanish (ARG) / es_AR**). Las variables tienen que ir en este orden:

| Nombre | Texto sugerido |
| --- | --- |
| `turno_confirmado` | Hola {{1}}, tu turno de {{2}} con {{3}} quedó confirmado para el {{4}} a las {{5}}. Agregalo a tu calendario: {{6}} |
| `turno_agendado` | Hola {{1}}, te agendamos un turno de {{2}} con {{3}} para el {{4}} a las {{5}}. Agregalo a tu calendario: {{6}} |
| `turno_reprogramado` | Hola {{1}}, tu turno del {{2}} pasó al {{3}} a las {{4}}. Actualizá tu calendario: {{5}} |
| `turno_cancelado` | Hola {{1}}, se canceló tu turno del {{2}}. {{3}} |
| `recordatorio_turno` | Hola {{1}}, te esperamos mañana a las {{2}} para tu {{3}} con {{4}}. Botones de respuesta rápida: "Confirmo" y "Cancelo" |
| `aviso_plazo` | Hola {{1}}, si necesitás cambiar tu turno del {{2}}, tenés tiempo hasta hoy a las {{3}} sin perder la seña: {{4}} |
| `turno_disponible` | Hola {{1}}, se liberó un turno con {{2}} el {{3}} a las {{4}}. Si lo querés, reservalo acá: {{5}} (probablemente Meta la clasifique como *Marketing*) |

Variables: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN` (token permanente de usuario del sistema), `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (cualquier texto). Webhook: `https://TU-DOMINIO/api/v1/webhooks/whatsapp`, suscripto a `messages`. Si WhatsApp falla o la clienta no tiene celular, el aviso sale por email.

### 5. Email

Cuenta gratuita en [Resend](https://resend.com) con el dominio del centro verificado: `EMAIL_API_KEY` y `EMAIL_FROM`.

### 6. Hosting (planes gratuitos)

- **API en Render** (web service): build `npm install`, start `npm run start --workspace apps/api`, `NODE_ENV=production`, `TRUST_PROXY_HOPS=2`, `WEB_ORIGIN=https://TU-DOMINIO` y el resto de `apps/api/.env.example`. `ENABLE_DEV_OUTBOX` vacío.
- **Web en Vercel**: raíz `apps/web`. En `apps/web/vercel.json` reemplazar la URL de la API: Vercel reenvía `/api/*` a Render, así web y API comparten dominio y la sesión funciona.
- **Tareas programadas**: en [cron-job.org](https://cron-job.org), cada 5 minutos, `POST https://TU-DOMINIO/api/v1/internal/tick` con el header `x-cron-secret: <CRON_SECRET>`. Vence reservas sin pagar y saldos a favor, manda recordatorios y avisos de plazo, procesa la lista de espera, reintenta webhooks, concilia pagos, renueva tokens de Mercado Pago, recalcula clientas cumplidoras y aplica la retención de datos (2 años desde el último turno). De paso mantiene despierta la API del plan gratuito.

## Pendiente o a decidir

- Plantillas de WhatsApp: hay que aprobarlas en Meta antes de usar el número real.
- Feriados: los carga la dueña desde Administración (no vienen precargados).
- La cancelación por WhatsApp ("Cancelo") solo funciona para clientas con cuenta creada; si no, se les pide que escriban al centro.
