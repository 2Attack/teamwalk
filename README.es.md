<p align="right"><a href="README.md">English</a> · <a href="README.ru.md">Русский</a> · <b>Español</b></p>

<p align="center">
  <img src="docs/screenshots/header.png" alt="TeamWalk — walk together, compete gently, ship steps. Un tracker interno de la cinta de andar de la oficina para equipos: sin cuentas ni autenticación — para equipos que confían entre sí y solo quieren caminar más." width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js_16-App_Router-black?logo=nextdotjs" alt="Next.js 16">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4">
  <img src="https://img.shields.io/badge/Drizzle-Neon_Postgres-C5F74F?logo=drizzle&logoColor=black" alt="Drizzle + Neon">
  <img src="https://img.shields.io/badge/tested_with-Vitest-6E9F18?logo=vitest&logoColor=white" alt="Vitest">
  <img src="https://img.shields.io/badge/license-MIT-a3e635" alt="MIT license">
</p>

Quién caminó, cuándo y cuánto — con tabla de clasificación, rachas, logros, una ruta de equipo compartida por ciudades reales y un ticker de pistas humorísticas generadas a partir de datos reales. Construido según la especificación de [`TeamWalk_TZ.md`](TeamWalk_TZ.md) (referida en el código como «spec § N»). **Sin autenticación por diseño**: te eliges de una lista y empezar una caminata es un solo toque.

## Características

- **Caminatas de un toque** — elígete, elige velocidad, cuenta atrás 3-2-1-GO; cronómetro en vivo, distancia, progreso hacia el récord del día y un caminante pixelado animado.
- **Clasificación y podio** — semana / mes / siempre; las semanas empiezan el lunes a las 00:00 MSK.
- **Rachas con congelaciones** — solo días laborables; 2 congelaciones automáticas al mes absorben un día perdido.
- **20 logros por carácter, no por volumen** — Madrugador, Zen, Maratón y compañía.
- **Ruta de equipo** — los kilómetros de todos mueven al equipo por una ruta real («Yaroslavl → Lisboa»).
- **Ticker de pistas** — frases al estilo de pantallas de carga de videojuegos, montadas por un LLM a partir de estadísticas anonimizadas.
- **Bot de Telegram (opcional)** — resúmenes, recordatorios, «la cinta está libre», resumen de los lunes.
- **UI pixel-art** — 8bitcn sobre shadcn, siempre oscuro, PWA, mobile-first.
- **Tres idiomas** — en / ru / es, uno por despliegue.

## Inicio rápido

Requiere Node.js 20+ y una base [Neon](https://neon.tech) Postgres.

```bash
npm install
cp .env.example .env.local        # pon tu DATABASE_URL de Neon
npm run db:migrate                # esquema + seed de la cinta
npm run dev
```

La app funciona completa sin credenciales de LLM (el ticker rota un catálogo estático) y sin token de Telegram (las notificaciones simplemente están apagadas).

## Despliegue

### Vercel (un clic)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fattack-it%2Fteamwalk&env=NEXT_PUBLIC_LOCALE,TELEGRAM_ENABLED,TELEGRAM_BOT_TOKEN,TELEGRAM_WEBHOOK_SECRET,CRON_SECRET&envDescription=UI%20locale%3A%20en%2C%20ru%20or%20es.%20Telegram%3A%20paste%20the%20bot%20token%20from%20%40BotFather%2C%20or%20set%20TELEGRAM_ENABLED%3Dfalse%20and%20put%20%27-%27%20in%20the%20token%20fields.%20TELEGRAM_WEBHOOK_SECRET%20and%20CRON_SECRET%3A%20any%20random%20strings.&envLink=https%3A%2F%2Fgithub.com%2Fattack-it%2Fteamwalk%23readme&project-name=teamwalk&repository-name=teamwalk&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%7D%5D)

El botón hace fork del repo, pide las variables (idioma, bot de Telegram opcional, secreto del cron) y aprovisiona un **Neon Postgres** del Marketplace — `DATABASE_URL` se inyecta automáticamente y `buildCommand` ejecuta las migraciones. Si se proporciona un token de Telegram, cada deploy de producción registra además el webhook del bot (`scripts/tg-set-webhook.mts`) — no hace falta ejecutar `setWebhook` a mano. Las pistas con LLM funcionan de serie: en Vercel el AI SDK se autentica con el `VERCEL_OIDC_TOKEN` automático.

La configuración manual son los mismos tres pasos: importar el repo → añadir Neon Postgres desde Storage → desplegar desde `main`. Cualquier otra rama recibe una preview con su propia rama de BD copy-on-write.

### Docker (self-hosted)

La app habla el protocolo SQL-over-HTTP de Neon, así que el stack es app + Postgres + [Neon HTTP proxy](https://github.com/TimoWilhelm/local-neon-http-proxy) — todo cableado en [`docker-compose.yml`](docker-compose.yml):

```bash
NEXT_PUBLIC_LOCALE=es docker compose up --build   # en (por defecto), ru o es
```

Eso es todo: Postgres arranca con la tabla del control plane ya sembrada, las migraciones corren al iniciar la app y esta escucha en <http://localhost:3000>. El idioma se inserta en tiempo de build — reconstruye la imagen para cambiarlo. Para Telegram o pistas LLM, descomenta las variables en `docker-compose.yml` ([Variables de entorno](#variables-de-entorno)).

Para apuntar el contenedor a un Neon en la nube, ejecuta solo la imagen de la app con tu `DATABASE_URL`:

```bash
docker build -t teamwalk --build-arg NEXT_PUBLIC_LOCALE=es .
docker run -p 3000:3000 -e DATABASE_URL=postgres://…neon.tech/… teamwalk
```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | `tsc --noEmit` — la comprobación principal |
| `npm test` | Tests unitarios (Vitest) |
| `npm run db:migrate` | Aplica `drizzle/*.sql` en orden, idempotente |
| `npm run gen:assets` | Regenera los estáticos: avatares, sprite del caminante, iconos |

## Variables de entorno

| Variable | Obligatoria | Propósito |
|---|---|---|
| `DATABASE_URL` | sí | Neon Postgres, conexión pooled |
| `AI_GATEWAY_API_KEY` | no | Vercel AI Gateway (pistas + borradores de rutas); en despliegues de Vercel el AI SDK usa el `VERCEL_OIDC_TOKEN` automático |
| `AI_GATEWAY_MODEL` | no | Modelo del Gateway, por defecto `xai/grok-4.1-fast-non-reasoning` |
| `HINTS_ENABLED` | no | `false` → solo catálogo estático de frases, sin LLM |
| `TELEGRAM_BOT_TOKEN` | no | Bot de @BotFather; sin él todo el subsistema de Telegram está apagado |
| `TELEGRAM_WEBHOOK_SECRET` | no | Secreto del webhook (`setWebhook … secret_token`) |
| `TELEGRAM_ENABLED` | no | `false` → el bot calla, el panel de vinculación se oculta |
| `CRON_SECRET` | no | Protege `/api/cron/notify` (Vercel Cron lo envía él mismo) |
| `NOTIFY_WINDOW_START_HOUR` / `NOTIFY_WINDOW_END_HOUR` | no | Ventana diurna de recordatorios y resumen, por defecto 11–17 MSK |
| `FREE_WINDOW_START_HOUR` / `FREE_WINDOW_END_HOUR` | no | Ventana de avisos «la cinta se ha liberado», por defecto 9–19 MSK |
| `NEXT_PUBLIC_APP_NAME` | no | Nombre en la cabecera, por defecto `TeamWalk` |
| `NEXT_PUBLIC_LOCALE` | no | Idioma del producto: `en` (por defecto), `ru`, `es` |

## Localización

Un idioma por despliegue, definido por `NEXT_PUBLIC_LOCALE`: UI, errores de API, catálogo de pistas, prompts del LLM y textos del bot. La variable **se inserta en el bundle del cliente en tiempo de build** — cambiar el idioma implica redesplegar. Los diccionarios viven en `lib/i18n/messages/{ru,en,es}.ts`; `ru` es la referencia y el tipo `Messages` garantiza la paridad completa de claves.

## Créditos

Kit de UI — [8bitcn/ui](https://8bitcn.com) sobre [shadcn/ui](https://ui.shadcn.com) · iconos — [pixelarticons](https://pixelarticons.com) (MIT) · avatares — [DiceBear](https://dicebear.com) `pixel-art` · fuentes y sprites generados en el repo.

Distribuido bajo la licencia [MIT](LICENSE).
