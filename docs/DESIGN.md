# Zuup Code design system

Zuup Code is a browser IDE for students and teachers, made by a youth-led non-profit. The app should
feel like a well-made workbench: quiet, dense enough to work in, and obvious to a first-time coder.
Every surface in the app follows these rules. The marketing pages (`src/pages/Landing.tsx`,
`src/components/site/*`) use the same palette with more generous type.

## Colour

Tokens live in `src/index.css` (`:root`) and are exposed to Tailwind in `tailwind.config.ts`.

| Token | Hex | Tailwind | Use |
| --- | --- | --- | --- |
| ink | `#0E1016` | `bg-ink` / `bg-background` | Page, editor, terminal |
| panel | `#13151C` | `bg-panel` / `bg-card` | Side panels, status bar, top bar |
| raised | `#1A1D26` | `bg-raised` / `bg-popover` | Menus, inputs, hovered rows, dialogs |
| rule | `#262A36` | `border-rule` / `border-border` | Every divider and outline |
| text | `#E6E8EE` | `text-foreground` | Primary text |
| muted | `#8B90A0` | `text-muted-foreground` | Secondary text, descriptions |
| faint | `#5C6170` | `text-faint` | Placeholders, disabled, line numbers |
| rose | `#E63462` | `bg-primary` / `text-primary` | Primary action, active indicator, focus ring |
| success | `#3DDC84` | `text-success` | Finished runs, synced |
| warning | `#F0B44C` | `text-warning` | Pending, held, warnings |
| danger | `#FF6B6B` | `text-danger` | Errors in text; `bg-destructive` for destructive buttons |

- Rose is spent in one place per view: the primary action (Run, New project, Save) and the
  active indicator (active tab top border, active activity-bar item). Never as decoration, never
  for a highlighted word in a heading.
- Status colours carry meaning only. Do not colour icons for variety.
- No gradients, glows, blurred blobs or glass effects. No `backdrop-blur` except the marketing navbar.

## Type

- **Inter** for all UI. App chrome is 13px (`text-[13px]`), with 12px for secondary metadata and
  14–15px for body copy in dialogs and the dashboard.
- **JetBrains Mono** (`font-mono`) only for content that is code: the editor, terminal output,
  file paths, keyboard shortcuts and file extensions. Not for labels or numbers.
- **Bricolage Grotesque** (`font-display`) only for page titles (Dashboard, Settings) and dialog
  titles. Weight 700–800, tight tracking (`tracking-[-0.02em]`).
- Sentence case everywhere: "Explorer", not "EXPLORER". No uppercase, no letter-spaced labels.
- Hierarchy through weight and colour (`text-foreground` vs `text-muted-foreground`), not size jumps.

## Shape and depth

- Radius: 6px (`rounded-md`) for buttons, inputs, menu items and tabs; 8px (`rounded-lg`) for
  dialogs, menus and popovers. `rounded-full` only for avatars and status dots.
- No pill-shaped buttons, chips or badges. A count is a muted number next to its label: "Projects 12".
- One shadow, `shadow-float`, only on things that float (menus, dialogs, popovers, toasts).
  Nothing that sits in the page has a shadow.
- Separate regions with a 1px `border-rule` hairline or a change of surface (`ink` vs `panel`),
  not by wrapping content in boxes. Lists and tables beat card grids.

## Icons and emoji

- Icons only where they are the expected control: activity bar, icon-only toolbar buttons (each with
  a tooltip and `aria-label`), file-type glyphs in the explorer, chevrons for disclosure.
- No icon next to a heading, section label, stat or menu item that already has a clear text label.
- No icons inside coloured tiles or circles.
- No emoji in the UI, in toasts or in terminal output. Use words and colour: "Finished in 0.42 s"
  in `text-success`, "Exited with code 1" in `text-danger`.

## Controls

- Primary button: `bg-primary text-primary-foreground hover:bg-primary/90 rounded-md h-8 px-3
  text-[13px] font-medium`. At most one per view.
- Secondary button: `border border-rule bg-transparent hover:bg-raised`.
- Quiet button: no border, `hover:bg-raised`, `text-muted-foreground hover:text-foreground`.
- Inputs: `h-8 rounded-md border border-rule bg-ink px-2.5 text-[13px] placeholder:text-faint
  focus-visible:border-primary/60 focus-visible:outline-none`.
- Focus: every interactive element shows a visible focus state (`focus-visible:ring-1
  focus-visible:ring-primary` or the `.focus-ring` utility).
- Keyboard shortcuts are shown in `font-mono text-[11px] text-faint`, without a box around them.

## Layout

- The IDE is a grid of surfaces: top bar (panel), activity bar (panel), side panel (panel), editor
  (ink), bottom panel (ink), status bar (panel). Hairlines between them.
- Section headers inside panels: 12px, semibold, `text-muted-foreground`, sentence case, with actions
  on the right that appear on hover or focus.
- Dashboard and settings content is left aligned, max width about 72rem, with a page title in the
  display face and no "Welcome back" greeting.
- Empty states say what is empty and offer the one action that fixes it, as text plus a button.
  No large illustrations or icon tiles.

## Motion

- Motion answers an action: opening a menu, expanding a folder, a toast arriving. 120–180 ms,
  ease-out. Nothing animates on its own except the caret and a running indicator.
- Respect `prefers-reduced-motion` (`motion-reduce:` variants).

## Writing

- Name things by what the user does: "New project", "Run", "Stop", "Connect GitHub".
- A button and the toast it causes use the same verb: "Delete project" then "Project deleted".
- Errors say what happened and what to do: "Could not reach the code runner. Check your connection
  and run again."
- No exclamation marks, no "Oops", no emoji.
