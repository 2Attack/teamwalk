/**
 * Локальный Telegram-мост для разработки: long polling вместо webhook.
 *
 * Telegram не может достучаться до localhost, поэтому апдейты забираются
 * поллингом (grammY даёт устойчивый цикл с ретраями и бэкоффом) и
 * пробрасываются в наш обычный webhook-эндпоинт с тем же секретным
 * заголовком, что шлёт Telegram. Боевой код при этом прогоняется целиком:
 * проверка секрета, дедупликация по update_id, вся логика бота.
 *
 * Запуск: `npm run dev:tg` (рядом с работающим `npm run dev`).
 *
 * ВНИМАНИЕ: `bot.start()` снимает у бота зарегистрированный webhook —
 * запускать только с дев-ботом, не с токеном боевого.
 */
import { Bot } from 'grammy';

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const target = process.env.TG_BRIDGE_TARGET ?? 'http://localhost:3000/api/telegram/webhook';

if (!token || !secret) {
  console.error('Нужны TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET (см. .env.development.local).');
  process.exit(1);
}

const bot = new Bot(token);

// Один универсальный обработчик до любых фильтров: апдейт уходит в наш
// webhook как есть, разбором занимается только боевой processTelegramUpdate.
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
    console.error('мост не дотянулся до дев-сервера:', error?.message ?? error);
  }
});

bot.catch((error) => {
  console.error('мост споткнулся:', error?.message ?? error);
});

await bot.init();
console.log(`мост @${bot.botInfo.username} → ${target}`);
await bot.start();
