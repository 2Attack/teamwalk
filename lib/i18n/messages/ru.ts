/**
 * Russian messages — the reference dictionary: `Messages` is derived from it,
 * so `en`/`es` are forced to carry exactly the same keys by the type checker.
 *
 * Plural entries are wrapped in `p(...)`: the wrapper widens the value to
 * `PluralForms`, letting other locales supply only the CLDR categories they
 * actually distinguish (`one`/`other` for en and es).
 */

export interface PluralForms {
  one?: string;
  few?: string;
  many?: string;
  other: string;
}

/** Identity helper that types a dictionary entry as plural forms. */
export const p = (forms: PluralForms): PluralForms => forms;

export const ru = {
  app: {
    /** `${APP_NAME} — ${titleSuffix}` in the tab title and the PWA manifest. */
    titleSuffix: 'трекер ходьбы',
    description: 'Корпоративный трекер ходьбы на беговой дорожке',
  },

  common: {
    retry: 'Повторить',
    cancel: 'Отмена',
    save: 'Сохранить',
    saving: 'Сохраняем…',
    create: 'Создать',
    creating: 'Создаём…',
    delete: 'Удалить',
    deleting: 'Удаляем…',
    close: 'Закрыть',
    back: 'Назад',
    home: 'На главную',
    loading: 'ЗАГРУЗКА',
    networkError: 'Не удалось связаться с сервером. Проверьте сеть и повторите.',
    progress: 'Прогресс',
  },

  units: {
    km: 'км',
    kmh: 'км/ч',
    hour: 'ч',
    minute: 'мин',
    second: 'сек',
    /** Kept Latin in every locale — a stylized brand badge next to the logo. */
    kmTeam: 'km/team',
    day: p({ one: 'день', few: 'дня', many: 'дней', other: 'дней' }),
  },

  errorPage: {
    title: 'Ошибка',
    body: 'Что-то пошло не так. Данные прогулок в безопасности — попробуйте обновить экран.',
    reload: 'Обновить',
  },

  notFoundPage: {
    body: 'Такой страницы нет. Дорожка тоже не в курсе, куда вы попали.',
  },

  home: {
    networkErrorTitle: 'Нет связи с сервером',
    networkErrorBody: 'Не удалось загрузить список участников. Проверьте подключение и повторите.',
    settingsAria: 'Настройки',
  },

  teamProgress: {
    title: 'Маршрут команды',
    /** Split around the inline settings link: prefix + link + suffix. */
    noRoutePrefix: 'Команда прошла {km} км. Маршрут не выбран — добавьте его в ',
    noRouteLink: 'настройках',
    noRouteSuffix: '.',
    captionNext: '{km} км пройдено, до {city} {left} км',
    captionDone: '{km} км пройдено — маршрут пройден целиком. Выберите следующий в настройках',
    finishLabel: 'Финиш',
    kmFromStart: '{km} км от старта',
    unavailable: 'Прогресс команды пока недоступен',
    notStarted: 'Команда ещё не вышла в путь',
  },

  startCard: {
    title: 'Старт прогулки',
    /** Deliberately English in the ru UI — an arcade-style CTA, like "GO!". */
    startWalk: 'Start walk',
    starting: 'Стартуем…',
    addUserFull: 'Добавить участника',
    addUserShort: 'Добавить',
    emptyTeam: 'В команде пока никого. Нажмите «Добавить участника» и заведите первого.',
    noTreadmillsTitle: 'Дорожек сейчас нет',
    noTreadmillsBody:
      'Все дорожки выведены из строя. Когда дорожку вернут, блок старта появится сам — обновлять страницу не нужно.',
    treadmillJustTaken: 'Эту дорожку только что заняли. Выберите свободную.',
    startFailed: 'Не удалось начать прогулку. Проверьте сеть и повторите.',
    blockerChooseFree: 'выберите свободную дорожку',
  },

  userSelect: {
    label: 'Участник',
    emptyList: 'Пока никого нет',
    typeName: 'Начните вводить имя',
    listAria: 'Участники',
    nobodyFound: 'Никого не нашлось',
    changeAvatarTitle: 'Сменить персонажа',
    changeAvatarAria: 'Сменить персонажа: {name}',
    changeAvatarHint: 'нажмите на аватар, чтобы сменить персонажа',
  },

  speedPicker: {
    label: 'Скорость дорожки, км/ч',
    speedAria: '{speed} км/ч',
  },

  treadmillPicker: {
    label: 'Дорожка',
    capUpTo: 'до {max} км/ч',
    busyLabel: 'занята: {name}, идёт {duration}',
  },

  periodTabs: {
    week: 'Неделя',
    weekShort: 'Нед.',
    month: 'Месяц',
    monthShort: 'Мес.',
    all: 'Всё время',
    allShort: 'Всё',
    custom: 'Период',
    customShort: 'Даты',
    listAria: 'Период рейтинга',
    changeDatesAria: 'Изменить даты периода',
    popoverAria: 'Выбор периода',
  },

  leaderboard: {
    periodWeek: 'неделю',
    periodMonth: 'месяц',
    periodAll: 'всё время',
    periodCustom: 'период с {from} по {to}',
    caption:
      'Таблица лидеров за {period}: место, участник, дистанция в километрах, число прогулок, серия и средняя скорость',
    colParticipant: 'Участник',
    colDistance: 'Дистанция, км',
    colWalks: 'Прогулок',
    colStreak: 'Серия',
    colAvgSpeed: 'Средняя скорость',
    colAvgSpeedShort: 'Ср. скорость',
    empty: 'Ещё никто не ходил — будьте первым',
  },

  podium: {
    aria: 'Пьедестал: топ-3 участников',
    emptyPlace: 'Место свободно',
  },

  streak: {
    none: 'Серии пока нет',
    label: p({
      one: 'Серия: {count} день подряд',
      few: 'Серия: {count} дня подряд',
      many: 'Серия: {count} дней подряд',
      other: 'Серия: {count} дней подряд',
    }),
  },

  walk: {
    startLine: 'Старт в {time} · {treadmill}',
    notFoundTitle: 'ПРОГУЛКИ НЕТ',
    notFoundBody:
      'Её уже завершили или отменили — возможно, с другого устройства. Возвращаем на главную.',
    /** Deliberately English in the ru UI — an arcade-style CTA, like "GO!". */
    endWalk: 'End walk',
    cancelWalk: 'Отменить прогулку',
    cancelling: 'Отменяем…',
    cancelFailed: 'Не вышло отменить — проверьте связь и попробуйте ещё раз',
    accidentalTitle: 'Меньше {seconds} секунд',
    accidentalNote: 'Похоже на случайное нажатие. ',
    cancelTitle: 'Отменить прогулку?',
    willNotBeSaved: 'Прогулка не будет сохранена.',
    keepWalking: 'Иду дальше',
    confirmCancel: 'Да, отменить',
  },

  walkCard: {
    inProgressTitle: 'Прогулка идёт',
    busyTitle: 'Сейчас на дорожке',
    openWalk: 'Открыть прогулку',
    openWalkAria: 'Открыть прогулку: {name}',
    elapsed: 'идёт {duration}',
    speed: '{speed} км/ч',
  },

  speedControl: {
    decreaseAria: 'Сбросить скорость на 1 км/ч',
    increaseAria: 'Прибавить скорость на 1 км/ч',
    caption: 'скорость дорожки',
    changeFailed: 'Не вышло сменить скорость — проверьте связь',
  },

  walkTimer: {
    elapsedAria: 'Прошло {duration}',
    newRecord: 'НОВЫЙ РЕКОРД',
    recordProgressAria: 'Прогресс к лучшему дню: {current} из {best} км',
    bestDay: 'твой лучший день — {km} км',
  },

  walkerSprite: {
    aria: 'Пиксельный человечек идёт по дорожке',
  },

  countdown: {
    cancelAria: 'Отменить старт',
    starting: 'Стартуем…',
    tapToCancel: 'Нажмите, чтобы отменить',
    go: 'GO!',
  },

  finishDialog: {
    title: 'Завершить прогулку',
    summary: 'Длительность {duration} · скорость {speeds}',
    distanceLabel: 'Дистанция, км',
    hint: 'рассчитано по {speeds} — поправьте, если на дорожке другое число',
    errorRequired: 'Без дистанции прогулку не сохранить',
    errorNotANumber: 'Только число: 1.25 или 1,25',
    errorOutOfRange: 'Допустимо от {min} до {max} км',
    warnMismatch: 'Рассчитали {calculated} км, вы ввели {entered}. Всё верно?',
    warnTooFast: 'Получилось {speed} км/ч, а дорожка так не умеет. Проверьте число',
    warnShort: 'Прогулка короче минуты — сохраним, но она почти ничего не добавит',
    submitFailed: 'Не получилось связаться с сервером. Данные не потеряны — попробуйте ещё раз.',
    retrySafe: 'Нажмите «Сохранить» ещё раз — повтор не создаст дубль.',
  },

  walkSuccess: {
    durationOnTreadmill: '{duration} на дорожке «{treadmill}»',
    placeTitle: '{rank} МЕСТО',
    rankFirst: 'первая позиция в недельном рейтинге',
    rankUp: 'поднялись с {previous} места в недельном рейтинге',
    rankDown: 'опустились с {previous} места в недельном рейтинге',
    rankSame: 'позиция в недельном рейтинге не изменилась',
    streakTitle: 'СЕРИЯ',
    streakNone: 'серия начнётся со следующей прогулки',
    streakDays: p({
      one: '{count} день подряд',
      few: '{count} дня подряд',
      many: '{count} дней подряд',
      other: '{count} дней подряд',
    }),
    streakFrozen: ' · серию спасла заморозка',
    newDayRecord: 'Новый личный рекорд дня — {km} км',
    bestDay: 'Лучший день — {km} км',
    newAwardsTitle: 'НОВЫЕ НАГРАДЫ',
    deleteEntry: 'Отменить запись ({timer})',
    deleteFailed: 'Запись удалить не вышло — окно в {minutes} минут могло уже закрыться',
  },

  achievementsUi: {
    rowAria: 'Полученные достижения',
    tooltipAria: '{title} — {description}',
    toastBadge: 'Новая награда',
    toastMore: 'Ещё наград: {count}',
    toastCloseAria: 'Закрыть уведомление',
  },

  hintsUi: {
    tickerAria: 'Лента подсказок',
    fallback: 'Дорожка свободна. Хорошего шага!',
  },

  telegram: {
    nudgeAria: 'Приглашение привязать Telegram',
    nudgeTitle: 'TELEGRAM',
    nudgeBody: 'Бот пришлёт итоги прогулок, ачивки и напомнит размяться.',
    connect: 'Подключить',
    dontShowAgain: 'Больше не показывать',
    dialogTitle: 'Привязать Telegram',
    dialogDescription:
      'Наведите камеру телефона на код — откроется чат с ботом, останется нажать «Start»',
    linkFailed: 'Не вышло получить ссылку — проверьте связь и попробуйте ещё раз',
    tryAgain: 'Попробовать ещё раз',
    qrAlt: 'QR-код привязки Telegram',
    gettingLink: 'Получаем ссылку…',
    qrFailed: 'QR не нарисовался — ссылка ниже',
    linkOnThisDevice: 'Привязать по ссылке — если Telegram на этом устройстве',
  },

  addUser: {
    title: 'Новый участник',
    description: 'Имя видно в рейтинге и хинтах, персонажа можно сменить позже.',
    nameLabel: 'Имя *',
    nameHint: 'От 2 до 60 символов. Так вы будете видны в рейтинге.',
    invalidName: 'Некорректное имя',
    nameTaken: 'Участник с таким именем уже есть в списке',
    pickCharacter: 'Выбери персонажа',
  },

  changeAvatar: {
    title: 'Сменить персонажа',
    description: 'Пресет видно в рейтинге, на пьедестале и в хинтах.',
  },

  avatarPicker: {
    gridAria: 'Пиксельный персонаж',
    takenAria: '{label} — занят',
    takenBadge: 'занят',
  },

  settings: {
    title: 'Настройки',
    backHome: '← На главную',
  },

  treadmills: {
    title: 'Дорожки',
    loadFailed: 'Не удалось загрузить список дорожек. Проверьте подключение и повторите.',
    empty: 'Дорожек пока нет. Добавьте первую — и на главной появится блок старта.',
    colName: 'Название',
    colKmh: 'Км/ч',
    colWalks: 'Прогулок',
    colStatus: 'Статус',
    colActions: 'Действия',
    badgeActive: 'активна',
    badgeInactive: 'выключена',
    busyWith: 'идёт {name}',
    editAria: 'Изменить дорожку «{name}»',
    editTitle: 'Изменить',
    deleteAria: 'Удалить дорожку «{name}»',
    deleteTitle: 'Удалить',
    turnOffAria: 'Выключить дорожку «{name}»',
    turnOnAria: 'Включить дорожку «{name}»',
    turnOffTitle: 'Выключить',
    turnOnTitle: 'Включить',
    add: 'Добавить дорожку',
    deleteConfirmTitle: 'Удалить дорожку?',
    deleteConfirmBody: '«{name}» будет удалена насовсем. Отменить действие нельзя.',
    deleteLastActiveWarn:
      'Это последняя активная дорожка: после удаления стартовать прогулки будет нельзя, пока не добавите новую.',
    formEditTitle: 'Изменить дорожку',
    formNewTitle: 'Новая дорожка',
    formDescription: 'Название видно в селекторе старта, потолок ограничивает выбор скорости.',
    nameLabel: 'Название *',
    nameHint: 'От 2 до 60 символов, например «У окна».',
    invalidName: 'Некорректное название',
    speedLabel: 'Потолок скорости, км/ч *',
    speedHint: 'Целое от {min} до {max} — как на шильдике дорожки.',
    speedError: 'Целое число от {min} до {max}',
    orderLabel: 'Порядок в списке',
    orderHint: 'Меньше — выше в селекторе старта.',
    orderError: 'Целое число от {min} до {max}',
    toggleActiveOn: 'Дорожка активна',
    toggleActiveOff: 'Дорожка выключена',
  },

  routes: {
    title: 'Маршрут команды',
    loadFailed: 'Не удалось загрузить маршруты. Проверьте подключение и повторите.',
    empty: 'Маршрутов пока нет — команда идёт по встроенному. Добавьте свой, и он появится на главной.',
    colName: 'Название',
    colCities: 'Городов',
    colLength: 'Длина',
    colStatus: 'Статус',
    colActions: 'Действия',
    badgeActive: 'активный',
    progressDone: ' · пройден',
    editAria: 'Изменить маршрут «{name}»',
    editTitle: 'Изменить',
    activateAria: 'Выбрать маршрут «{name}»',
    activateTitle: 'Выбрать',
    deleteAria: 'Удалить маршрут «{name}»',
    deleteTitle: 'Удалить',
    add: 'Добавить маршрут',
    activateConfirmTitle: 'Сменить маршрут?',
    activateConfirmBody: 'Команда переходит на «{name}». Полоса на главной покажет его.',
    resetTitle: 'Начать с нуля',
    resetHint: 'Прогресс нового маршрута стартует с 0 км — история прогулок не меняется.',
    keepTitle: 'Продолжить с текущей отметки',
    keepHint: 'Уже пройденные командой километры засчитываются и на этом маршруте.',
    activating: 'Меняем…',
    activate: 'Выбрать',
    deleteConfirmTitle: 'Удалить маршрут?',
    deleteConfirmBody: '«{name}» будет удалён насовсем. Отменить действие нельзя.',
    deleteActiveWarn:
      'Это активный маршрут: после удаления главная покажет «маршрут не выбран», пока вы не выберете другой.',
    formEditTitle: 'Изменить маршрут',
    formNewTitle: 'Новый маршрут',
    formDescription: 'Города с накопительными километрами от старта. Расстояния ориентировочные.',
    aiLabel: 'Опишите маршрут',
    aiPlaceholder: 'например: от Ярославля до Токио',
    aiGenerate: 'Сгенерировать',
    aiGenerating: 'Генерируем…',
    aiHint: 'ИИ заполнит черновик — города и километры можно поправить перед сохранением.',
    nameLabel: 'Название *',
    invalidName: 'Некорректное название',
    pointsLabel: 'Города и километры от старта',
    pointsInvalid: 'Проверьте точки маршрута',
    kmInteger: 'Километры — целое число',
    startPlaceholder: 'Старт',
    cityPlaceholder: 'Город',
    startCityAria: 'Стартовый город',
    cityAria: 'Город {index}',
    kmToPointAria: 'Километры до точки {index}',
    removeCityAria: 'Убрать город {name}',
    removeCityTitle: 'Убрать',
    startAlwaysZero: 'Старт — всегда 0 км.',
    addCity: 'Добавить город',
  },

  validation: {
    nameLength: 'Имя должно быть от 2 до 60 символов',
    nameChars: 'Допустимы только буквы, цифры, пробел, дефис, апостроф и точка',
    unknownAvatar: 'Неизвестный персонаж',
    invalidId: 'Некорректный идентификатор',
    nothingToUpdate: 'Нечего обновлять',
    speedInteger: 'Скорость — целое число',
    minKmh: 'Минимум {min} км/ч',
    maxKmh: 'Максимум {max} км/ч',
    titleLength: 'Название должно быть от 2 до 60 символов',
    speedCeilingInteger: 'Потолок скорости — целое число',
    orderInteger: 'Порядок — целое число',
    min: 'Минимум {min}',
    max: 'Максимум {max}',
    kmInteger: 'Километры — целое число',
    kmNegative: 'Километры не могут быть отрицательными',
    maxKm: 'Максимум {max} км',
    routePointsMin: 'Минимум {min} точки: старт и цель',
    routePointsMax: 'Максимум {max} точек',
    routeStartsAtZero: 'Маршрут начинается со старта — точки с 0 км',
    kmStrictlyIncreasing: 'Километры должны строго возрастать',
    citiesUnique: 'Города в маршруте не должны повторяться',
    describeRoute: 'Опишите маршрут (от 3 до 300 символов)',
    minKm: 'Минимум {min} км',
    distanceStep: 'Шаг — 0.01 км',
    dateFormat: 'Дата — в формате ГГГГ-ММ-ДД',
    dateInvalid: 'Несуществующая дата',
    periodInverted: 'Начало периода позже его конца',
  },

  api: {
    internalError: 'Что-то пошло не так. Попробуйте ещё раз',
    invalidData: 'Некорректные данные',
    clientFallback: 'Что-то пошло не так',
  },

  apiMessages: {
    treadmillNotFound: 'Дорожка не найдена',
    treadmillUnavailable: 'Дорожка «{name}» сейчас недоступна',
    noTreadmills: 'Сейчас нет доступных дорожек',
    allTreadmillsBusy: 'Все дорожки заняты, подождите освобождения',
    walkAlreadyActive: 'У вас уже идёт прогулка',
    treadmillBusyBy: 'На дорожке «{name}» сейчас {user}, с {time}',
    treadmillJustTaken: 'Дорожка «{name}» только что занята',
    speedAboveCeiling: 'Для дорожки «{name}» максимум {max} км/ч',
    walkCreatedUnreadable: 'Прогулка создана, но её не удалось прочитать',
    entryNotFound: 'Запись не найдена',
    walkStillActive: 'Прогулка ещё идёт — сначала завершите или отмените её',
    deleteWindowExpired: 'Удалить запись можно только в течение {minutes} минут после завершения',
    walkNotFound: 'Прогулка не найдена',
    walkAlreadyFinished: 'Прогулка уже завершена — отменить её нельзя',
    walkNotActiveSpeed: 'Прогулка уже не идёт — скорость не изменить',
    walkJustFinished: 'Прогулка только что завершилась',
    walkCancelledUnsavable: 'Прогулка отменена — сохранить результат нельзя',
    walkNotActive: 'Прогулка больше не активна',
    walkSavedUnreadable: 'Прогулка сохранена, но её не удалось прочитать',
    userNotFound: 'Участник не найден',
    userNameTaken: 'Участник с таким именем уже есть в списке',
    limitInteger: 'limit — целое число',
    limitRange: 'limit — от 1 до {max}',
    routeNotFound: 'Маршрут не найден',
    routeNameTaken: 'Маршрут с таким названием уже есть',
    generationUnavailable: 'Генерация недоступна: LLM-креды не настроены',
    generationFailed: 'Не удалось сгенерировать маршрут — попробуйте ещё раз или заполните вручную',
    treadmillNameTaken: 'Дорожка с таким названием уже есть',
    treadmillHasWalks: 'По этой дорожке уже есть прогулки — вместо удаления выключите её',
    telegramNotConfigured: 'Telegram-бот не настроен',
    botNameUnavailable: 'Не удалось узнать имя бота — попробуйте позже',
  },

  achievements: {
    first_walk: { title: 'Первый шаг', description: 'Первая завершённая прогулка' },
    early_bird: { title: 'Ранняя пташка', description: 'Прогулка начата до 9:00' },
    night_owl: { title: 'Сова', description: 'Прогулка начата после 18:00' },
    lunch_walker: { title: 'Обеденный странник', description: 'Прогулка начата между 12:00 и 14:00' },
    friday_closer: { title: 'Пятничный', description: 'Финиш в пятницу после 17:00' },
    marathon: { title: 'Марафон', description: 'Одна прогулка дольше часа' },
    zen: { title: 'Дзен', description: '30 минут на скорости не выше 2 км/ч' },
    long_haul: { title: 'Дальний рейс', description: '5 км за одну прогулку' },
    gearbox: { title: 'Коробка передач', description: 'Три смены скорости за одну прогулку' },
    cruise: { title: 'Круиз-контроль', description: '10 прогулок без единой смены скорости' },
    five_days: { title: 'Пятидневка', description: '5 рабочих дней подряд' },
    ten_day_streak: { title: 'Двухнедельник', description: 'Серия 10 рабочих дней' },
    ten_walks: { title: 'Десятка', description: '10 завершённых прогулок' },
    fifty_walks: { title: 'Полсотни ходок', description: '50 завершённых прогулок' },
    stayer: { title: 'Стайер', description: '10 прогулок на скорости 7+ км/ч' },
    full_throttle: { title: 'Полный газ', description: '10 минут на потолке дорожки' },
    fifty_km: { title: 'Полтинник', description: '50 км суммарно' },
    first_hundred: { title: 'Первая сотня', description: '100 км суммарно' },
    warm_treadmill: { title: 'Дорожка не остыла', description: 'Две прогулки в один день' },
    connected: { title: 'На связи', description: 'Привязан Telegram-бот' },
  },

  avatars: {
    fallback: 'Участник',
    'pixel-01': 'Капитан Пиксель',
    'pixel-02': 'Тень Катаны',
    'pixel-03': 'Турбо-Курьер',
    'pixel-04': 'Барон Джойстик',
    'pixel-05': 'Гроза Аркад',
    'pixel-06': 'Ловец Молний',
    'pixel-07': 'Страж Катакомб',
    'pixel-08': 'Механик Зет',
    'pixel-09': 'Гонщик Неона',
    'pixel-10': 'Агент Восьмибит',
    'pixel-11': 'Всадник Пустоши',
    'pixel-12': 'Пилот Метеора',
    'pixel-13': 'Чемпион Ринга',
    'pixel-14': 'Хранитель Картриджа',
    'pixel-15': 'Кулак Тайфуна',
    'pixel-16': 'Клинок Заката',
    'pixel-17': 'Лорд Лабиринта',
    'pixel-18': 'Стрелок Галактики',
    'pixel-19': 'Взломщик Кода',
    'pixel-20': 'Дух Сёгуна',
    'pixel-21': 'Бегун Мегаполиса',
    'pixel-22': 'Легенда Континью',
    'pixel-23': 'Оракул Пещер',
    'pixel-24': 'Рыцарь Последней Жизни',
  },
} as const satisfies Record<string, unknown>;

/**
 * The message-tree shape every locale must match. Derived from `ru` but with
 * literal string types widened to `string` and plural entries to `PluralForms`,
 * so translations are not forced to repeat the exact Russian text.
 */
export type Messages = Widen<typeof ru>;

type Widen<T> = T extends PluralForms
  ? PluralForms
  : T extends string
    ? string
    : { [K in keyof T]: Widen<T[K]> };
