# Learning App Design System

A design system for a mobile e-learning app: track course progress, browse courses, review weekly learning time. Dark near-black UI carrying soft pastel cards (lilac, sage, butter).

## Sources
- `uploads/ab00353325e4599da77876a619bc9fc4.webp` — a single 2048×1536 Dribbble-style mock of three phone screens (Onboarding, Home "Your Progress Today", "Learning Time Overview"). This is the **only** source. No codebase, Figma, brand name, logo or font files were supplied. All colors were pixel-sampled from it; sizes were measured and scaled ×0.7 to a 390pt screen.

**No logo exists** in the source. Wherever a mark is needed, render "Learning App" in Poppins SemiBold as a placeholder.

## Content fundamentals
- **Voice:** friendly, motivational, second person implied ("Your Progress Today", "Start Learning Today"). Greets the user by full name: "Good Morning," / "John Smith Bruno".
- **Casing:** Title Case for every heading, card title, chip and label ("Lessons & Time", "Full Course", "View all" is the one sentence-case link).
- **Length:** headings 2–4 words, wrapping to two lines by design. Card subtitles are one short line.
- **Numbers:** percentages as "88%", durations as "12h : 39m : 50s" (spaced colons), overflow counts as "10+", dates "07 November" (zero-padded day).
- **Ampersand** over "and" in headers. No exclamation marks. **No emoji.**
- Examples: "Start Learning Today", "Your Progress Today", "Design Management from Scratch", "Professional Video Editing From Noob - Pro", "Learning Time Overview", "This Week".

## Visual foundations
- **Color:** app bg `--ink-1` #1b1a1d; raised circles/sheets `--ink-2` #2a292e; chips `--ink-3`. Content lives in pastel cards: lilac #c5afe4, sage #cfdecb, butter #fee7a6. Text is white on ink, near-black on pastel. Grey #8f8f91 for secondary text on dark. Pure black #000 is reserved for action circles and small value badges.
- **Type:** Poppins throughout. SemiBold 32–34 for screen titles (two lines), Medium 22 card titles, Medium 19 section headers, Regular 15–16 body, 13 captions, 11 badges, Medium 40 stat numerals. Use tabular numerals for scores, percentages, records, and other dynamic stats; do not apply them automatically to ordinary body-copy numbers.
- **Spacing:** 20px screen padding, 22px card padding, 10–12px gaps between sibling cards, ~26px between vertical sections.
- **Corner radii:** very round. Cards 26px (chart panel 34px), sheets 34px top corners, every control a circle or pill. No square corners anywhere.
- **Cards:** flat fill, no border, no shadow. A stacked variant shows a darker (#3a393e) card edge peeking below — the only "depth" cue.
- **Shadows:** essentially none. A faint soft shadow only on the light chart tooltip.
- **Borders:** 1px only for the active chip (#c9c9cb) and the outlined search button (#3a393e).
- **Gradients:** a single one — the progress fill, lilac #b197d2 → ink #2f2b33 on a white track. No background gradients.
- **Transparency:** translucent white (rgba 255,255,255,.55) for inset pills/icon badges on pastel cards. No blur.
- **Imagery:** warm flat gouache-style illustration (florals, books) on sage, full-bleed on onboarding; real circular portrait photos for avatars. Stat cards have faint tonal floral shapes (not extracted).
- **Layout:** single column mobile, 390 wide; stat cards in a 2-col grid; horizontally scrolling chip row bleeds off the right edge. Onboarding: image top ~65%, dark sheet bottom.
- **Motion (not in source — conservative defaults):** short ease-out (140–220ms) for chip/bar state changes; press state = scale .94 on circular buttons. No bounces.
- **Hover/press:** mobile-first; press shrinks. Active chip swaps fill for outline.

## Iconography
- Thin outline icons, ~1.6px stroke, rounded caps: bell, search, chevron-left, chevron-down, arrow-up-right, arrow-right, calendar, timer, tablet/book, play (filled). Always sat inside a circle.
- No icon files were supplied. **Substitution:** [Lucide](https://lucide.dev) via CDN (`https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js`), rendered through the `Icon` component by PascalCase name. Closest match to the mock's stroke style.
- No emoji, no unicode glyph icons.

## Tokens & fonts
`styles.css` imports `tokens/fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`. Poppins loads from Google Fonts (substitution — matched by eye, no binaries provided).

## Components
All in `components/`; each has `.jsx`, `.d.ts`, `.prompt.md` and a card per directory.
- core: **Icon**, **IconButton**, **Chip**, **Badge**
- data: **ProgressBar**, **BarChart**
- cards: **Card**, **CourseCard**, **StatCard**
- people: **Avatar**, **AvatarStack**
- navigation: **TopBar**, **Greeting**, **SectionHeader**

### Intentional additions
- **Icon** — wrapper around Lucide so all glyphs share stroke/size.
- No text Button, Input, Dialog etc. — the source has none. Every action is a circular IconButton.

## Index
- `styles.css`, `tokens/` — tokens and fonts
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand)
- `components/` — primitives (above)
- `ui_kits/mobile-app/` — interactive Onboarding → Home → Overview recreation
- `assets/` — `illustration-books.png`, `avatar-john.png`, `avatar-stack.png` (cropped from the mock; low-res)
- `SKILL.md` — agent skill entry
