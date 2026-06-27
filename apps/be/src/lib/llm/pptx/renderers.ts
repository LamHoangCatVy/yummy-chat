import type { PptxSlideData } from "@yummy/shared"
import type PptxGenJS from "pptxgenjs"
import {
  type Box,
  classifyContentSlide,
  closingSlideBoxes,
  gridCardsBoxes,
  gridTitleBox,
  splitLayoutBoxes,
  standardContentBoxes,
  titleSlideBoxes,
} from "./layout"
import { THEME } from "./theme"

// `PptxGenJS` is the class; as a type it denotes the instance type.
// `Slide` is derived from the instance method return type to avoid namespace access.
type Pptx = PptxGenJS
type Slide = ReturnType<Pptx["addSlide"]>

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Build pptxgenjs text-runs for a bulleted list with consistent spacing. */
function bulletRuns(bullets: string[], fontSize = THEME.typography.bulletSize) {
  return bullets.map((text) => ({
    text,
    options: {
      bullet: { code: THEME.typography.bulletCharCode },
      fontSize,
      color: THEME.colors.textDark,
      fontFace: THEME.typography.fontFace,
      paraSpaceAfter: 12,
    },
  }))
}

/**
 * Draw a card: a subtle surface-fill rectangle with a border, plus a thin
 * accent bar on its left edge. Used by SPLIT_LAYOUT, GRID_CARDS and
 * STANDARD_CONTENT to group text inside a "human-designed" container.
 */
function addCardWithAccent(
  pptx: Pptx,
  slide: Slide,
  card: Box,
  accentColor: string = THEME.colors.accent,
): void {
  // Card background
  slide.addShape(pptx.ShapeType.rect, {
    x: card.x,
    y: card.y,
    w: card.w,
    h: card.h,
    fill: { color: THEME.colors.surface },
    line: { color: THEME.colors.border, width: 1 },
  })
  // Accent bar on the left edge
  slide.addShape(pptx.ShapeType.rect, {
    x: card.x,
    y: card.y,
    w: 0.06,
    h: card.h,
    fill: { color: accentColor },
  })
}

// ---------------------------------------------------------------------------
// TITLE_SLIDE — bold left-heavy cover: accent bar + left-aligned title + accent line
// ---------------------------------------------------------------------------

export function renderTitleSlide(pptx: Pptx, title: string): void {
  const slide = pptx.addSlide({ masterName: THEME.masterName })
  const { accentBar, title: titleBox, accentLine } = titleSlideBoxes()

  // Vertical accent bar (primary) to the left of the title
  slide.addShape(pptx.ShapeType.rect, {
    x: accentBar.x,
    y: accentBar.y,
    w: accentBar.w,
    h: accentBar.h,
    fill: { color: THEME.colors.primary },
  })

  // Title — left-aligned, vertically centered, large bold
  slide.addText(title, {
    x: titleBox.x,
    y: titleBox.y,
    w: titleBox.w,
    h: titleBox.h,
    align: "left",
    valign: "middle",
    fontSize: THEME.typography.titleSize,
    bold: true,
    color: THEME.colors.textDark,
    fontFace: THEME.typography.fontFace,
  })

  // Short accent line beneath the title (warm accent color)
  slide.addShape(pptx.ShapeType.rect, {
    x: accentLine.x,
    y: accentLine.y,
    w: accentLine.w,
    h: accentLine.h,
    fill: { color: THEME.colors.accent },
  })
}

// ---------------------------------------------------------------------------
// SPLIT_LAYOUT — big title left, vertical divider, card with bullets right
// ---------------------------------------------------------------------------

export function renderSplitLayout(pptx: Pptx, data: PptxSlideData): void {
  const slide = pptx.addSlide({ masterName: THEME.masterName })
  const { leftTitle, divider, rightCard, rightText } = splitLayoutBoxes()

  // Left column: big title, primary color, vertically centered
  slide.addText(data.title, {
    x: leftTitle.x,
    y: leftTitle.y,
    w: leftTitle.w,
    h: leftTitle.h,
    align: "left",
    valign: "middle",
    fontSize: 32,
    bold: true,
    color: THEME.colors.primary,
    fontFace: THEME.typography.fontFace,
  })

  // Vertical divider between columns
  slide.addShape(pptx.ShapeType.rect, {
    x: divider.x,
    y: divider.y,
    w: divider.w,
    h: divider.h,
    fill: { color: THEME.colors.border },
  })

  // Right column: card with accent bar + bullets
  addCardWithAccent(pptx, slide, rightCard)
  slide.addText(bulletRuns(data.bullets), {
    x: rightText.x,
    y: rightText.y,
    w: rightText.w,
    h: rightText.h,
    valign: "top",
    color: THEME.colors.textDark,
    fontFace: THEME.typography.fontFace,
  })
}

// ---------------------------------------------------------------------------
// GRID_CARDS — title at top, then a 2-column grid of cards (one per bullet)
// ---------------------------------------------------------------------------

export function renderGridCards(pptx: Pptx, data: PptxSlideData): void {
  const slide = pptx.addSlide({ masterName: THEME.masterName })
  const titleBox = gridTitleBox()

  // Title — left-aligned at top
  slide.addText(data.title, {
    x: titleBox.x,
    y: titleBox.y,
    w: titleBox.w,
    h: titleBox.h,
    align: "left",
    valign: "middle",
    fontSize: THEME.typography.slideTitleSize,
    bold: true,
    color: THEME.colors.textDark,
    fontFace: THEME.typography.fontFace,
  })

  // Grid of cards — one per bullet. Guard narrows both card and bullet
  // (noUncheckedIndexedAccess types indexed access as T | undefined).
  const cards = gridCardsBoxes(data.bullets.length)
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    const bullet = data.bullets[i]
    if (!card || !bullet) continue
    addCardWithAccent(pptx, slide, card)
    slide.addText(bullet, {
      x: card.x + 0.25,
      y: card.y,
      w: card.w - 0.35,
      h: card.h,
      align: "left",
      valign: "middle",
      fontSize: THEME.typography.bodySize,
      color: THEME.colors.textDark,
      fontFace: THEME.typography.fontFace,
    })
  }
}

// ---------------------------------------------------------------------------
// STANDARD_CONTENT — left-aligned title with accent bar, bullets inside a card
// ---------------------------------------------------------------------------

export function renderStandardContent(pptx: Pptx, data: PptxSlideData): void {
  const slide = pptx.addSlide({ masterName: THEME.masterName })
  const { titleAccent, title, bodyCard, bodyText } = standardContentBoxes()

  // Accent bar beside the title
  slide.addShape(pptx.ShapeType.rect, {
    x: titleAccent.x,
    y: titleAccent.y,
    w: titleAccent.w,
    h: titleAccent.h,
    fill: { color: THEME.colors.accent },
  })

  // Title — left-aligned, vertically centered
  slide.addText(data.title, {
    x: title.x,
    y: title.y,
    w: title.w,
    h: title.h,
    align: "left",
    valign: "middle",
    fontSize: THEME.typography.slideTitleSize,
    bold: true,
    color: THEME.colors.textDark,
    fontFace: THEME.typography.fontFace,
  })

  // Body card with primary-colored accent bar + bulleted text
  addCardWithAccent(pptx, slide, bodyCard, THEME.colors.primary)
  slide.addText(bulletRuns(data.bullets), {
    x: bodyText.x,
    y: bodyText.y,
    w: bodyText.w,
    h: bodyText.h,
    valign: "top",
    color: THEME.colors.textDark,
    fontFace: THEME.typography.fontFace,
  })
}

// ---------------------------------------------------------------------------
// CLOSING — centered closing text with a short accent line beneath
// ---------------------------------------------------------------------------

export function renderClosingSlide(pptx: Pptx, closingText: string): void {
  const slide = pptx.addSlide({ masterName: THEME.masterName })
  const { text, accentLine } = closingSlideBoxes()

  slide.addText(closingText, {
    x: text.x,
    y: text.y,
    w: text.w,
    h: text.h,
    align: "center",
    valign: "middle",
    fontSize: THEME.typography.closingSize,
    bold: true,
    color: THEME.colors.textDark,
    fontFace: THEME.typography.fontFace,
  })

  slide.addShape(pptx.ShapeType.rect, {
    x: accentLine.x,
    y: accentLine.y,
    w: accentLine.w,
    h: accentLine.h,
    fill: { color: THEME.colors.accent },
  })
}

// ---------------------------------------------------------------------------
// Dispatcher — classifies a content slide and routes to the right renderer
// ---------------------------------------------------------------------------

export function renderContentSlide(pptx: Pptx, data: PptxSlideData): void {
  switch (classifyContentSlide(data)) {
    case "SPLIT_LAYOUT":
      renderSplitLayout(pptx, data)
      break
    case "GRID_CARDS":
      renderGridCards(pptx, data)
      break
    case "STANDARD_CONTENT":
      renderStandardContent(pptx, data)
      break
  }
}
