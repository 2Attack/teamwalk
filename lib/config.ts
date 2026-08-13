/** Единая точка конфигурации приложения. Никаких «магических чисел» по коду. */

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'TeamWalk';

/** Часовой пояс офиса. Границы суток серии и недели считаются по нему (п. 6.8.5). */
export const TZ = 'Europe/Moscow';

/** Абсолютные санити-границы (продублированы в CHECK-констрейнтах БД). */
export const MIN_SPEED_KMH = 1;
export const MAX_SPEED_KMH_ABS = 25;
export const MIN_DISTANCE_KM = 0.01;
export const MAX_DISTANCE_KM = 50;

/** Дефолтная скорость для нового участника (п. 6.2). */
export const DEFAULT_SPEED_KMH = 4;

/** Прогулка активная дольше этого — забыта, автозакрывается (п. 7.6). */
export const STALE_WALK_HOURS = 8;

/** Окно удаления своей записи после завершения (п. 7.7). */
export const DELETE_WINDOW_MINUTES = 15;

/** Мягкие предупреждения в модалке завершения (п. 6.4). */
export const DISTANCE_MISMATCH_RATIO = 0.3;
export const SUSPICIOUS_AVG_SPEED_KMH = 10;

/** Предупреждения по длительности (п. 7.5). */
export const SHORT_WALK_WARN_SEC = 60;
export const SHORT_WALK_CANCEL_SEC = 10;

/** Заморозки серии в календарный месяц (п. 6.8.2). */
export const STREAK_FREEZES_PER_MONTH = 2;

/** Хинты. */
export const HINTS_ENABLED = process.env.HINTS_ENABLED !== 'false';
export const HINTS_TTL_MINUTES = Number(process.env.HINTS_TTL_MINUTES ?? 60);
export const HINTS_POOL_MIN = 8;
export const HINTS_POOL_MAX = 12;
/** Ниже этого числа после фильтрации пул добивается статикой (п. 6.6.4). */
export const HINTS_MIN_AFTER_FILTER = 6;
/*
  ТЗ (п. 8) называет 15 с, но на живом ключе Gemini Flash укладывается в них не
  всегда: «думающие» модели тратят 11–20 с, и обе попытки обрывались по таймауту.
  Пользователь этот запрос никогда не ждёт — генерация идёт фоном в waitUntil
  после отправки ответа, — поэтому запас увеличен. Горячий путь по-прежнему
  ограничен временем ответа `/api/hints`, а он к LLM не обращается вовсе.
*/
export const HINTS_LLM_TIMEOUT_MS = 45_000;
/** Участник моложе стольких дней не подкалывается (п. 6.6.7). */
export const HINTS_NEWCOMER_DAYS = 3;

/** Стартовый город виртуального маршрута (п. 6.6.8). */
export const ROUTE_HOME_CITY = 'Ярославль';

/**
 * Telegram-уведомления (п. 6.10). Без токена подсистема выключена целиком:
 * бот молчит, панель привязки не показывается — деградация той же формы,
 * что у LLM-ключей. На клиенте env-переменных нет, поэтому клиент узнаёт
 * состояние через `GET /api/users/:id/telegram`, а не из этой константы.
 */
export const TELEGRAM_ENABLED =
  process.env.TELEGRAM_ENABLED !== 'false' && Boolean(process.env.TELEGRAM_BOT_TOKEN);

/** TTL одноразового токена привязки (п. 6.10.3). */
export const TG_LINK_TOKEN_TTL_MINUTES = 15;

/** Панель «Привяжи Telegram» на экране прогулки (п. 6.10.2). */
export const TG_NUDGE_AFTER_SEC = 60;
export const TG_NUDGE_COOLDOWN_DAYS = 3;
export const TG_NUDGE_MAX_SHOWS = 5;

/** Напоминания «пора размяться» (п. 6.10.4): все интервалы — в рабочих днях. */
export const REMIND_IDLE_WORKDAYS = 2;
export const REMIND_COOLDOWN_WORKDAYS = 3;
/** После стольких напоминаний подряд без прогулки частота падает до раза в неделю. */
export const REMIND_BACKOFF_AFTER = 3;
export const REMIND_BACKOFF_COOLDOWN_WORKDAYS = 5;
/** После стольких — молчание до следующей завершённой прогулки. */
export const REMIND_SILENCE_AFTER = 6;

/**
 * Окно отправки напоминаний, дайджеста и «дорожка освободилась»: рабочие дни,
 * [11:00, 17:00) МСК. Через env переопределяется для локальных прогонов.
 */
export const NOTIFY_WINDOW_START_HOUR = Number(process.env.NOTIFY_WINDOW_START_HOUR ?? 11);
export const NOTIFY_WINDOW_END_HOUR = Number(process.env.NOTIFY_WINDOW_END_HOUR ?? 17);

/** Ключ в localStorage для последнего выбранного участника (п. 6.2). */
export const LAST_USER_STORAGE_KEY = 'teamwalk:lastUserId';
