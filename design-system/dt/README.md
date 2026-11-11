# DT — Dell Technologies design system

**Smart to simple.** DT starts from engineered precision and reduces to calm
clarity. Blue is the ground — Dell's own blue — read as focused, trustworthy,
quiet. One bright sky accent supplies the *clear design-level accent*: used once
per view, never as wallpaper.

DT is deliberately **dependency-free** — system font stacks only, no commercial
faces to license (unlike the WOODWERD system that ships the Today app).

> **Color is grounded, not official.** The palette is built on the widely-published
> **Dell Blue `#0076CE`** plus a midnight navy. Dell's current authoritative values
> live in **Dell Brand Central** (its DDS 2.0 guidance lists `#0672CB` / `#002A58`),
> and the only *official*-looking public spec is ~15 years old (`#0085C3`).
> **Reconcile these tokens against Brand Central before any external/production use.**

## Files

```
design-system/dt/
  tokens.css       primitives + semantic tokens, light & dark themes
  components.css   base components (.dt-*) built only on the tokens
  showcase.html    living spec sheet — open in a browser to review
  README.md        this file
```

## Use it

```html
<link rel="stylesheet" href="design-system/dt/components.css"><!-- imports tokens.css -->
<body class="dt-root"> … </body>
```

Style **through the semantic tokens** (`--dt-text`, `--dt-primary`, `--dt-line`…),
never the raw primitives (`--dt-blue-600`). The semantic layer is what flips
between themes; the primitives are the fixed palette behind it.

## Foundations

### Color
| Token | Light | Role |
|---|---|---|
| `--dt-bg` | `#F3F7FC` | app canvas, blue-tinted |
| `--dt-bg-raised` | `#FFFFFF` | cards, inputs, bars |
| `--dt-text` | `#002A58` | primary ink (Dell midnight) |
| `--dt-text-muted` | `#56688A` | secondary text |
| `--dt-line` | `#D7E2F1` | hairlines & borders |
| `--dt-primary` | `#0076CE` | **Dell Blue** — default action |
| `--dt-accent` | `#00B7E4` | bright sky — one highlight per view |

Semantic signal colors (`--dt-good`, `--dt-warn`, `--dt-crit`) are **separate from
the accent** and only ever encode state.

**Dark theme** re-grounds the same tokens on Dell midnight `#041B3A`; toggle with
`data-theme="dark" | "light"` on `:root`, which overrides the OS
`prefers-color-scheme` default in both directions.

### Type
Two roles, no webfont:
- **Sans** (`--dt-font-sans`, humanist system stack) — everything you read. Tight
  tracking (`--dt-tracking-tight`) and weight 700 carry the display sizes.
- **Mono** (`--dt-font-mono`) — the *smart* voice: eyebrows, labels, counts, data.
  Uppercase + `--dt-tracking-label`. This mono/sans split is DT's signature.

Scale is a ~1.25 modular ramp, `--dt-text-xs` (11px) → `--dt-text-4xl` (62px);
body base is `--dt-text-md` (15px) at `--dt-leading-body` (1.55).

### Space, radius, elevation
- Space: 4px base — `--dt-1` (4px) … `--dt-9` (96px). Let layout `gap` do spacing.
- Radius: crisp, near-sharp — `--dt-radius-sm` 3px, `md` 6px, `lg` 10px, `pill`.
- Elevation: two restrained, blue-tinted shadows (`--dt-shadow-1/2`); focus is a
  sky ring (`--dt-shadow-focus`).

### Motion
`--dt-ease` (a soft decelerate) at `--dt-fast` (120ms) / `--dt-med` (220ms).
Everything collapses under `prefers-reduced-motion: reduce`.

## Components

`.dt-btn` (+ `--primary`, `--accent`, `--ghost`), `.dt-input`, `.dt-chip`
(+ `--blue`, `--accent`), `.dt-card`, `.dt-status` (+ `--good/warn/crit`),
plus type helpers `.dt-eyebrow`, `.dt-display`, `.dt-title`, `.dt-muted`,
`.dt-mono`. See `showcase.html` for every state rendered live.

## Principles
1. **Smart to simple.** Reach for the plainest form that still reads. Precision in
   spacing and type is the design — not ornament.
2. **One accent moment.** Sky marks the single most important action or highlight
   in a view. Two sky things means neither is special.
3. **Dell Blue is the ground, not the shout.** Primary blue does the everyday work;
   neutrals are blue-biased so the whole surface feels of one family.
4. **State has a shape, not just a color.** Status reads through the dot/chip form,
   so it survives colour-blindness and greyscale.
