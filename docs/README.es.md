<p align="right"><a href="../README.md">English</a> · <a href="README.ru.md">Русский</a> · <b>Español</b></p>

<p align="center">
  <img src="screenshots/header.png" alt="TeamWalk — walk together, compete gently, ship steps. Un tracker interno de la cinta de andar de la oficina para equipos: sin cuentas ni autenticación — para equipos que confían entre sí y solo quieren caminar más." width="100%">
</p>

<p align="center">
  <a href="https://github.com/attack-it/teamwalk/actions/workflows/ci.yml"><img src="https://github.com/attack-it/teamwalk/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://attack-it.github.io/teamwalk/"><img src="https://img.shields.io/badge/landing-live-e8933a" alt="Landing"></a>
  <img src="https://img.shields.io/badge/Next.js_16-App_Router-black?logo=nextdotjs" alt="Next.js 16">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/Drizzle-Neon_Postgres-C5F74F?logo=drizzle&logoColor=black" alt="Drizzle + Neon">
  <a href="../LICENSE"><img src="https://img.shields.io/github/license/attack-it/teamwalk?color=a3e635" alt="License"></a>
</p>

Quién caminó, cuándo y cuánto — con tabla de clasificación, rachas, logros, una ruta de equipo compartida por ciudades reales y un ticker de pistas humorísticas generadas a partir de datos reales. **Sin autenticación por diseño**: te eliges de una lista y empezar una caminata es un solo toque. Haz el tour en la [landing](https://attack-it.github.io/teamwalk/).

## Características

- **Caminatas de un toque** — elígete, elige velocidad, cuenta atrás 3-2-1-GO; cronómetro en vivo, distancia, progreso hacia el récord del día y un caminante pixelado animado.
- **Clasificación y podio** — semana / mes / siempre; las semanas empiezan el lunes a las 00:00 MSK.
- **Rachas con congelaciones** — solo días laborables; 2 congelaciones automáticas al mes absorben un día perdido.
- **20 logros por carácter, no por volumen** — Madrugador, Zen, Maratón y compañía.
- **Ruta de equipo** — los kilómetros de todos mueven al equipo por una ruta real («Yaroslavl → Lisboa»).
- **Ticker de pistas** — frases al estilo de pantallas de carga de videojuegos, montadas por un LLM a partir de estadísticas anonimizadas.
- **Bot de Telegram (opcional)** — resúmenes, recordatorios, «la cinta está libre», resumen de los lunes.

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

La app habla el protocolo SQL-over-HTTP de Neon, así que el stack es app + Postgres + [Neon HTTP proxy](https://github.com/TimoWilhelm/local-neon-http-proxy) — todo cableado en [`docker-compose.yml`](../docker-compose.yml):

```bash
NEXT_PUBLIC_LOCALE=es docker compose up --build   # en (por defecto), ru o es
```

Eso es todo: Postgres arranca con la tabla del control plane ya sembrada, las migraciones corren al iniciar la app y esta escucha en <http://localhost:3000>. El idioma se inserta en tiempo de build — reconstruye la imagen para cambiarlo. Para Telegram o pistas LLM, descomenta las variables en `docker-compose.yml` ([Variables de entorno](#variables-de-entorno)).

Para apuntar el contenedor a un Neon en la nube, ejecuta solo la imagen de la app con tu `DATABASE_URL`:

```bash
docker build -t teamwalk --build-arg NEXT_PUBLIC_LOCALE=es .
docker run -p 3000:3000 -e DATABASE_URL=postgres://…neon.tech/… teamwalk
```

## Variables de entorno

| Variable | Obligatoria | Propósito |
|---|---|---|
| `DATABASE_URL` | sí | Neon Postgres, conexión pooled |
| `NEXT_PUBLIC_LOCALE` | no | Idioma del producto: `en` (por defecto), `ru`, `es`; se inserta en build |
| `TELEGRAM_BOT_TOKEN` | no | Bot de @BotFather; sin él todo el subsistema de Telegram está apagado |
| `TELEGRAM_WEBHOOK_SECRET` | no | Secreto del webhook (`setWebhook … secret_token`) |
| `CRON_SECRET` | no | Protege `/api/cron/notify` (Vercel Cron lo envía él mismo) |
| `ACCESS_PIN` | no | PIN de acceso para todo el despliegue: si está definido, las páginas y la API requieren desbloqueo vía `/pin` (la cookie dura ~1 año); vacío/sin definir = acceso abierto; cambiarlo cierra la sesión de todos los dispositivos |

La lista completa con valores por defecto (pistas LLM, ventanas de avisos, nombre de la app) está documentada en [`.env.example`](../.env.example).

## Contribuir

Los PR son bienvenidos. Crea una rama desde `main`, comprueba que `npm run typecheck` y `npm test` pasan, y abre un pull request — la CI ejecuta las mismas dos comprobaciones y cada rama recibe un preview deploy con su propia rama de BD copy-on-write.

## Créditos

Kit de UI — [8bitcn/ui](https://8bitcn.com) sobre [shadcn/ui](https://ui.shadcn.com) · iconos — [pixelarticons](https://pixelarticons.com) (MIT) · avatares — [DiceBear](https://dicebear.com) `pixel-art` · fuentes y sprites generados en el repo.

Distribuido bajo la licencia [MIT](../LICENSE).
