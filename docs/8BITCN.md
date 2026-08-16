# Migrating to 8bitcn/ui

The library is installed with the standard shadcn CLI (`npx shadcn@latest add @8bitcn/<name>`);
the sources live in the repository — it is a copy-paste kit, not a dependency.

```
components/ui/8bit/*   ← 8bitcn components (pixel borders, the `font` prop)
components/ui/*        ← the shadcn base they wrap. Never edit by hand
components/ui/icon.tsx ← our 16×16 pixel icon component
components/Avatar.tsx  ← our avatar preset renderer
```

## What is available

| Import | Exports | Notes |
|---|---|---|
| `@/components/ui/8bit/button` | `Button` | `variant: default \| secondary \| destructive \| outline \| ghost \| link`, `size: sm \| default \| lg \| icon`, `font: retro \| normal` |
| `@/components/ui/8bit/card` | `Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter` | compositional API, `font` |
| `@/components/ui/8bit/dialog` | `Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose` | controlled via `open` / `onOpenChange` |
| `@/components/ui/8bit/input` | `Input` | `font` |
| `@/components/ui/8bit/badge` | `Badge` | `variant`, `font` |
| `@/components/ui/8bit/progress` | `Progress` | `value`, `font` |
| `@/components/ui/8bit/table` | `Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption` | `font`, `variant` |
| `@/components/ui/8bit/tabs` | `Tabs, TabsList, TabsTrigger, TabsContent` | `font`; controlled via `value` / `onValueChange` |
| `@/components/ui/8bit/calendar` | `Calendar` | wraps `react-day-picker`; chevrons are custom pixel SVGs, `font`; used for the custom leaderboard period |
| `@/components/ui/8bit/popover` | `Popover, PopoverTrigger, PopoverContent` | base is Base UI: the trigger takes `render`, not `asChild`; reinstalling wipes the local edit — see the comment in the file |
| `@/components/ui/8bit/alert` | `Alert, AlertTitle, AlertDescription` | `variant: default \| destructive`, `font`; "ears" on the frame corners |
| `@/components/ui/8bit/avatar` | `Avatar, AvatarImage, AvatarFallback` | `variant: pixel \| retro \| default`, `font` |

The 8bitcn Select is **deliberately not installed**: speed is picked with a row
of buttons, not a dropdown.

### retro.css is overwritten on every install

`npx shadcn add @8bitcn/<name>` re-creates `components/ui/8bit/styles/retro.css`
and puts the Press Start 2P `@import` from the Google CDN back in — a font with
no Cyrillic and an extra external request. Remove that line after every install:
the font is loaded via next/font in `app/layout.tsx`, and the `.retro` rule is
redefined in `app/globals.css`.

### The Alert landmine

`Alert` has `role="alert"`, whose implied `aria-live` is `assertive`. For the
hint ticker, which changes on its own every 7 seconds, that would mean the
screen reader interrupting the user on every phrase — so the component carries
an explicit `aria-live="off"`.

The "icon + text" column grid is switched on by the `has-[>svg]` selector, but
our `Icon` renders an `<img>` — so the grid is set manually
(`grid-cols-[auto_1fr]`).

### Dialogs — only through `DialogShell`

All four dialogs in the project are built on `components/DialogShell.tsx`, never
on `DialogContent` directly. The shared decisions live there once: width
`sm:max-w-md`, the stock close button hidden, and — crucially — `max-h` with
`flex-col`. Without the height cap the popup is positioned `fixed` at the center
with no scrolling: the 662 px character-picker dialog on a 500×523 screen was
clipped top and bottom, and the "Create" button became unreachable. Long middles
go into `DialogBody` — it scrolls while the header and `DialogFooter` stay put.

### The Avatar landmine

The ring cannot be disabled with a prop: `variant="pixel"` draws a round
"staircase", `default` and `retro` draw four bars along the edges — there is no
third option. We don't want a ring, so the frame container is hidden with the
`[&>div:first-child]:hidden` class (`components/Avatar.tsx`). What remains of
the component is the Radix semantics and `image-rendering`.

`variant="pixel"` also hard-sets `rounded-full` — on the avatar itself and on
the fallback silhouette. Avatars in this project are square (`--radius: 0`), so
both slots get an extra `rounded-none`.

The component puts `className` **on both the wrapper and the Root**, and there
is no prop for a numeric size. The size is owned by our wrapper in
`components/Avatar.tsx`; `h-full w-full` goes inside.

### The Tabs landmine

The `8bit/tabs` wrapper styles the active tab via `data-[state=active]:` — a
Radix selector. The base (`components/ui/tabs`, `base-nova` style) is built on
**Base UI**, where the state arrives as the `data-active` attribute, so the
library rule never fires. Write your own active-tab styles with `data-active:`
and always duplicate them with a `dark:` variant: the base defines the active
state there too, and our theme is always dark — a lone `data-active:` gets
overridden.

The list height comes with a variant (`group-data-horizontal/tabs:h-8`,
specificity 0,2,0), so the 44 px touch target can only be reached with the same
variant: `group-data-horizontal/tabs:h-auto` on the list plus `min-h-11` on the
triggers.

Arrow-key navigation, Home/End and roving tabindex come from Base UI — no
custom handlers needed. Activation is manual: arrows move focus, selection is
Enter/Space or a click.

## Usage rules

1. **`font="normal"` by default for anything people read.** The pixel font
   (`font="retro"`, the library default) is acceptable only on button labels,
   numbers, headings and badges. Participant names, hints, captions and error
   texts — regular sans, otherwise a line like "Дмитрий Соколов — 22.6 км"
   doesn't fit any layout.
2. **The palette is already mapped** to our tokens in `app/globals.css`:
   `--primary` is citrus, `--card` is the panel, `--radius: 0`, `.dark` is set
   on `<html>`. No `bg-[#...]` and no color overrides inside components.
3. **Shadows without blur, zero border radius.** Our own utilities
   `.pixel-panel`, `.pixel-btn` remain for hand-rolled markup (the podium, the
   hint ticker, the sprite).
4. **Animate only `transform` and `opacity`.**
5. **Touch targets ≥ 44 px**, contrast ≥ 4.5:1, visible focus.
6. Icons — only `@/components/ui/icon` (16×16 pixel icons). `lucide-react`
   came along with shadcn, but mixing vector icons with pixel ones is off the
   table: the different stroke weight is visible immediately.

## API changes relative to the previous hand-written kit

| Before | After |
|---|---|
| `<Button variant="primary" pixel size="md">` | `<Button variant="default" size="default">` |
| `<Button variant="danger">` | `<Button variant="destructive">` |
| `<Card title="…" accent>` | `<Card><CardHeader><CardTitle>…</CardTitle></CardHeader><CardContent>…</CardContent></Card>` |
| `<Input label="…" error="…" hint="…">` | `<Input>` + your own `<label>`, caption and error text alongside (with `aria-describedby`) |
| `<Dialog open onClose title footer>` | `<Dialog open onOpenChange><DialogContent><DialogHeader><DialogTitle>…` |
