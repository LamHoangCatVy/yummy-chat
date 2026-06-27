import type { PptxSlideData } from "@yummy/shared"
import { THEME } from "./theme"

// ---------------------------------------------------------------------------
// Slide archetypes
// ---------------------------------------------------------------------------

/** Archetypes derivable for a content slide (title + bullets). */
export type ContentArchetype = "SPLIT_LAYOUT" | "GRID_CARDS" | "STANDARD_CONTENT"

/** All slide archetypes, including the synthesized cover and closing slides. */
export type SlideArchetype = "TITLE_SLIDE" | ContentArchetype | "CLOSING"

// ---------------------------------------------------------------------------
// Bounding box primitive
// ---------------------------------------------------------------------------

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

// ---------------------------------------------------------------------------
// Layout constants (derived from LAYOUT_WIDE = 13.33 x 7.5 in)
// ---------------------------------------------------------------------------

const SLIDE_W = THEME.layout.width
const SLIDE_H = THEME.layout.height
const MARGIN = THEME.layout.margin
const CONTENT_W = SLIDE_W - 2 * MARGIN // 11.93
const CONTENT_TOP = 1.6
const CONTENT_BOTTOM = THEME.layout.footerY - 0.2 // 6.8 — clear of footer
const CONTENT_H = CONTENT_BOTTOM - CONTENT_TOP // 5.2

export const LAYOUT_CONSTANTS = {
  SLIDE_W,
  SLIDE_H,
  MARGIN,
  CONTENT_W,
  CONTENT_TOP,
  CONTENT_BOTTOM,
  CONTENT_H,
} as const

// ---------------------------------------------------------------------------
// Archetype classifier — derives layout from { title, bullets } structure.
// No schema change required: heuristics read the existing strict payload.
// ---------------------------------------------------------------------------

/**
 * Classify a content slide into a layout archetype.
 *
 * - GRID_CARDS:     4+ bullets with short average length (<= 60 chars) →
 *                   discrete items / tools / metrics that read well as cards.
 * - SPLIT_LAYOUT:   1–3 bullets with a substantial title (>= 30 chars) →
 *                   "big idea" title on the left, supporting points on the right.
 * - STANDARD_CONTENT: fallback — clean left-aligned title with bulleted body.
 */
export function classifyContentSlide(slide: PptxSlideData): ContentArchetype {
  const bullets = slide.bullets
  const avgBulletLen = bullets.reduce((sum, b) => sum + b.length, 0) / bullets.length

  if (bullets.length >= 4 && avgBulletLen <= 60) return "GRID_CARDS"
  if (bullets.length <= 3 && slide.title.length >= 30) return "SPLIT_LAYOUT"
  return "STANDARD_CONTENT"
}

// ---------------------------------------------------------------------------
// Bounding box computations per archetype.
// Every element gets an explicit { x, y, w, h } so nothing overlaps.
// ---------------------------------------------------------------------------

/** TITLE_SLIDE — bold left-heavy cover: accent bar + left-aligned title + accent line. */
export function titleSlideBoxes(): {
  accentBar: Box
  title: Box
  accentLine: Box
} {
  const titleX = MARGIN + 0.4
  return {
    accentBar: { x: MARGIN, y: 2.5, w: 0.15, h: 2.5 },
    title: { x: titleX, y: 2.5, w: SLIDE_W - titleX - MARGIN, h: 2.5 },
    accentLine: { x: titleX, y: 5.2, w: 2.0, h: 0.06 },
  }
}

/** SPLIT_LAYOUT — big title left, vertical divider, card with bullets right. */
export function splitLayoutBoxes(): {
  leftTitle: Box
  divider: Box
  rightCard: Box
  rightText: Box
} {
  const leftW = 5.6
  const dividerX = MARGIN + leftW + 0.2
  const rightX = dividerX + 0.4
  const rightW = SLIDE_W - MARGIN - rightX
  return {
    leftTitle: { x: MARGIN, y: 1.5, w: leftW, h: 4.5 },
    divider: { x: dividerX, y: 1.5, w: 0.04, h: 4.5 },
    rightCard: { x: rightX, y: 1.5, w: rightW, h: 4.5 },
    rightText: { x: rightX + 0.3, y: 1.8, w: rightW - 0.6, h: 4.0 },
  }
}

/** STANDARD_CONTENT — left-aligned title with accent bar, bullets inside a card. */
export function standardContentBoxes(): {
  titleAccent: Box
  title: Box
  bodyCard: Box
  bodyText: Box
} {
  return {
    titleAccent: { x: MARGIN, y: 0.5, w: 0.08, h: 0.7 },
    title: { x: MARGIN + 0.25, y: 0.5, w: CONTENT_W - 0.25, h: 0.7 },
    bodyCard: { x: MARGIN, y: CONTENT_TOP, w: CONTENT_W, h: CONTENT_H },
    bodyText: { x: MARGIN + 0.4, y: CONTENT_TOP + 0.3, w: CONTENT_W - 0.8, h: CONTENT_H - 0.6 },
  }
}

/** GRID_CARDS — title at top, then a 2-column grid of cards (one per bullet). */
export function gridTitleBox(): Box {
  return { x: MARGIN, y: 0.5, w: CONTENT_W, h: 0.9 }
}

/** Returns `count` non-overlapping card boxes laid out in 2 columns. */
export function gridCardsBoxes(count: number): Box[] {
  const cols = 2
  const rows = Math.ceil(count / cols)
  const gap = 0.2
  const cardW = (CONTENT_W - gap) / cols
  const cardH = (CONTENT_H - gap * (rows - 1)) / rows
  const boxes: Box[] = []
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    boxes.push({
      x: MARGIN + col * (cardW + gap),
      y: CONTENT_TOP + row * (cardH + gap),
      w: cardW,
      h: cardH,
    })
  }
  return boxes
}

/** CLOSING — centered closing text with a short accent line beneath. */
export function closingSlideBoxes(): {
  text: Box
  accentLine: Box
} {
  return {
    text: { x: 1.0, y: 2.8, w: SLIDE_W - 2.0, h: 2.0 },
    accentLine: { x: SLIDE_W / 2 - 1.0, y: 4.9, w: 2.0, h: 0.06 },
  }
}
