/** Единая точка конфигурации приложения. Никаких «магических чисел» по коду. */

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'CitrusWalk';

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

/** Ключ в localStorage для последнего выбранного участника (п. 6.2). */
export const LAST_USER_STORAGE_KEY = 'citruswalk:lastUserId';
