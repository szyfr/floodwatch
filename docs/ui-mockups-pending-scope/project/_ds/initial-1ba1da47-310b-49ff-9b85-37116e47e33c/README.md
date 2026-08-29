# shadcn/ui Design System

A high-fidelity recreation of the **shadcn/ui** component library — the open-source, Tailwind-flavored component collection that ships with every modern Next.js / Vite starter. Originally built by [@shadcn](https://ui.shadcn.com) and continuously extended by the community.

This system was extracted from the *"shadcn_ui components with variables & Tailwind classes - Updated January 2026 (Community)"* Figma file (83 pages, ~160 frames). Tokens, colors, spacing and typography are lifted directly from the Figma source of truth.

## Sources

- **Figma:** *shadcn_ui components with variables & Tailwind classes — Updated January 2026 (Community)* — mounted as a virtual filesystem at the time of build. 83 pages covering every shadcn primitive (Button, Card, Input, …), composed Blocks (Dashboard, Tasks, Playground, Authentication), Charts (Area, Bar, Line, Pie, Radar, Radial) and full icon libraries (Lucide, Tabler, HugeIcons, Phosphor, Remix).
- **Upstream library:** https://ui.shadcn.com — Radix-based components, Tailwind tokens, CLI-installed.
- **Color philosophy:** Tailwind's neutral scale + a single accent (the *new-york* style), light & dark modes via CSS variable swaps.
- **Typography:** Geist (display & body) + Inter (UI) + Geist Mono (code). All on Google Fonts.
- **Iconography:** [Lucide](https://lucide.dev) — the default shadcn icon set.

## Product context

shadcn/ui isn't really a product — it's a *recipe collection*. Each component is copy-pasted into your codebase rather than installed as a package, so the design system has to be unusually opinionated about defaults while still being easy to fork. The aesthetic is therefore: **calm, neutral, low-contrast chrome with high-contrast intent.** White cards on white pages, hairline borders, restrained shadows, and a single near-black primary so any actual brand color you layer on top reads as the loudest thing on screen.

Three surfaces are represented in the Figma file:

1. **Component catalog** — every primitive shown in its own framed card (Button, Card, Input, etc.)
2. **Blocks** — composed screens that ship as installable templates: Dashboard, Tasks, Playground, Authentication, Login/Signup, OTP, Calendar.
3. **Charts** — Recharts-based wrappers in six flavors (Area, Bar, Line, Pie, Radar, Radial) plus Tooltip variants.

The "product" we're recreating in `ui_kits/` is therefore the **shadcn docs site itself** — the canonical surface where every component lives next to its name, description and code preview — plus a couple of the most-copied block templates (Dashboard, Login).

## Index

| File | Purpose |
| --- | --- |
| `README.md` | This file. Brand, content, visuals, iconography. |
| `SKILL.md` | Agent Skill manifest so this system can be invoked by Claude Code / agent skills. |
| `colors_and_type.css` | All CSS variables — colors, type, radii, shadows, spacing — light + dark mode. |
| `fonts/` | (Empty — fonts loaded from Google Fonts CDN, see Caveats.) |
| `assets/` | Lucide icons, brand mark, screenshots referenced by the catalog. |
| `preview/` | One small HTML card per token group / component cluster (renders the Design System tab). |
| `ui_kits/docs/` | Recreation of the shadcn.com docs page — sidebar, component preview, code tabs. |
| `ui_kits/dashboard/` | Recreation of the Dashboard block — sidebar, KPIs, table, chart. |

## Content fundamentals

shadcn's voice is **plain, declarative, code-adjacent.** It reads like the kind of one-line description you'd put above a function signature.

- **Sentence case everywhere.** Headings, buttons, table cells. Not Title Case, not ALL CAPS (except in `<code>`).
- **Component descriptions are one sentence, present tense, third-person.** Examples lifted directly from the Figma:
  - *"Displays a button or a component that looks like a button."*
  - *"Displays a card with header, content, and footer."*
  - *"Displays a form input field or a component that looks like an input field."*
  - *"A vertically stacked set of interactive headings that each reveal a section of content."*
- **First-person is allowed in onboarding / about copy.** From the kit's About page: *"Thanks so much for choosing to use this file"*, *"I actually use this exact kit in my own daily design work."* Warm, conversational, low-stakes.
- **You-voice in forms.** *"Enter your email below to login to your account"*, *"Forgot password?"*, *"Don't have an account? Sign up."*
- **Buttons are verbs, not gerunds.** *Login*, *Sign up*, *Submit*, *Continue with Google* — never *Logging in...* except as a loading state.
- **No marketing fluff.** No exclamation points, no "🎉", no "let's get started!". The most exuberant the kit gets is a single 💛 emoji in the About copy. Emoji are otherwise **not used** in UI chrome.
- **Numbers and counts are bare.** Badge says `99` or `20+`, not `99 unread items`.
- **Error / destructive copy is direct.** *"Are you absolutely sure?"*, *"This action cannot be undone."* — short, second-person, no apology.

## Visual foundations

### Color
A two-tier neutral scale plus one accent. The **same hue** runs from background → border → muted → text in measured steps — never blue-gray, never warm-gray, just true `oklch`-style neutral.

- **Foreground** `rgb(10,10,10)` (`neutral-950`) — body text, headings.
- **Muted foreground** `rgb(115,115,115)` (`neutral-500`) — descriptions, placeholders.
- **Primary** `rgb(23,23,23)` (`neutral-900`) — primary button bg, dark accents.
- **Border** `rgb(229,229,229)` (`neutral-200`) — every hairline divider.
- **Muted / secondary surface** `rgb(245,245,245)` (`neutral-100`) — chip backgrounds, hover fills.
- **Accent surface** `rgb(250,250,250)` (`neutral-50`) — sidebar / toolbar tint.
- **Background** `#ffffff` (pure white).
- **Destructive** `rgb(220,38,38)` (`red-600`) — the *only* saturated color in the chrome.
- **Charts** — a single hue ramp: `rgb(0,144,255)` (blue-500), `rgb(94,177,239)`, `rgb(5,136,240)`, `rgb(13,116,206)`, `rgb(17,50,100)`. Occasional `rgb(173,250,29)` (lime) and `rgb(124,58,237)` (violet) as data accents.

Dark mode is the same scale inverted: `neutral-950` → `neutral-50` and back. Defined in `colors_and_type.css`.

### Typography
- **Geist** for everything by default. 400 / 500 / 700 weights.
- **Inter** appears specifically on **button labels** and some form labels — the original shadcn site uses Geist throughout, the Figma uses Inter on interactive controls. Either is correct; treat them as interchangeable.
- **Geist Mono / Roboto Mono** for code samples, OTP digits, keyboard chips.
- **Scale (px / line-height):** 12/16, 13/20, 14/20, 16/24, 18/28, 20/28, 24/32, 30/36, 36/40, 48/56.
- **Headings** are weight 700, ultra-tight (line-height ≤ size+4). Body is weight 400, line-height 1.5.
- **Button text is always 14/20 weight 500.** Never larger.

### Spacing
A pure multiple-of-4 scale: 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 56, 80. Cards pad **24px** internally; outer doc-style containers pad **56px**. Form rows gap **12–16px**, button rows gap **8px**.

### Radii
- **6** — tag-shaped small buttons (the "View in Shadcn" chip).
- **8** — inputs, textareas, search fields.
- **10** — all standard buttons.
- **12** — small cards, dialog content, badge groups.
- **14** — composed-block outer card.
- **16, 20, 24** — large hero containers.
- **999** (full) — avatars, pills, the round number-badge variant.

### Shadows
Spec is restrained — the entire system has **three** elevation tokens:
- `xs`: `0 1px 2px 0 rgba(0,0,0,0.05)` — default buttons, inputs.
- `sm`: `0 1px 2px 0 rgba(0,0,0,0.1)` — hover state of buttons, the "View in Shadcn" link chip.
- `md`: `0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)` — popovers, dropdowns, toasts.

Shadows are **not** used for depth-as-decoration. A card by itself has no shadow — it has a 1px border. Shadow appears only on **interactive surfaces** (button, input) and **floating overlays** (popover, toast).

### Borders
- Width is **always 1px**. There are no 2px borders, no double borders, no thicker focus rings.
- Color is `neutral-200` (border) or `neutral-300` for the active/focus state on inputs (the spec uses `rgb(115,115,115)` on the active input, which is darker — see Input/StateActive).
- **Dashed borders** (`1px dashed neutral-200`) are used to fence off *examples* in the catalog. Don't use them in product UI.

### Backgrounds
- Pure white on the page, pure white on cards.
- The sidebar / toolbar gets a faint `neutral-50` tint to recede.
- **No gradients, no textures, no patterns, no full-bleed photography** in the chrome itself. Photography (when present) is rectangular, full-color, untreated — it's content, not decoration.
- A **dashed-border + neutral-100 fill** rectangle is the universal "drop a file here" / "example slot" pattern.

### Hover / press
- **Hover on button** = lighten / darken by ~20% (`opacity: 0.8` on primary; secondary goes from `neutral-100` → `neutral-200`). Spec'd in Figma component state pairs.
- **Hover on link** = underline appears, color unchanged.
- **Hover on icon-only button** = `neutral-100` fill appears.
- **Press** = no scale, no animation — just the hover treatment held.
- **Focus** = 2px ring `ring-2 ring-ring/50` in Tailwind. In the kit this is rendered as a 1px darker border on inputs and a 2px outer ring on buttons.

### Motion
- The kit is mostly static. Where motion exists (Drawer, Sheet, Dialog, Sonner), it's a **150–200ms cubic-bezier(0.4, 0, 0.2, 1)** slide/fade.
- No bounce, no overshoot. No spring. The aesthetic is "calm, not playful."
- Skeleton loaders **pulse** (opacity 0.5 ↔ 1, 1.5s ease-in-out infinite).

### Transparency & blur
- **Overlays** (dialog backdrop) are `bg-black/50` — no blur.
- **Hover hint backdrops** (Hover Card) are solid white with shadow — no blur.
- **Sidebar** is opaque. No frosted glass anywhere.

### Layout
- **Sidebar widths** are 255px (compact) or 280px (default).
- **Page max-width** in the docs surface is 1280px. Dashboard block is 1333px wide × 1413px tall (the outer Figma frame).
- **Content gutters** in the docs: 32px between sidebar and content, 24px between content blocks.
- **Top navbar** is 56–64px tall. Tabs/sub-navbars are 40px.

### Cards
A card is `1px solid neutral-200`, `border-radius 12–14`, `bg white`, `padding 24`. Optionally a `boxShadow xs` if it's primarily interactive (e.g. a clickable preview card). Otherwise **no shadow.**

## Iconography

**Lucide is the default.** shadcn ships with `lucide-react` and every component example uses it. The Figma file additionally bundles Tabler, HugeIcons, Phosphor and Remix as alternative pages — that's about *choice*, not endorsement.

- **Style:** outline, 1.5–2px stroke, square caps, no fill.
- **Size:** 16×16 inside buttons, 20×20 in nav, 24×24 in headers.
- **Color:** `currentColor` — they inherit text color. Muted foreground when decorative, foreground when interactive.
- **Emoji:** *Not used* in product UI. The only emoji that appears in the entire kit is a single 💛 in the About-the-library copy. Don't use them in slides, mocks or production for this brand.
- **Unicode glyphs:** Don't substitute (e.g. don't use `→` instead of a Lucide `arrow-right`).

We load Lucide from CDN (`unpkg.com/lucide-static`) rather than redrawing icons. See `assets/` for a few common SVGs cached locally and `ui_kits/` for usage examples.

## Caveats

- **Fonts:** Geist, Inter and Geist Mono are all loaded from Google Fonts via `@import`. No `.ttf` / `.woff2` files are bundled in `fonts/`. If you need the system to work offline, drop the woff2 files in `fonts/` and update `colors_and_type.css`.
- The Figma file is a **community fan-recreation**, not Vercel's official figma kit. Token names match `shadcn/ui` semantics (`bg`, `fg`, `muted-foreground`, …) but pixel values were measured from the .fig and may drift 1px from the upstream library.
- Dark-mode values are inferred from the Figma's variable-mode swap; cross-check against `https://ui.shadcn.com` if you ship dark UI.

## How to ask the agent to iterate

Tell the agent which surface to revise and what's off — *"the dashboard sidebar should collapse to icon-only at 1024px"*, *"the destructive button has the wrong red, use red-500 not red-600"*. The system is built to be remixed.
