'use client';

import { useId, useState } from 'react';

import { ChangeAvatarDialog } from '@/components/AddUserDialog';
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
import { fmt, INTL_LOCALE, m } from '@/lib/i18n';
import type { UserDto } from '@/lib/types';

interface UserSelectProps {
  users: UserDto[];
  value: string | null;
  onChange: (userId: string) => void;
}

/**
 * Combobox with search-as-you-type: avatar + name, substring
 * filtering, keyboard navigation. The field takes the card's full width —
 * "+ Add participant" lives in the card header. Clicking the selected
 * participant's avatar opens the character change dialog.
 *
 * Assembled from 8bitcn `Popover` + `Command` — the combobox recipe from their
 * docs: there is no ready-made component, the "Combo Box" page shows exactly
 * this composition, including the pixel check mark on the selected item and
 * the underlined search row. The dropdown used to be hand-written
 * (`<ul role="listbox">` plus custom arrow/outside-click handling) — now the
 * roles, `aria-activedescendant` and arrow traversal come from cmdk, and
 * outside-click closing plus focus return come from the popover.
 *
 * Deliberate deviations from the docs example: pixel icons instead of lucide,
 * sans for the names — they are data, people read them —
 * and the panel width follows the trigger, not a fixed 320px.
 *
 * Font: the 8bitcn `Command` root is hard-tagged with `.retro`, so list names
 * would render in the pixel font. `font-sans` is set on the rows themselves:
 * the `.retro` rule in globals.css sits outside layers and beats a utility on
 * the same element, but a declaration on the element always beats an
 * inherited font.
 */
export function UserSelect({ users, value, onChange }: UserSelectProps) {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  const selected = users.find((u) => u.id === value) ?? null;

  function commit(user: UserDto) {
    onChange(user.id);
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {/* `font="normal"`: the label is sans, like the field below. */}
        <Label htmlFor={triggerId} font="normal" className="block text-sm text-text-dim">
          {m.userSelect.label}
        </Label>

        {/* The field takes the card's full width. This used to be a flex row
            "field + button" sharing the line with "Add"; the button moved to
            the card header, so there is nothing left to share width with. */}
        <div className="min-w-0">
          <Popover open={open} onOpenChange={setOpen}>
            {/*
              Base UI (the `base-nova` style in components.json) injects its
              element via `render`, not via `asChild` like Radix.
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
                  (users.length === 0 ? m.userSelect.emptyList : m.userSelect.typeName)}
              </span>
              <Icon name="chevronDown" size={16} />
            </PopoverTrigger>

            {/*
              `--anchor-width` is a Base UI positioner variable: the list is
              exactly as wide as the trigger, otherwise the popover stays at
              its own `w-72` and sticks out past the field on narrow screens.
            */}
            <PopoverContent
              font="normal"
              align="start"
              className="w-(--anchor-width) p-0"
              aria-label={m.userSelect.listAria}
            >
              {/*
                Two fixes on top of the 8bitcn `Command`, both consequences of
                it putting `className` on the outer wrapper AND on the list:

                `h-auto` — the list carries `h-full`, the popover sets no height
                of its own, and the panel collapsed into a zero-height strip.

                `[&>div.absolute]:hidden` — the frame is drawn by the popover,
                so the pixel "ears" of `Command` itself are removed, otherwise
                the panel would get two frames one inside the other (the docs
                screenshot shows a single frame too). The selector targets
                exactly the absolutely-positioned children: "everything except
                the list" is not usable here — the search field wrapper would
                match as well.
              */}
              <Command
                filter={matchScore}
                className={cn(
                  'h-auto [&>div.absolute]:hidden',
                  /*
                    No focus outline on the search row. The global
                    `:focus-visible` in globals.css draws an orange outline on
                    every field — here it is redundant and communicates
                    nothing: the popover opens with focus already in this
                    field and focus never leaves it (arrows move the row
                    highlight, not focus), so "where am I" is visible from the
                    highlighted list row anyway.

                    `!` is mandatory: the globals.css rule sits outside layers
                    and beats a plain utility.
                  */
                  '**:data-[slot=command-input]:outline-none!',
                )}
              >
                <CommandInput placeholder={m.userSelect.typeName} className="font-sans text-base" />
                <CommandList>
                  <CommandEmpty className="px-3 py-6 text-center font-sans text-sm text-text-dim">
                    {m.userSelect.nobodyFound}
                  </CommandEmpty>
                  <CommandGroup>
                    {users.map((user) => (
                      <CommandItem
                        key={user.id}
                        // The search value is the participant's name. Names
                        // are unique: the server answers NAME_TAKEN on a dupe.
                        value={user.name}
                        onSelect={() => commit(user)}
                        className="min-h-11 gap-3 font-sans"
                      >
                        {/* Leading pixel check for the selected row — the
                            docs combobox pattern (hidden, not removed, so the
                            names stay column-aligned). */}
                        <Icon
                          name="check"
                          size={16}
                          className={user.id === value ? 'opacity-100' : 'opacity-0'}
                        />
                        <Avatar avatarId={user.avatarId} name={user.name} size={28} />
                        {/* The name is plain sans: data, not a label. */}
                        <span className="truncate text-base text-text-main">{user.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {selected && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAvatarOpen(true)}
            title={m.userSelect.changeAvatarTitle}
            aria-label={fmt(m.userSelect.changeAvatarAria, { name: selected.name })}
            /*
              A button without its own frame: the avatar is its visible part.
              min-h/min-w-11 stay — the touch target is at least 44px
, and hover is signalled by the portrait itself,
              not a box around it. Keyboard focus is drawn by the global
              `:focus-visible` in globals.css.
            */
            className="inline-flex min-h-11 min-w-11 items-center justify-center touch-manipulation hover:brightness-110"
          >
            <Avatar avatarId={selected.avatarId} name={selected.name} size={40} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-base text-text-main">{selected.name}</p>
            <p className="text-xs text-text-dim">{m.userSelect.changeAvatarHint}</p>
          </div>
        </div>
      )}

      {/*
        `AddUserDialog` no longer lives here: the button that opens it moved to
        the card header, and keeping the dialog away from its button means
        threading `open` state through props back and forth. Easier to lift
        both into `StartWalkCard`.
      */}
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
 * Filter for cmdk: 1 — the row matches, 0 — it does not.
 *
 * Search stays case-insensitive by substring and identical for Cyrillic and
 * Latin. The stock cmdk filter scores "similarity" and would let extra rows
 * through on Cyrillic, so the rule is spelled out explicitly.
 */
export function matchScore(name: string, search: string): number {
  const needle = search.trim().toLocaleLowerCase(INTL_LOCALE);
  if (needle === '') return 1;
  return name.toLocaleLowerCase(INTL_LOCALE).includes(needle) ? 1 : 0;
}
