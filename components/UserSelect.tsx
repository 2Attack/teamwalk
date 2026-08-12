'use client';

import { useId, useState } from 'react';

import { AddUserDialog, ChangeAvatarDialog } from '@/components/AddUserDialog';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/ui/8bit/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/8bit/command';
import { Label } from '@/components/ui/8bit/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/8bit/popover';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import type { UserDto } from '@/lib/types';

interface UserSelectProps {
  users: UserDto[];
  value: string | null;
  onChange: (userId: string) => void;
}

/**
 * Комбобокс с поиском по вводу (п. 6.2): аватар + имя, фильтрация по подстроке,
 * управление с клавиатуры. Рядом — «+ Добавить»; клик по аватару выбранного
 * участника открывает смену персонажа (п. 6.5).
 *
 * Собран из `Popover` + `Command` 8bitcn — это рецепт комбобокса из их доков:
 * готового компонента там нет, страница «Combo Box» показывает ровно такую
 * композицию. Раньше выпадающий список был написан руками (`<ul role="listbox">`
 * плюс своя обработка стрелок и клика мимо) — теперь роли, `aria-activedescendant`
 * и перебор стрелками приходят из cmdk, а закрытие по клику мимо и возврат фокуса
 * на триггер — из поповера.
 *
 * Шрифт: корень `Command` у 8bitcn жёстко помечен классом `.retro`, поэтому имена
 * в списке пришлось бы читать пиксельным. Имена — данные, их читают (п. 6.7.1),
 * так что `font-sans` проставлен на самих строках: правило `.retro` в globals.css
 * лежит вне слоёв и утилиту на том же элементе перебивает, а вот унаследованный
 * шрифт объявление на самом элементе перебивает всегда.
 */
export function UserSelect({ users, value, onChange }: UserSelectProps) {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  const selected = users.find((u) => u.id === value) ?? null;

  function commit(user: UserDto) {
    onChange(user.id);
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {/* `font="normal"`: метка — sans, как и поле под ней (п. 6.7.1). */}
        <Label htmlFor={triggerId} font="normal" className="block text-sm text-text-dim">
          Участник
        </Label>

        {/* flex-wrap: на 360 px пиксельная метка «Добавить» уезжает на свою строку,
            а поле остаётся во всю ширину — горизонтального скролла не возникает. */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <Popover open={open} onOpenChange={setOpen}>
              {/*
                Base UI (стиль `base-nova` в components.json) подставляет свой
                элемент через `render`, а не через `asChild` как Radix.
              */}
              <PopoverTrigger
                render={
                  <Button
                    id={triggerId}
                    type="button"
                    variant="outline"
                    font="normal"
                    role="combobox"
                    aria-expanded={open}
                    disabled={users.length === 0}
                    className="min-h-11 w-full justify-between gap-2 px-3 text-base"
                  />
                }
              >
                <span className={cn('truncate', selected === null && 'text-text-dim')}>
                  {selected?.name ??
                    (users.length === 0 ? 'Пока никого нет' : 'Начните вводить имя')}
                </span>
                <Icon name="chevronDown" size={16} />
              </PopoverTrigger>

              {/*
                `--anchor-width` — переменная позиционера Base UI: список ровно по
                ширине триггера, иначе поповер остаётся на своих `w-72` и на
                узком экране вылезает за поле.
              */}
              <PopoverContent
                font="normal"
                align="start"
                className="w-(--anchor-width) p-0"
                aria-label="Участники"
              >
                {/*
                  Две правки поверх `Command` из 8bitcn, обе — следствие того,
                  что он кладёт `className` и на внешнюю обёртку, и на сам
                  список:

                  `h-auto` — у списка стоит `h-full`, а поповер своей высоты не
                  задаёт, и панель схлопывалась в полоску нулевой высоты.

                  `[&>div.absolute]:hidden` — рамку рисует поповер, поэтому
                  пиксельные «уши» самого `Command` убраны, иначе на панели
                  оказались бы две рамки одна в другой. Селектор бьёт именно по
                  абсолютно спозиционированным потомкам: «все потомки, кроме
                  списка» здесь нельзя — на внутренней обёртке под это правило
                  попадало бы и поле поиска.
                */}
                <Command
                  filter={matchScore}
                  className={cn(
                    'h-auto [&>div.absolute]:hidden',
                    /*
                      Строка поиска — без подчёркивающей линии. `CommandInput` из
                      8bitcn вешает `border-b` на свою обёртку и наружу её не
                      отдаёт (className уходит только на сам <input>), поэтому
                      гасим правило отсюда, а не пропсом.
                    */
                    '[&_[data-slot=command-input-wrapper]]:border-b-0',
                    /*
                      И без рамки фокуса. Глобальный `:focus-visible` в
                      globals.css рисует оранжевый outline на каждом поле — здесь
                      он лишний и ничего не сообщает: поповер открывается сразу с
                      фокусом в этом поле, фокус из него никуда не уходит (стрелки
                      двигают подсветку строк, а не фокус), так что «где я» и без
                      рамки видно по подсвеченной строке списка.

                      `!` обязателен: правило в globals.css лежит вне слоёв и
                      обычную утилиту перебивает.
                    */
                    '**:data-[slot=command-input]:outline-none!',
                  )}
                >
                  <CommandInput placeholder="Начните вводить имя" className="font-sans text-base" />
                  <CommandList>
                    <CommandEmpty className="px-3 py-6 text-center font-sans text-sm text-text-dim">
                      Никого не нашлось
                    </CommandEmpty>
                    <CommandGroup>
                      {users.map((user) => (
                        <CommandItem
                          key={user.id}
                          // Значение, по которому идёт поиск, — имя участника.
                          // Имена уникальны: сервер отвечает NAME_TAKEN на дубль.
                          value={user.name}
                          onSelect={() => commit(user)}
                          className="min-h-11 gap-3 font-sans"
                        >
                          <Avatar avatarId={user.avatarId} name={user.name} size={28} />
                          {/* Имя — обычный sans: это данные, а не метка (п. 6.7.1). */}
                          <span className="truncate text-base text-text-main">{user.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <Button
            type="button"
            variant="outline"
            /*
              `self-center`, а не `self-stretch`: у поля и у кнопки одинаковый
              бокс в 44 px (`min-h-11`), но пиксельная рамка кнопки висит снаружи
              бокса (`-top-1.5` / `-bottom-1.5`) и добавляет по 6 px сверху и
              снизу. Растягивание кнопку бы ещё и удлинило, а так обе половины
              стоят на одной средней линии, и рамка выступает симметрично.
            */
            className="h-auto min-h-11 shrink-0 gap-2 self-center px-3 text-xs"
            onClick={() => setAddOpen(true)}
          >
            <Icon name="plus" size={16} />
            Добавить
          </Button>
        </div>
      </div>

      {selected && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAvatarOpen(true)}
            title="Сменить персонажа"
            aria-label={`Сменить персонажа: ${selected.name}`}
            /*
              Кнопка без собственной рамки: аватар и есть её видимая часть.
              min-h/min-w-11 оставлены — тач-таргет не меньше 44 px (п. 6.7.7),
              а наведение подсвечивается самим портретом, не коробкой вокруг.
              Фокус с клавиатуры рисует глобальный `:focus-visible` в globals.css.
            */
            className="inline-flex min-h-11 min-w-11 items-center justify-center touch-manipulation hover:brightness-110"
          >
            <Avatar avatarId={selected.avatarId} name={selected.name} size={40} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-base text-text-main">{selected.name}</p>
            <p className="text-xs text-text-dim">нажмите на аватар, чтобы сменить персонажа</p>
          </div>
        </div>
      )}

      <AddUserDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        users={users}
        onCreated={(user) => commit(user)}
      />
      <ChangeAvatarDialog
        open={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        user={selected}
        users={users}
      />
    </div>
  );
}

/**
 * Фильтр для cmdk: 1 — строка подходит, 0 — нет.
 *
 * Поиск остаётся регистронезависимым по подстроке и одинаковым для кириллицы и
 * латиницы. Штатный фильтр cmdk считает «похожесть» и на кириллице пропускал бы
 * лишнее, поэтому правило задано явно.
 */
export function matchScore(name: string, search: string): number {
  const needle = search.trim().toLocaleLowerCase('ru-RU');
  if (needle === '') return 1;
  return name.toLocaleLowerCase('ru-RU').includes(needle) ? 1 : 0;
}
