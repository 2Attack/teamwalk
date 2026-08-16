<p align="right"><a href="README.md">English</a> · <a href="README.ru.md">Русский</a> · <b>Español</b></p>

# TeamWalk

**Un tracker interno para la cinta de andar de la oficina: quién caminó, cuándo y cuánto — con clasificación, rachas, logros, una ruta de equipo compartida por ciudades reales y un ticker de pistas humorísticas generadas a partir de datos reales.**

![Next.js](https://img.shields.io/badge/Next.js_16-App_Router-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white)
![Drizzle ORM](https://img.shields.io/badge/Drizzle-Neon_Postgres-C5F74F?logo=drizzle&logoColor=black)
![Vitest](https://img.shields.io/badge/tested_with-Vitest-6E9F18?logo=vitest&logoColor=white)

<p align="center">
  <img src="docs/screenshots/home.png" alt="Inicio: ruta del equipo, tarjeta de inicio, podio y clasificación" width="68%">
  <img src="docs/screenshots/walk.png" alt="Caminata activa: temporizador, distancia, caminante pixel, control de velocidad y una pista" width="29%">
</p>

Construido según la especificación de [`TeamWalk_TZ.md`](TeamWalk_TZ.md) (el código y la documentación citan sus secciones como «spec § N»). **No hay autenticación por diseño** — el modelo de confianza es «gente de casa»: te eliges de una lista y empezar una caminata es un solo toque.

## Índice

- [Funcionalidades](#funcionalidades)
- [Tecnologías](#tecnologías)
- [Inicio rápido](#inicio-rápido)
- [Base de datos local sin nube](#base-de-datos-local-sin-nube)
- [Bot de Telegram en desarrollo](#bot-de-telegram-en-desarrollo)
- [Scripts](#scripts)
- [Variables de entorno](#variables-de-entorno)
- [Localización](#localización)
- [Despliegues preview](#despliegues-preview)
- [Despliegue en Vercel](#despliegue-en-vercel)
- [Arquitectura](#arquitectura)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Créditos](#créditos)

## Funcionalidades

- **Caminatas de un toque.** Te eliges, eliges velocidad (una fila de botones grandes, con tu última elección preseleccionada) y llega la cuenta atrás 3-2-1-GO. La pantalla activa muestra un temporizador `HH:MM:SS`, la distancia estimada en vivo, tu récord personal del día con progreso, cambios de velocidad en marcha y un caminante pixel animado. El diálogo de finalización rellena la distancia con velocidad × tiempo — la pantalla de la cinta sigue siendo la fuente de la verdad.
- **Clasificación y podio.** Podio top-3 y tabla completa (distancia, caminatas, racha, velocidad media real) por semana, mes o histórico. Las semanas empiezan el lunes a las 00:00 hora de Moscú.
- **Rachas con congelaciones.** Días laborables consecutivos con al menos una caminata; los fines de semana ni rompen ni alargan la racha, y 2 congelaciones automáticas al mes absorben un día perdido — un día de baja no mata meses de esfuerzo.
- **20 logros por carácter, no por volumen** — Madrugador, Búho nocturno, Zen (30 min a ≤2 km/h), Maratón, Control de crucero y compañía — para que el líder no los acapare todos.
- **Ruta del equipo.** Los kilómetros de todos se suman y mueven al equipo por una ruta real («Yaroslavl → Lisboa»). Las rutas se gestionan en un catálogo con exactamente una activa; un LLM puede redactar una nueva a partir de un texto — siempre como borrador revisado por humanos, nunca escrito directamente en la BD.
- **Ticker de pistas.** Frases al estilo de pantallas de carga de videojuegos que pican a participantes reales, montadas por un LLM a partir de un snapshot anonimizado de estadísticas reales. Las bromas van de caminar, de la cinta y de los números — nunca del cuerpo, el peso o la salud de nadie.
- **Bot de Telegram (opt-in).** Resúmenes de caminatas, logros, recordatorios de «toca estirar», «la cinta está libre» y un resumen de los lunes — con interruptores por categoría, `/mute` y baja con un solo comando. Vinculación por código QR renderizado en el cliente.
- **Varias cintas.** El selector aparece automáticamente en cuanto existe una segunda cinta activa; la BD garantiza una caminata activa por cinta y por participante.
- **UI pixel-art** (8bitcn sobre shadcn), siempre oscura, instalable como PWA, mobile-first — el teléfono junto a la cinta es el dispositivo principal.
- **Tres idiomas** — inglés, ruso, español — uno por despliegue (ver [Localización](#localización)).

## Tecnologías

Next.js 16 (App Router) · TypeScript strict · React 19 · Tailwind CSS 4 · Drizzle ORM ·
Neon Postgres (driver HTTP) · Zod · SWR · Motion · Vercel AI Gateway (AI SDK) · Vitest.

Iconos — [pixelarticons](https://pixelarticons.com) (MIT); avatares — DiceBear `pixel-art`. Ambos se commitean en tiempo de generación (`npm run gen:assets`); **no hay peticiones a terceros en runtime**.

## Inicio rápido

Requiere Node.js 20+ y una base Postgres de [Neon](https://neon.tech) (o el montaje local sin nube de abajo).

```bash
npm install
cp .env.example .env.local        # pon tu DATABASE_URL de Neon
npm run db:migrate                # esquema + seed de la cinta
npm run dev
```

El seed importa: sin una fila en `treadmills` no se puede empezar una caminata — la migración la crea automáticamente.

La app funciona por completo sin credenciales de LLM (el ticker rota un catálogo estático) y sin token de Telegram (las notificaciones simplemente están apagadas).

## Base de datos local sin nube

Neon sirve SQL por HTTP, así que un Postgres normal no funciona directamente. Para trabajar sin conexión se levanta la pareja «Postgres + Neon HTTP proxy»:

```bash
docker run -d --name cw-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=teamwalk \
  -p 5433:5432 postgres:16-alpine
docker run -d --name cw-neon-proxy -p 4444:4444 \
  -e PG_CONNECTION_STRING=postgres://postgres:postgres@host.docker.internal:5433/teamwalk \
  ghcr.io/timowilhelm/local-neon-http-proxy:main
```

Las versiones recientes del proxy consultan a un «control plane» la lista de IP permitidas antes de cada petición y sin ella responden `500 Control plane request failed`. Hay que crear la tabla una vez a mano; `db` es el nombre del endpoint, es decir, la primera etiqueta del host `db.localtest.me`:

```bash
docker exec -i cw-pg psql -U postgres -d teamwalk <<'SQL'
create schema if not exists neon_control_plane;
create table if not exists neon_control_plane.endpoints (
  endpoint_id varchar(255) primary key,
  allowed_ips varchar(255)
);
insert into neon_control_plane.endpoints (endpoint_id, allowed_ips)
values ('db', '0.0.0.0/0') on conflict (endpoint_id) do nothing;
SQL
```

Después pon la URL en **`.env.development.local`** — no en `.env.local`, que `vercel env pull` sobrescribe, y mejor no tocar las credenciales de producción. En dev este archivo tiene prioridad; `next build` con `NODE_ENV=production` lo ignora; bórralo para volver a la BD en la nube:

```
DATABASE_URL=postgres://postgres:postgres@db.localtest.me:4444/teamwalk?sslmode=require
```

El host `localtest.me` es la única señal que cambia el driver al endpoint local; esa rama nunca se activa en producción. Luego lo de siempre: `npm run db:migrate` y `npm run dev`.

## Bot de Telegram en desarrollo

Telegram no llega a localhost, así que en desarrollo se usa long polling en vez de webhook: `npm run dev:tg` (junto a un `npm run dev` en marcha) arranca un puente grammY que recoge las actualizaciones y las reenvía al `/api/telegram/webhook` normal con la misma cabecera secreta. El código de producción se ejecuta completo — comprobación del secreto, deduplicación, toda la lógica del bot.

Requiere `TELEGRAM_BOT_TOKEN` y `TELEGRAM_WEBHOOK_SECRET` en `.env.development.local` (o `.env.local`). Importante: el polling **elimina el webhook registrado del bot**, así que ejecuta el puente solo con un bot de desarrollo — crea uno aparte con @BotFather y nunca uses el token de producción.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run dev:tg` | Puente Telegram → localhost: long polling en vez de webhook (solo bot dev) |
| `npm run build` | Build de producción |
| `npm run typecheck` | `tsc --noEmit` — la comprobación principal |
| `npm test` | Tests unitarios (Vitest: rachas, distancia, post-filtro de pistas, validación, textos del bot) |
| `npm run db:migrate` | Aplica `drizzle/*.sql` en orden, idempotente |
| `npm run gen:assets` | Regenera los assets estáticos: avatares (DiceBear `pixel-art`), sprite del caminante, iconos |
| `npm run gen:icons` | Solo iconos: `lib/icons.generated.ts` a partir del paquete `pixelarticons` |

## Variables de entorno

| Variable | Obligatoria | Propósito |
|---|---|---|
| `DATABASE_URL` | sí | Neon Postgres, conexión pooled |
| `AI_GATEWAY_API_KEY` | no | Vercel AI Gateway — el único proveedor LLM (pistas + borradores de rutas); en despliegues de Vercel el AI SDK usa el `VERCEL_OIDC_TOKEN` automático |
| `AI_GATEWAY_MODEL` | no | Modelo del Gateway, por defecto `xai/grok-4.1-fast-non-reasoning` |
| `HINTS_ENABLED` | no | `false` → solo catálogo estático de frases, sin llamadas LLM |
| `HINTS_TTL_MINUTES` | no | Periodo de regeneración del pool de pistas, por defecto 60 |
| `HINTS_POOL_MAX` | no | Pistas por pool, por defecto 24 |
| `TELEGRAM_BOT_TOKEN` | no | Bot de @BotFather; sin él todo el subsistema de Telegram está apagado (spec § 6.10) |
| `TELEGRAM_WEBHOOK_SECRET` | no | Secreto del webhook (`setWebhook … secret_token`) y del puente local |
| `TELEGRAM_ENABLED` | no | `false` → el bot calla y el panel de vinculación se oculta |
| `CRON_SECRET` | no | Protege `/api/cron/notify` (Vercel Cron lo envía por sí mismo) |
| `NOTIFY_WINDOW_START_HOUR` / `NOTIFY_WINDOW_END_HOUR` | no | Ventana diurna de recordatorios y resumen, por defecto 11–17 MSK |
| `FREE_WINDOW_START_HOUR` / `FREE_WINDOW_END_HOUR` | no | Ventana de avisos «la cinta se ha liberado», por defecto 9–19 MSK |
| `NEXT_PUBLIC_APP_NAME` | no | Nombre en la cabecera, por defecto `TeamWalk` |
| `NEXT_PUBLIC_LOCALE` | no | Idioma del producto: `en` (por defecto), `ru`, `es` — ver [Localización](#localización) |

## Localización

Todo el producto se sirve en un idioma por despliegue, definido por `NEXT_PUBLIC_LOCALE`: UI, mensajes de error del API, catálogo de pistas, prompts del LLM y textos del bot de Telegram. No hay selector dentro de la app. La variable **se inserta en el bundle del cliente en tiempo de build** — cambiar de idioma significa redesplegar.

Los diccionarios viven en `lib/i18n/messages/{ru,en,es}.ts`; `ru` es la referencia y el tipo `Messages` exige paridad completa de claves. Los tests están fijados a `ru` (`vitest.config.ts`) porque los tests de contenido comprueban cadenas en ruso.

## Despliegues preview

El modelo es simple: `main` es producción, cualquier otra rama es un preview.

- Push de una rama → Vercel construye un despliegue preview con URL única.
- La integración de Neon tiene **preview branching** activado: para cada despliegue preview Neon crea una rama de BD `preview/<rama-git>` — un clon copy-on-write instantáneo de producción — e inyecta su `DATABASE_URL` solo en ese despliegue. Los previews nunca ven la BD de producción; la rama de BD se elimina junto al preview según la política de retención de Vercel.
- El `buildCommand` de `vercel.json` ejecuta `db:migrate` antes de cada build: cada despliegue migra su propia base — producción la suya, cada preview su rama. Los scripts son idempotentes; repetirlos es seguro.

```bash
git checkout -b feature/x && git push -u origin feature/x  # preview con su propia BD
git checkout main && git merge feature/x && git push       # prod: deploy + migraciones solas
```

Telegram está apagado en los previews (sin variables del bot el subsistema se desactiva solo); `@teamwalk_staging_bot` es para desarrollo local con `npm run dev:tg`. El cron de notificaciones (`/api/cron/notify`, diario a las 08:00 UTC según `vercel.json`) corre **solo en producción** — los previews usan el fallback perezoso que se ejecuta al acceder al API.

## Despliegue en Vercel

1. Repositorio en GitHub → importar en Vercel.
2. **Storage → Neon Postgres** (Marketplace): las variables se inyectan automáticamente.
3. No hace falta almacenamiento de archivos — los avatares viven en el repo y se sirven desde el CDN. DiceBear los dibuja solo durante `npm run gen:assets`: en runtime no hay llamadas a `api.dicebear.com`; de lo contrario una página de clasificación dispararía una docena de peticiones a terceros y la app perdería los avatares sin conexión.
4. LLM: activa AI Gateway en los ajustes del proyecto — en despliegues el AI SDK se autentica solo vía `VERCEL_OIDC_TOKEN`; en local necesitas un `AI_GATEWAY_API_KEY` (Dashboard → AI Gateway → API Keys). Sin credenciales las pistas rotan el catálogo estático.
5. Despliega desde `main`; cualquier otra rama recibe un preview.

Las caminatas «colgadas» no necesitan cron: las cierra una comprobación perezosa al acceder al API (spec § 7.6). El único trabajo programado es el barrido diario de notificaciones.

## Arquitectura

- **Nada de estado en la memoria del proceso.** La fuente de la verdad del temporizador es `walks.started_at`; el cliente calcula `Date.now() − startedAt`, así que recargar la página, un dispositivo dormido o cambiar de dispositivo nunca rompe el reloj.
- **La concurrencia la garantiza la BD, no el código.** Dos índices únicos parciales aseguran una caminata activa por participante y una por cinta; el API traduce `23505` a `409 WALK_ALREADY_ACTIVE` / `409 TREADMILL_BUSY`.
- **El LLM nunca está en el camino caliente.** El pool de pistas vive en `hints_cache`, se sirve al instante y se regenera en segundo plano (stale-while-revalidate bajo un mutex de una fila). Cadena de degradación: AI Gateway → pool anterior → catálogo estático.
- **Los datos personales no salen del perímetro.** El LLM recibe un snapshot anonimizado con slots `u1…uN`; los nombres reales se sustituyen de nuestro lado.
- **Rachas, récords y posición en la ruta nunca se guardan** — se calculan de `walks` al vuelo, así que borrar una caminata lo recalcula todo solo.
- **El tiempo solo a través de `lib/time.ts`** (`Europe/Moscow`, «días de oficina» como `YYYY-MM-DD`).

## Estructura del proyecto

```
app/            páginas y Route Handlers (26 endpoints de API)
components/     UI: kit pixel (components/ui/8bit), podio, clasificación, ticker de pistas
lib/db/         esquema Drizzle, cliente Neon, agregaciones
lib/hints/      snapshot, prompt, proveedores, post-filtro, caché, catálogo por idioma
lib/game/       rachas con congelaciones, logros, progreso del equipo
lib/telegram/   notificaciones, textos del bot por idioma, lógica del webhook
lib/i18n/       diccionarios en/ru/es, helpers fmt/plural
drizzle/        migraciones DDL
docs/CONTRACT.md   fronteras de zonas y firmas entre módulos
docs/8BITCN.md     reglas y minas del kit de UI
```

## Créditos

Kit de UI — [8bitcn/ui](https://8bitcn.com) sobre [shadcn/ui](https://ui.shadcn.com) · iconos — [pixelarticons](https://pixelarticons.com) (MIT) · avatares — [DiceBear](https://dicebear.com) `pixel-art` · fuentes y sprites generados en el repo.

Proyecto interno — sin licencia, todos los derechos reservados.
