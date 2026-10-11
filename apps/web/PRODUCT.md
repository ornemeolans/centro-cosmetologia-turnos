# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Clientas** de un centro de cosmetología en Buenos Aires. Llegan desde WhatsApp o Instagram y usan casi siempre el **celular**. Su trabajo: reservar un turno (elegir profesional, tratamiento y horario), pagar la seña con Mercado Pago, agregarlo al calendario, reprogramar o cancelar a tiempo, leer las recomendaciones de su cosmetóloga y anotarse en lista de espera.
- **Profesionales (cosmetólogas)**: usan **computadora** en el centro. Manejan su agenda del día, las fichas clínicas de sus clientas (antecedentes, consentimientos, fotos antes/después, historia, recomendaciones), su configuración (horarios, tratamientos, % de seña, combos) y sus reportes.
- **Recepción**: computadora en el centro. Ve todas las agendas, crea perfiles de primera vez y agenda turnos. No ve datos clínicos.
- **Dueña (OWNER)**: todo lo anterior más equipo, accesos, reglas del centro y tablero general.

## Product Purpose

Que reservar un tratamiento estético sea tan simple como mandar un mensaje, sin perder el control del centro: la seña asegura el horario, los recordatorios reducen ausencias y la ficha clínica queda ordenada y privada. Éxito = clientas que reservan y vuelven sin fricción, menos ausencias y una agenda que el equipo entiende de un vistazo.

## Positioning

Un sistema hecho para un centro chico y cercano, no una plataforma genérica de reservas: la clienta reserva con *su* cosmetóloga, las reglas son las del centro (2 días hábiles para cambios, saldo a favor, prioridad a clientas cumplidoras) y los datos de salud se tratan con cuidado.

## Operating Context

- Primer turno siempre por WhatsApp del centro; recepción crea el perfil.
- Turnos encadenados según la duración del tratamiento + 15 min entre turnos.
- Seña = % del precio fijado por cada profesional; se cobra en la cuenta de Mercado Pago de esa profesional; el saldo se paga en el local.
- Confirmaciones y recordatorios por WhatsApp (Meta), email de respaldo desde Gmail del centro.
- Reglas: cambios sin perder la seña hasta 2 días hábiles completos antes del día del turno; máximo 2 reprogramaciones; saldo a favor 30 días; ausencia o cancelación tardía pierde la seña.

## Capabilities and Constraints

- React + Vite + Tailwind v4 en `apps/web`; API Express en Render; base en Supabase. Español de Argentina (voseo).
- Roles: CLIENT, PROFESSIONAL, RECEPTION, OWNER.
- Hosting gratuito: la API puede tardar ~50 s en despertar; la interfaz tiene que tolerar esperas.
- Nombre del centro **provisorio**: "Centro de Cosmetología" (variable `VITE_CENTER_NAME`).

## Brand Commitments

Sin marca previa: no hay nombre definitivo, logo, colores ni tipografía. El diseño define el tono y tiene que admitir el nombre real más adelante sin rehacerse.

## Evidence on Hand

No hay fotos del centro, testimonios, logo ni precios reales. No inventar ninguno: los textos de ejemplo usan datos de prueba y nada de testimonios ni métricas.

## Product Principles

1. La clienta reserva desde el celular en menos de un minuto, con el costo y las reglas a la vista antes de pagar.
2. El equipo lee la agenda de un vistazo: estado, primera vez, seña y clienta cumplidora sin abrir nada.
3. Los datos de salud se sienten privados y cuidados, nunca expuestos.
4. Calidez de un centro chico, sin cursilería ni estética de spa genérico.

## Accessibility & Inclusion

Público amplio (todas las edades) en celulares de gama media: texto legible, contraste AA, áreas táctiles cómodas y que todo funcione sin depender del color solo.
