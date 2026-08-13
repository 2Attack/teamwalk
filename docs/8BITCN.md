# Переход на 8bitcn/ui

Библиотека установлена штатным CLI shadcn (`npx shadcn@latest add @8bitcn/<name>`),
исходники лежат в репозитории — это copy-paste-набор, а не зависимость.

```
components/ui/8bit/*   ← компоненты 8bitcn (пиксельные рамки, проп font)
components/ui/*        ← база shadcn, которую они оборачивают. Не править вручную
components/ui/icon.tsx ← наш компонент пиксельных иконок 16×16
components/Avatar.tsx  ← наш рендер пресета аватара
```

## Что доступно

| Импорт | Экспорты | Особенности |
|---|---|---|
| `@/components/ui/8bit/button` | `Button` | `variant: default \| secondary \| destructive \| outline \| ghost \| link`, `size: sm \| default \| lg \| icon`, `font: retro \| normal` |
| `@/components/ui/8bit/card` | `Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter` | композиционный API, `font` |
| `@/components/ui/8bit/dialog` | `Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose` | управляется `open` / `onOpenChange` |
| `@/components/ui/8bit/input` | `Input` | `font` |
| `@/components/ui/8bit/badge` | `Badge` | `variant`, `font` |
| `@/components/ui/8bit/progress` | `Progress` | `value`, `font` |
| `@/components/ui/8bit/table` | `Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption` | `font`, `variant` |
| `@/components/ui/8bit/tabs` | `Tabs, TabsList, TabsTrigger, TabsContent` | `font`; управляется `value` / `onValueChange` |
| `@/components/ui/8bit/calendar` | `Calendar` | обёртка `react-day-picker`; шевроны — свои пиксельные SVG, `font`; для произвольного периода рейтинга |
| `@/components/ui/8bit/popover` | `Popover, PopoverTrigger, PopoverContent` | база на Base UI: триггер принимает `render`, а не `asChild`; переустановка затирает правку — см. комментарий в файле |
| `@/components/ui/8bit/alert` | `Alert, AlertTitle, AlertDescription` | `variant: default \| destructive`, `font`; «уши» по углам рамки |
| `@/components/ui/8bit/avatar` | `Avatar, AvatarImage, AvatarFallback` | `variant: pixel \| retro \| default`, `font` |

Select из 8bitcn **не ставим сознательно**: по ТЗ (п. 6.2) скорость выбирается
рядом кнопок, а не выпадающим списком.

### retro.css перезаписывается при каждой установке

`npx shadcn add @8bitcn/<name>` кладёт `components/ui/8bit/styles/retro.css`
заново и возвращает туда `@import` Press Start 2P с CDN Google — шрифт без
кириллицы и лишний внешний запрос. После каждой установки строку нужно снимать:
шрифт подключён через next/font в `app/layout.tsx`, правило `.retro`
переопределено в `app/globals.css`.

### Мина в Alert

У `Alert` роль `role="alert"`, а у неё подразумеваемое `aria-live` — `assertive`.
Для ленты хинтов, которая меняется сама каждые 7 секунд, это означало бы, что
скринридер перебивает пользователя на каждой фразе, поэтому на компоненте стоит
явный `aria-live="off"` (п. 6.8.4).

Колоночная сетка «иконка + текст» включается селектором `has-[>svg]`, а наш
`Icon` рендерит `<img>` — сетку задаём руками (`grid-cols-[auto_1fr]`).

### Модалки — только через `DialogShell`

Все четыре модалки проекта собираются на `components/DialogShell.tsx`, а не на
`DialogContent` напрямую. Там один раз приняты общие решения: ширина `sm:max-w-md`,
спрятанный штатный крестик, и — главное — `max-h` с `flex-col`. Без ограничения по
высоте popup позиционируется `fixed` по центру без прокрутки: модалка выбора
персонажа высотой 662 px на экране 500×523 обрезалась сверху и снизу, а кнопка
«Создать» становилась недостижимой. Длинную середину заворачиваем в `DialogBody` —
она прокручивается, шапка и `DialogFooter` остаются на месте.

### Мина в Avatar

Обод отключить пропом нельзя: `variant="pixel"` рисует круглую «лесенку»,
`default` и `retro` — четыре планки по краям, третьего варианта нет. У нас обод
не нужен, поэтому контейнер рамки прячется классом `[&>div:first-child]:hidden`
(`components/Avatar.tsx`). От компонента остаётся семантика Radix и
`image-rendering`.

`variant="pixel"` заодно жёстко ставит `rounded-full` — и на самом аватаре, и на
fallback-силуэте. Аватары в проекте квадратные (`--radius: 0`, п. 6.7.1), поэтому
обоим слотам добавлен `rounded-none`.

`className` компонент кладёт **и на обёртку, и на Root**, а числовой размер
задавать ему нечем. Размер держит наша обёртка в `components/Avatar.tsx`,
внутрь уходит `h-full w-full`.

### Мина в Tabs

Обёртка `8bit/tabs` красит активную вкладку через `data-[state=active]:` — селектор
radix. База (`components/ui/tabs`, стиль `base-nova`) собрана на **Base UI**, где
состояние приходит атрибутом `data-active`, поэтому правило библиотеки не срабатывает
никогда. Свои стили активной вкладки пишем на `data-active:` и обязательно дублируем
`dark:`-вариантом: в базе активное состояние задано и там, а тема у нас всегда тёмная —
одиночный `data-active:` она перебьёт.

Высота списка приходит с вариантом (`group-data-horizontal/tabs:h-8`, специфичность
0,2,0), поэтому тач-таргет 44 px добирается только тем же вариантом:
`group-data-horizontal/tabs:h-auto` на списке плюс `min-h-11` на триггерах.

Ходьба стрелками, Home/End и roving tabindex — из Base UI, свои обработчики не нужны.
Активация ручная: стрелки двигают фокус, выбор — Enter/Space или клик.

## Правила использования

1. **`font="normal"` по умолчанию для всего, что читают.** Пиксельный шрифт
   (`font="retro"`, он же дефолт библиотеки) допустим только на метках кнопок,
   числах, заголовках и бейджах. Имена участников, хинты, подписи и тексты
   ошибок — обычным sans, иначе строка «Дмитрий Соколов — 22.6 км» не помещается
   ни в один макет (п. 6.7.1).
2. **Палитра уже переведена** на наши токены в `app/globals.css`: `--primary`
   цитрусовый, `--card` панель, `--radius: 0`, `.dark` включён на `<html>`.
   Никаких `bg-[#...]` и переопределений цветов в компонентах.
3. **Тени без blur, скругление ноль.** Наши утилиты `.pixel-panel`, `.pixel-btn`
   остаются для собственной вёрстки (пьедестал, лента хинтов, спрайт).
4. **Анимировать только `transform` и `opacity`.**
5. **Тач-таргеты ≥ 44 px**, контраст ≥ 4.5:1, фокус виден.
6. Иконки — только `@/components/ui/icon` (пиксельные 16×16). `lucide-react`
   пришёл вместе с shadcn, но смешивать векторные иконки с пиксельными нельзя:
   разная толщина штриха видна сразу (п. 6.7.4).

## Что изменилось в API относительно прежнего самописного кита

| Было | Стало |
|---|---|
| `<Button variant="primary" pixel size="md">` | `<Button variant="default" size="default">` |
| `<Button variant="danger">` | `<Button variant="destructive">` |
| `<Card title="…" accent>` | `<Card><CardHeader><CardTitle>…</CardTitle></CardHeader><CardContent>…</CardContent></Card>` |
| `<Input label="…" error="…" hint="…">` | `<Input>` + собственные `<label>`, подпись и текст ошибки рядом (с `aria-describedby`) |
| `<Dialog open onClose title footer>` | `<Dialog open onOpenChange><DialogContent><DialogHeader><DialogTitle>…` |
