/**
 * Registers the Telegram webhook for the production deployment.
 * Runs at the end of `buildCommand` on Vercel; a no-op outside production
 * builds or when the Telegram subsystem is disabled. Idempotent: Telegram
 * accepts repeated setWebhook calls with the same URL, so every prod deploy
 * simply re-asserts the webhook (and repairs it if polling removed it).
 */

const { VERCEL_ENV, VERCEL_PROJECT_PRODUCTION_URL } = process.env;
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

// The deploy button suggests '-' as an explicit "disabled" placeholder.
const telegramOff =
  process.env.TELEGRAM_ENABLED === 'false' || !token || token === '-';

if (VERCEL_ENV !== 'production') {
  console.log('tg-set-webhook: not a production build, skipping');
  process.exit(0);
}
if (telegramOff) {
  console.log('tg-set-webhook: Telegram is disabled, skipping');
  process.exit(0);
}
if (!secret || secret === '-') {
  console.warn(
    'tg-set-webhook: TELEGRAM_WEBHOOK_SECRET is missing — the webhook route would reject every update with 401, skipping registration',
  );
  process.exit(0);
}
if (!VERCEL_PROJECT_PRODUCTION_URL) {
  console.warn('tg-set-webhook: VERCEL_PROJECT_PRODUCTION_URL is missing, skipping');
  process.exit(0);
}

const url = `https://${VERCEL_PROJECT_PRODUCTION_URL}/api/telegram/webhook`;
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url,
    secret_token: secret,
    // Keep in sync with the update types handled in lib/telegram/webhook.ts.
    allowed_updates: ['message', 'callback_query'],
  }),
});
const body = (await res.json().catch(() => null)) as {
  ok?: boolean;
  description?: string;
} | null;

if (!res.ok || !body?.ok) {
  // A Telegram hiccup must not fail the whole production deploy: log loudly,
  // exit 0. The next deploy (or a manual setWebhook) re-registers it.
  console.error(
    `tg-set-webhook: setWebhook failed (HTTP ${res.status}): ${body?.description ?? 'no description'}`,
  );
  process.exit(0);
}
console.log(`tg-set-webhook: webhook registered at ${url}`);
