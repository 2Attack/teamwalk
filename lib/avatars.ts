/**
 * Каталог пиксельных пресетов — единственный источник истины (п. 6.5 ТЗ).
 * В БД лежит только `id`; графика — статика в `/public/avatars/{id}.svg`,
 * которую генерирует `npm run gen:assets` (DiceBear, стиль `pixel-art`).
 *
 * Подписи — позывные с экрана выбора персонажа тех самых картриджей, а не
 * описания портретов. Разница принципиальна: портреты собираются генератором по
 * `seed`, поэтому описательное имя вроде «Рыжий в кепке» рано или поздно
 * разошлось бы с тем, что нарисовано, а позывной ничего не обещает про картинку
 * и разойтись с ней не может. Подпись читается вслух скринридером и показывается
 * в пикере, поэтому врать ей нельзя.
 *
 * Позывные придуманы, а не взяты из настоящих игр: чужие названия и имена
 * персонажей — чужие торговые марки. По той же причине они не привязаны к полу —
 * какой портрет достанется позывному, решает генератор.
 *
 * Менять `id` нельзя вообще — на них ссылается БД.
 */
export const AVATARS = [
  { id: 'pixel-01', label: 'Капитан Пиксель' },
  { id: 'pixel-02', label: 'Тень Катаны' },
  { id: 'pixel-03', label: 'Турбо-Курьер' },
  { id: 'pixel-04', label: 'Барон Джойстик' },
  { id: 'pixel-05', label: 'Гроза Аркад' },
  { id: 'pixel-06', label: 'Ловец Молний' },
  { id: 'pixel-07', label: 'Страж Катакомб' },
  { id: 'pixel-08', label: 'Механик Зет' },
  { id: 'pixel-09', label: 'Гонщик Неона' },
  { id: 'pixel-10', label: 'Агент Восьмибит' },
  { id: 'pixel-11', label: 'Всадник Пустоши' },
  { id: 'pixel-12', label: 'Пилот Метеора' },
  { id: 'pixel-13', label: 'Чемпион Ринга' },
  { id: 'pixel-14', label: 'Хранитель Картриджа' },
  { id: 'pixel-15', label: 'Кулак Тайфуна' },
  { id: 'pixel-16', label: 'Клинок Заката' },
  { id: 'pixel-17', label: 'Лорд Лабиринта' },
  { id: 'pixel-18', label: 'Стрелок Галактики' },
  { id: 'pixel-19', label: 'Взломщик Кода' },
  { id: 'pixel-20', label: 'Дух Сёгуна' },
  { id: 'pixel-21', label: 'Бегун Мегаполиса' },
  { id: 'pixel-22', label: 'Легенда Континью' },
  { id: 'pixel-23', label: 'Оракул Пещер' },
  { id: 'pixel-24', label: 'Рыцарь Последней Жизни' },
] as const;

export type AvatarId = (typeof AVATARS)[number]['id'];

export const AVATAR_IDS = AVATARS.map((a) => a.id) as readonly AvatarId[];

export const isAvatarId = (v: string): v is AvatarId => AVATARS.some((a) => a.id === v);

export const avatarSrc = (id: string): string => `/avatars/${id}.svg`;

export const avatarLabel = (id: string): string =>
  AVATARS.find((a) => a.id === id)?.label ?? 'Участник';

/** Случайный аватар из числа свободных; если свободных нет — любой (п. 6.5). */
export function randomAvatarId(taken: readonly string[] = []): AvatarId {
  const free = AVATAR_IDS.filter((id) => !taken.includes(id));
  const pool = free.length > 0 ? free : AVATAR_IDS;
  return pool[Math.floor(Math.random() * pool.length)];
}
