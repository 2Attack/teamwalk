/**
 * Local Telegram bridge for development: long polling instead of a webhook.
 *
 * Telegram cannot reach localhost, so updates are fetched by polling (grammY
 * provides a resilient loop with retries and backoff) and forwarded to our
 * regular webhook endpoint with the same secret header Telegram sends. The
 * production code path runs in full: secret check, update_id deduplication,
 * all bot logic.
 *
 * Run: `npm run dev:tg` (alongside a running `npm run dev`).
 *
 * WARNING: `bot.start()` removes the bot's registered webhook — run only
 * with the dev bot, never with the production token.
 */
import { Bot } from 'grammy';

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const target = process.env.TG_BRIDGE_TARGET ?? 'http://localhost:3000/api/telegram/webhook';

if (!token || !secret) {
  console.error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required (see .env.development.local).');
  process.exit(1);
}

const bot = new Bot(token);

// One catch-all handler before any filters: the update goes to our webhook
// as-is; only the production processTelegramUpdate does the parsing.
bot.use(async (ctx) => {
  const kind = ctx.message
    ? `message «${ctx.message.text ?? '…'}»`
    : ctx.callbackQuery
      ? `callback «${ctx.callbackQuery.data ?? '…'}»`
      : `update #${ctx.update.update_id}`;

  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': secret,
      },
      body: JSON.stringify(ctx.update),
      signal: AbortSignal.timeout(30_000),
    });
    console.log(new Date().toLocaleTimeString('ru'), kind, '→', res.status);
  } catch (error) {
    console.error('bridge could not reach the dev server:', error?.message ?? error);
  }
});

bot.catch((error) => {
  console.error('bridge stumbled:', error?.message ?? error);
});

await bot.init();
console.log(`bridge @${bot.botInfo.username} → ${target}`);
await bot.start();
