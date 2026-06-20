# yummy-chat Design System

**Status**: Living document · v0.1  
**Last updated**: 2026-06-19  
**Icon library**: [Lucide](https://lucide.dev) (tree-shakeable, SVG, React-native)  
**Primary typeface**: [Geist](https://vercel.com/font) (sans-serif) + Geist Mono (code)  
**Spacing unit**: 4px base  
**Depth strategy**: Tonal-shift

> **Rules**
> - Every color, spacing, and size value is a named token. No raw hex codes or magic numbers in components.
> - Emojis are banned as icons. Use Lucide SVG icons for all UI iconography.
> - All spacing derives from the 4px base unit: tokens are `{n}` where the value is `n * 4px`.
> - This document describes planned and existing patterns; it does not pre-document components that have not been built or scheduled.

---

## 1. Atmosphere and Identity

yummy-chat is a neutral, focused command center for conversing with AI. Its atmosphere is that of a well-lit control room: quiet, precise, and free of visual noise. The interface recedes so the conversation takes center stage.

The identity is technical but warm. Think cockpit instrumentation meets a calm workspace. Nothing decorative exists without a purpose. Every element earns its place through utility.

The visual language is intentionally monochrome, inspired by the calm, low-color aesthetic of modern conversational AI surfaces (e.g. chatgpt.com). A single near-black serves as the only "accent" — used for primary actions, focus rings, and the send control. There are no blue, green, or purple brand accents. Status colors (red for errors, amber for warnings, green for success) are retained but muted, and used only where they convey functional meaning — never decoratively.

Key atmosphere principles:

- **The conversation is the hero.** The chat surface occupies the majority of the viewport. Chrome, controls, and panels are secondary.
- **Neutral foundation.** Grays and slates dominate. Color is used sparingly and intentionally.
- **Clarity over cleverness.** Typographic hierarchy, generous whitespace, and consistent spacing make the interface predictable.
- **Quiet confidence.** No gradients, no heavy shadows, no decorative flourishes. Subtle tonal shifts define surfaces.

---

## 2. Color

### Token Naming Convention

Tokens follow a `role-variant` pattern (e.g., `surface-primary`, `text-secondary`, `border-subtle`). The variant describes the surface role or emphasis level, not the color name. This keeps tokens semantic rather than presentational.

### Surface Tokens

| Token | Light Value | Dark Value | Usage |
|-------|-------------|------------|-------|
| `surface-primary` | `#FFFFFF` | `#212121` | Main app background (chat area, content) |
| `surface-secondary` | `#F9F9F9` | `#171717` | Sidebar, panels, secondary surfaces |
| `surface-tertiary` | `#ECECEC` | `#2F2F2F` | Hover states, elevated cards, dropdowns, avatars |
| `surface-inverse` | `#0D0D0D` | `#FFFFFF` | Accent on dark surfaces, inverted text bg |
| `surface-overlay` | `rgba(0,0,0,0.4)` | `rgba(0,0,0,0.6)` | Scrim, modal backdrops, drawer overlay |

### Text Tokens

| Token | Light Value | Dark Value | Usage |
|-------|-------------|------------|-------|
| `text-primary` | `#0D0D0D` | `#ECECEC` | Body text, headings, primary content |
| `text-secondary` | `#5D5D5F` | `#B4B4B4` | Subtle labels, descriptions, metadata |
| `text-tertiary` | `#8E8E90` | `#8E8E8E` | Placeholder text, disabled states |
| `text-inverse` | `#FFFFFF` | `#0D0D0D` | Text on inverse surfaces (buttons, send) |
| `text-link` | `#0D0D0D` | `#ECECEC` | Links, inline navigation (underlined) |

### Border Tokens

| Token | Light Value | Dark Value | Usage |
|-------|-------------|------------|-------|
| `border-subtle` | `#E9E9E9` | `#2F2F2F` | Default borders, dividers, input edges |
| `border-default` | `#D9D9D9` | `#3A3A3A` | Stronger borders, active states |
| `border-hover` | `#B4B4B4` | `#525252` | Hovered interactive borders, composer focus |
| `border-accent` | `#0D0D0D` | `#ECECEC` | Focus rings, selected states |

### Accent Tokens

Monochrome — black is the only accent. No blue, no purple.

| Token | Light Value | Dark Value | Usage |
|-------|-------------|------------|-------|
| `accent-primary` | `#0D0D0D` | `#ECECEC` | Primary buttons, send control, active toggle |
| `accent-secondary` | `#2A2A2A` | `#A3A3A3` | Secondary icon tint, neutral emphasis |
| `accent-ghost` | `rgba(0,0,0,0.05)` | `rgba(255,255,255,0.10)` | Ghost/hover backgrounds, selection tint |

### Status Tokens

Kept functional and muted — never used decoratively.

| Token | Light Value | Dark Value | Usage |
|-------|-------------|------------|-------|
| `status-success` | `#16A34A` | `#4ADE80` | Success, connected, online |
| `status-warning` | `#D97706` | `#FBBF24` | Warning, rate limit approaching |
| `status-error` | `#D6453D` | `#F87171` | Error, failure, destructive actions |
| `status-info` | `#0D0D0D` | `#ECECEC` | Info, neutral notification |

---

## 3. Typography

### Font Stack

| Role | Stack | Weight Range |
|------|-------|--------------|
| Primary | `Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | 400-700 |
| Monospace | `"Geist Mono", "SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace` | 400-600 |

Geist is the primary typeface for all UI text. Geist Mono is used for code blocks, inline code, numeric data (token counts, timestamps), and any technical display.

### Type Scale

All values in `rem` (16px base). Line heights are unitless for relative sizing.

| Token | Size | Line Height | Weight | Letter Spacing | Usage |
|-------|------|-------------|--------|----------------|-------|
| `text-display` | `2.25rem` / 36px | `1.2` | `600` (semibold) | `-0.025em` | Page titles, empty states |
| `text-heading` | `1.5rem` / 24px | `1.3` | `600` (semibold) | `-0.015em` | Section headers, panel titles |
| `text-subheading` | `1.125rem` / 18px | `1.4` | `500` (medium) | `-0.01em` | Card titles, composer labels |
| `text-body` | `0.9375rem` / 15px | `1.6` | `400` (regular) | `0` | Chat messages, body content, buttons |
| `text-small` | `0.8125rem` / 13px | `1.5` | `400` (regular) | `0` | Metadata, timestamps, secondary labels |
| `text-caption` | `0.75rem` / 12px | `1.4` | `400` (regular) | `0.01em` | Badges, helper text, status indicators |
| `text-overline` | `0.6875rem` / 11px | `1.3` | `500` (medium) | `0.05em` | Section overlines, uppercase labels |

### Code Typography

| Token | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `code-inline` | `0.875em` of parent | `inherit` | Inline code snippets, variable names |
| `code-block` | `0.875rem` / 14px | `1.7` | Multi-line code blocks, rendered output |

---

## 4. Spacing and Layout

### Base Unit

The spacing system uses a 4px base unit. Every spacing value is `n * 4px`, expressed as a token `spacing-{n}`.

| Token | Value | Typical Usage |
|-------|-------|---------------|
| `spacing-1` | 4px | Tight icon gaps, inline element spacing |
| `spacing-2` | 8px | Compact padding, chip inner margins |
| `spacing-3` | 12px | Dense UI padding, small card insets |
| `spacing-4` | 16px | Standard padding, button inner spacing, list gaps |
| `spacing-5` | 20px | Comfortable padding, card body padding |
| `spacing-6` | 24px | Section spacing, form field margins, composer padding |
| `spacing-8` | 32px | Panel padding, horizontal rule spacing |
| `spacing-10` | 40px | Large card padding, modal body padding |
| `spacing-12` | 48px | Section separation, sidebar group spacing |
| `spacing-16` | 64px | Major section breaks, page margins |
| `spacing-20` | 80px | Hero/empty-state spacing, large page sections |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 4px | Small inputs, checkboxes, badges |
| `radius-md` | 8px | Buttons, cards, inputs, dropdowns |
| `radius-lg` | 12px | Dialogs, side panels, large surfaces |
| `radius-xl` | 16px | Chat bubbles (outer), modals |
| `radius-full` | 9999px | Avatars, pills, tags |

### Responsive Breakpoints

| Token | Width | Target |
|-------|-------|--------|
| `bp-sm` | 640px | Mobile landscape, small tablets |
| `bp-md` | 768px | Tablets, sidebar collapse threshold |
| `bp-lg` | 1024px | Desktop, full layout |
| `bp-xl` | 1280px | Wide desktop, maximum content width cap |

### Layout Architecture

The app uses a three-zone layout:

1. **Sidebar** (left, collapsible) — Navigation, conversation history, skill selector
2. **Chat surface** (center, fills remaining width) — Message list, composer, streaming content
3. **Panel** (right, optional, slide-in) — Memory panel, skill configuration, context inspector

On `bp-md` and below, the sidebar collapses into a drawer overlay. The right panel is always overlay on mobile.

Maximum content width for the chat surface is `768px` (centered), keeping line lengths readable.

---

## 5. Components

Components documented here represent planned patterns for the application. Each entry describes the visual contract, not the implementation. Components are built as needed; this list does not imply they all exist today.

### Message Row (`message-row`)

The fundamental message unit, rendered as a full-width row (no bubbles) — mirroring the calm, low-chrome aesthetic of chatgpt.com. Each row contains:

- A small circular avatar (28px, `surface-tertiary`) to the left, with a Lucide icon (`User` for user, `Sparkles` for assistant)
- A name label above the text (`text-[0.8125rem]` semibold, `text-primary`)
- The message body styled at `text-body` with relaxed line height (`1.7`), full width within the centered 48rem container
- No background fill on either user or assistant messages — whitespace alone separates messages
- Vertical rhythm: `spacing-8` between rows, `spacing-1` between name and text
- Streaming state indicated by a subtle animated cursor appended to the text (motion only, no spinner overlay)
- Code blocks within rendered with monospace background and horizontal scroll

### Sidebar (`sidebar`)

Persistent left navigation providing:
- New chat button rendered as a subtle bordered pill (`radius-full`) with a pen icon — no filled accent
- Conversation history list of single-line truncated titles (no timestamps in the row), neutral hover/active via `surface-tertiary`
- User footer at the bottom: name on the left, icon buttons for settings and sign-out on the right
- Collapses to overlay drawer at `bp-md`

### Composer (`composer`)

Multi-line text input anchored to the bottom of the chat surface, styled as a rounded pill (`radius-[28px]`):
- Two-row layout: textarea on top, controls row below
- Auto-resizing textarea (up to 200px)
- Skill selector anchored to the bottom-left of the controls row
- Send control is a circular black button (`accent-primary`, 32px, `radius-full`) with an up-arrow icon, anchored bottom-right
- Disabled send renders muted (`surface-tertiary` + `text-tertiary`); Stop replaces Send during streaming (square icon)
- Enter to send, Shift+Enter for newline
- Subtle border (`border-subtle`) that strengthens on focus (`border-hover`, 150ms)
- Micro-disclaimer line beneath the composer in `text-tertiary`

### Skill Selector (`skill-selector`)

Inline or popover control for selecting an AI skill/persona:
- Trigger rendered as a chip or avatar with current skill name in `text-small`
- Dropdown or popover lists available skills with brief description
- Each skill displayed with a Lucide icon (no emojis)
- Selected state uses a neutral `surface-tertiary` background (no color accent)

### Memory Panel (`memory-panel`)

Optional slide-in panel from the right revealing:
- Current session context and key-value memories
- User preferences inferred or set explicitly
- Editable memory items with delete controls
- Scrolling list with search

---

## 6. Motion and Interaction

### Timing Table

| Token | Duration | Easing | Usage |
|-------|----------|--------|-------|
| `motion-micro` | 100ms | `ease-in-out` | Micro-interactions (button press, toggle switch, check state) |
| `motion-standard` | 200ms | `ease-out` | Most transitions (hover, focus, panel slide, color shifts, border changes) |
| `motion-emphasis` | 350ms | `ease-in-out` | Emphasis transitions (modal open/close, page enter/exit, sidebar collapse) |
| `motion-scroll` | 600ms | `cubic-bezier(0.22, 1, 0.36, 1)` | Scroll-driven reveals, smooth-scroll, list reordering |

### Motion Principles

- **Fast and functional.** Default transitions complete within 200ms. The interface never makes the user wait for an animation to finish.
- **Subtle by default.** Opacity and non-interpolated transforms (translateY, scale) preferred over width/height animations.
- **Reduce motion.** All motion uses `prefers-reduced-motion` as a CSS media query. When active, transitions drop to 0ms duration or skip entirely.
- **Streaming text** is the one exception to the speed rule. Token-by-token appearance uses natural pacing (no artificial delay, just render as received).

### Interaction Patterns

| Pattern | Behavior |
|---------|----------|
| Hover | 150ms `opacity` or `background` transition to `surface-tertiary` |
| Focus | 2px `border-accent` with 2px offset outline using `accent-ghost` |
| Active/Press | Scale 0.98 on interactive elements with `motion-micro` timing |
| Disabled | Opacity 0.4, no hover effects, `not-allowed` cursor |
| Panel slide | TranslateX with `motion-emphasis` and `ease-in-out` |
| Sidebar collapse | Width transition with `motion-emphasis`, content fades with opacity |

---

## 7. Depth and Surface

### Strategy: Tonal-Shift

Depth is communicated exclusively through tonal shifts in surface color, not through box shadows or elevation. This is the chosen strategy and it applies to all components.

**Why tonal-shift:**
- Preserves the flat, clean aesthetic appropriate for a command-center interface
- Avoids the visual weight of shadows that can make a chat surface feel cluttered
- Works consistently across light and dark modes (shadows in dark mode are often invisible or require heavy compensation)
- Reduces the token surface: no shadow token definitions needed

### Depth Layers

| Layer | Token | Light Value | Dark Value | Relationship |
|-------|-------|-------------|------------|--------------|
| Ground | `surface-primary` | `#FFFFFF` | `#0F0F10` | Base canvas, chat surface |
| Raised | `surface-secondary` | `#F5F5F5` | `#1A1A1C` | Sidebar, cards, input areas |
| Elevated | `surface-tertiary` | `#EDEDED` | `#252527` | Hovered items, dropdowns, tooltips |
| Overlay | `surface-overlay` | `rgba(0,0,0,0.04)` | `rgba(255,255,255,0.04)` | Modals, drawers, scrim backdrops |

Each layer is exactly one step lighter (dark mode) or darker (light mode) than the previous. This creates a consistent, predictable depth hierarchy without shadows.

### Border Usage

Borders provide secondary depth cues. The `border-subtle` token separates surfaces at the same layer. The `border-default` token separates surfaces across layers. This means:
- Adjacent cards at `surface-secondary` use `border-subtle`
- A sidebar (`surface-secondary`) next to the chat surface (`surface-primary`) uses no border on the sidebar side — the tonal shift alone is sufficient

---

## Appendix A: Design Tokens Reference

All design tokens are collected in the table above. In code, tokens should be consumed through CSS custom properties (light/dark class switching) with the naming convention `--yummy-{category}-{token}`:

```css
:root {
  --yummy-surface-primary: #FFFFFF;
  --yummy-text-primary: #171717;
  --yummy-spacing-4: 16px;
  --yummy-motion-standard: 200ms;
}

.dark {
  --yummy-surface-primary: #0F0F10;
  --yummy-text-primary: #EDEDED;
}
```

## Appendix B: Iconography

- All UI icons use [Lucide](https://lucide.dev) SVG icons.
- Icons are rendered at `16px` (default) or `20px` (dense toolbar) using the `lucide-react` package.
- Decorative icons (illustrative, not interactive) use the same Lucide set with reduced opacity (`text-tertiary`).
- Emojis are never used as icons or in place of iconography.
