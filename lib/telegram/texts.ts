import { APP_NAME, STALE_WALK_HOURS } from '@/lib/config';
import { formatDuration, formatKm, plural } from '@/lib/format';

/**
 * Тексты Telegram-уведомлений (п. 6.10.4 ТЗ). Чистый модуль без БД.
 *
 * Тон — хинтовый (п. 6.6): шутим про ходьбу, дорожку, кресло и статистику —
 * никогда про тело, вес, еду, здоровье и возраст. По несколько вариантов на
 * событие, выбор случайный; LLM в этом контуре не используется — объём мал,
 * а цена ошибки в личке выше, чем в общей ленте.
 */

/** Случайный вариант — маленький тираж, Фишер — Йетс здесь избыточен. */
function pick<T>(variants: readonly T[]): T {
  return variants[Math.floor(Math.random() * variants.length)];
}

const days = (n: number): string => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
const workdays = (n: number): string =>
  `${n} ${plural(n, 'рабочий день', 'рабочих дня', 'рабочих дней')}`;

/** Старт прогулки — тихое, с кнопкой «Это не я» (п. 6.10.4). */
export function startText(i: { speedKmh: number; treadmillName: string }): string {
  return pick([
    `🚶 Поехали: ${i.speedKmh} км/ч на «${i.treadmillName}».`,
    `🚶 Старт: «${i.treadmillName}», ${i.speedKmh} км/ч. Кресло остаётся в одиночестве.`,
    `🚶 «${i.treadmillName}» пришла в движение — ${i.speedKmh} км/ч. Если это не ты, кнопка ниже.`,
  ]);
}

/** Финиш — главное сообщение продукта: км, время, серия, место, достижения. */
export function finishText(i: {
  distanceKm: number;
  durationSec: number;
  avgSpeedKmh: number;
  streakDays: number;
  rankCurrent: number;
  rankPrevious: number | null;
  achievements: string[];
}): string {
  const lines: string[] = [];

  let stats = `🏁 ${formatKm(i.distanceKm)} км за ${formatDuration(i.durationSec)} (${i.avgSpeedKmh} км/ч).`;
  if (i.streakDays > 0) stats += ` Серия — ${days(i.streakDays)}.`;
  lines.push(stats);

  // Про место — только когда есть чем гордиться: падение в рейтинге не комментируем.
  if (i.rankPrevious !== null && i.rankCurrent < i.rankPrevious) {
    lines.push(`📈 Ты поднялся на ${i.rankCurrent}-е место.`);
  }

  for (const title of i.achievements) {
    lines.push(`🏅 Новое достижение: «${title}»`);
  }

  lines.push(
    pick([
      'Кресло сегодня проиграло всухую.',
      'Дорожка передаёт спасибо.',
      'Статистика пополнена — диктор доволен.',
      'Ещё одна строка в летописи ходьбы.',
    ]),
  );

  return lines.join('\n');
}

/** Автозакрытие (п. 7.6): дистанция не записана — человек должен узнать сразу. */
export function autocloseText(): string {
  return pick([
    `⏸ Прогулка закрыта автоматически: прошло ${STALE_WALK_HOURS} часов, а «Финиш» так никто и не нажал. Дистанция не записана.`,
    `⏸ Дорожка ${STALE_WALK_HOURS} часов ждала кнопку «Финиш» и сдалась — прогулка закрыта автоматически, дистанция не записана.`,
    `⏸ Прогулка висела дольше ${STALE_WALK_HOURS} часов и закрыта автоматически. Километры не записаны — в следующий раз жми «Финиш».`,
  ]);
}

/** «Была занята 40 минут» / «1 ч 20 мин»; null — меньше минуты, фразу опускаем. */
function busyFor(busySec: number): string | null {
  // floor, не round: 40 секунд — это ещё не «1 минута», фразу честнее опустить.
  const min = Math.floor(busySec / 60);
  if (min < 1) return null;
  if (min < 60) return `${min} ${plural(min, 'минуту', 'минуты', 'минут')}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ${plural(h, 'час', 'часа', 'часов')}`;
}

/**
 * «Дорожка освободилась» (п. 6.10.4): скоропортящееся событие, формулировка —
 * «только что освободилась», а не «свободна сейчас»: это подсказка, не бронь.
 */
export function freeText(i: { treadmillName: string; busySec: number }): string {
  const busy = busyFor(i.busySec);
  const tail = busy !== null ? ` — была занята ${busy}` : '';
  return pick([
    `🟢 «${i.treadmillName}» только что освободилась${tail}. Кто первый?`,
    `🟢 «${i.treadmillName}» снова свободна${tail}. Очередь рассосалась — момент твой.`,
    `🟢 Место на «${i.treadmillName}» освободилось${tail}. Двадцать минут шага сами себя не пройдут.`,
  ]);
}

/**
 * Напоминание «пора размяться» (п. 6.10.4): текст обязан давать конкретный
 * повод, а не констатировать вину. Серия под угрозой — игровая механика;
 * «вы не ходили N дней» — табель учёта, так нельзя.
 */
export function remindText(i: {
  idleWorkdays: number;
  streakDays: number;
  freezesLeft: number;
}): string {
  if (i.streakDays > 0) {
    const streak = days(i.streakDays);
    const freezes = `${plural(i.freezesLeft, 'Осталась', 'Осталось', 'Осталось')} ${i.freezesLeft} ${plural(i.freezesLeft, 'заморозка', 'заморозки', 'заморозок')}.`;
    return pick([
      `Серия ${streak} под угрозой — сегодня решается. ${freezes}`,
      `Дорожка стоит ${workdays(i.idleWorkdays)} и смотрит в окно. Серия ${streak} пока цела — сегодня последний шанс. ${freezes}`,
      `${workdays(i.idleWorkdays)} без прогулок, а серия ${streak} всё ещё держится. Один заход сегодня — и она живёт дальше. ${freezes}`,
    ]);
  }

  return pick([
    `Дорожка не видела тебя ${workdays(i.idleWorkdays)}. Она не обижается — просто медленно покрывается пылью.`,
    `Кресло празднует ${workdays(i.idleWorkdays)} безраздельной власти. Дорожка предлагает государственный переворот.`,
    `${workdays(i.idleWorkdays)} тишины в статистике. Двадцать минут шага — и график снова оживёт.`,
  ]);
}

/** Недельный дайджест — понедельник, тихое (п. 6.10.4). */
export function digestText(i: {
  weekKm: number;
  passedCity: string;
  top: Array<{ name: string; km: number }>;
  selfRank: number | null;
  selfKm: number;
}): string {
  const lines: string[] = [];

  lines.push(
    pick([
      `Неделя закрыта: команда +${formatKm(i.weekKm)} км. Последняя отметка на маршруте — ${i.passedCity} 🎉`,
      `Итоги недели: +${formatKm(i.weekKm)} км на общий счёт. На карте команда прошла отметку «${i.passedCity}».`,
      `Ещё ${formatKm(i.weekKm)} км позади. Маршрут показывает: ${i.passedCity} уже за спиной.`,
    ]),
  );

  if (i.top.length > 0) {
    lines.push(`Топ-3: ${i.top.map((t) => `${t.name} ${formatKm(t.km)}`).join(' · ')}.`);
  }

  if (i.selfRank !== null) {
    lines.push(`Ты — ${i.selfRank}-й (${formatKm(i.selfKm)} км).`);
  } else {
    lines.push(
      pick([
        'Твоя неделя прошла без километров — новая начинается с чистого листа.',
        'У тебя на этой неделе 0.00 км. Дорожка готова это исправить в любой момент.',
      ]),
    );
  }

  return lines.join('\n');
}

/** Приветствие после привязки: что будет приходить и как этим управлять. */
export function welcomeText(name: string): string {
  const hello = pick([
    `Привет, ${name}! Telegram привязан — теперь дорожка умеет писать первой.`,
    `${name}, на связи! Карточка привязана, канал открыт.`,
    `Готово, ${name}: этот чат теперь знает о твоих прогулках всё.`,
  ]);
  return [
    hello,
    '',
    'Что буду присылать:',
    '• старт — с кнопкой «Это не я», если стартовали за тебя',
    '• финиш: километры, серия, достижения',
    '• напоминание, если дорожка заскучала',
    '• «дорожка освободилась», когда были заняты все',
    '• недельный дайджест по понедельникам',
    '',
    'Каждая категория выключается отдельно: /settings. Пауза — /mute, отвязка — /stop.',
  ].join('\n');
}

/** В вытесненный чат при перепривязке (п. 6.10.3). */
export function relinkedText(name: string): string {
  return pick([
    `Карточка «${name}» теперь привязана к другому Telegram — уведомления сюда больше не ходят. Если это сюрприз, возьми новую ссылку в приложении и верни всё как было.`,
    `Связь с карточкой «${name}» переехала в другой чат. Уведомления здесь остановлены; вернуть привязку можно свежей ссылкой из приложения.`,
  ]);
}

/** Ответ на незнакомые сообщения в привязанном чате. */
export function helpText(): string {
  return [
    'Я умею немного, но по делу:',
    '/settings — какие уведомления присылать',
    '/mute — заглушить на день, неделю или навсегда',
    '/stop — отвязать Telegram',
    '',
    `Всё остальное — старт, финиш, рейтинг — живёт в приложении ${APP_NAME}.`,
  ].join('\n');
}

/** Прощание после `/stop`. */
export function farewellText(): string {
  return pick([
    'Отвязал. Дорожка не в обиде — она вообще редко обижается. Захочешь вернуться — свежая ссылка ждёт в приложении.',
    'Связь разорвана, статистика цела. Новая ссылка привязки — в карточке участника, когда надумаешь.',
    'Больше ни одного сообщения. Дорожка будет молча скучать; ссылка на возвращение — в приложении.',
  ]);
}

/** Повторный или просроченный токен привязки (п. 6.10.3). */
export function staleTokenText(): string {
  return pick([
    'Ссылка устарела или уже использована. Возьми свежую в приложении — в карточке участника.',
    'Этот токен своё отжил: ссылки привязки одноразовые. Новая ждёт в приложении, в карточке участника.',
  ]);
}
