import type { PptxSlideData } from "@yummy/shared"
import { describe, expect, it } from "vitest"
import {
  LAYOUT_CONSTANTS,
  classifyContentSlide,
  closingSlideBoxes,
  gridCardsBoxes,
  gridTitleBox,
  splitLayoutBoxes,
  standardContentBoxes,
  titleSlideBoxes,
} from "./layout"

// ---------------------------------------------------------------------------
// classifyContentSlide
// ---------------------------------------------------------------------------

describe("classifyContentSlide", () => {
  function slide(title: string, bullets: string[]): PptxSlideData {
    return { title, bullets }
  }

  it("classifies 4+ short bullets as GRID_CARDS", () => {
    expect(classifyContentSlide(slide("Tools", ["Git", "Docker", "K8s", "Terraform"]))).toBe(
      "GRID_CARDS",
    )
  })

  it("classifies 1-3 bullets with a long title (>=30 chars) as SPLIT_LAYOUT", () => {
    const longTitle = "Building Resilient Distributed Systems"
    expect(classifyContentSlide(slide(longTitle, ["Use retries", "Add circuit breakers"]))).toBe(
      "SPLIT_LAYOUT",
    )
  })

  it("classifies 1-3 bullets with a short title (<30 chars) as STANDARD_CONTENT", () => {
    expect(classifyContentSlide(slide("Metrics", ["Revenue up", "Costs down"]))).toBe(
      "STANDARD_CONTENT",
    )
  })

  it("classifies a single bullet with a short title as STANDARD_CONTENT", () => {
    expect(classifyContentSlide(slide("Slide 1", ["Point A"]))).toBe("STANDARD_CONTENT")
  })

  it("classifies 4+ long bullets (avg > 60 chars) as STANDARD_CONTENT, not GRID_CARDS", () => {
    const longBullets = [
      "This is a very long bullet point that exceeds the sixty-character threshold for grid cards",
      "Another lengthy bullet that clearly goes beyond the short item heuristic limit",
    ]
    expect(classifyContentSlide(slide("Summary", longBullets))).toBe("STANDARD_CONTENT")
  })

  it("classifies a single bullet with a long title as SPLIT_LAYOUT", () => {
    expect(
      classifyContentSlide(
        slide("A Very Long Title That Crosses The Thirty Char Mark", ["One point"]),
      ),
    ).toBe("SPLIT_LAYOUT")
  })

  it("GRID_CARDS boundary: exactly 4 bullets with avg length exactly 60 chars", () => {
    const bullets = ["a".repeat(60), "b".repeat(60), "c".repeat(60), "d".repeat(60)]
    expect(classifyContentSlide(slide("List", bullets))).toBe("GRID_CARDS")
  })

  it("SPLIT_LAYOUT boundary: title length exactly 30 chars with <=3 bullets", () => {
    expect(classifyContentSlide(slide("a".repeat(30), ["x", "y"]))).toBe("SPLIT_LAYOUT")
  })
})

// ---------------------------------------------------------------------------
// Bounding box helpers — in-bounds and non-overlapping guarantees
// ---------------------------------------------------------------------------

describe("titleSlideBoxes", () => {
  it("returns boxes within slide bounds", () => {
    const { accentBar, title, accentLine } = titleSlideBoxes()
    for (const box of [accentBar, title, accentLine]) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.w).toBeLessThanOrEqual(LAYOUT_CONSTANTS.SLIDE_W)
      expect(box.y + box.h).toBeLessThanOrEqual(LAYOUT_CONSTANTS.SLIDE_H)
    }
  })
})

describe("splitLayoutBoxes", () => {
  it("left and right columns do not overlap", () => {
    const { leftTitle, rightCard } = splitLayoutBoxes()
    expect(leftTitle.x + leftTitle.w).toBeLessThanOrEqual(rightCard.x)
  })

  it("all boxes are within slide bounds", () => {
    const { leftTitle, divider, rightCard, rightText } = splitLayoutBoxes()
    for (const box of [leftTitle, divider, rightCard, rightText]) {
      expect(box.x + box.w).toBeLessThanOrEqual(LAYOUT_CONSTANTS.SLIDE_W)
      expect(box.y + box.h).toBeLessThanOrEqual(LAYOUT_CONSTANTS.SLIDE_H)
    }
  })
})

describe("standardContentBoxes", () => {
  it("title accent bar is left of the title text", () => {
    const { titleAccent, title } = standardContentBoxes()
    expect(titleAccent.x + titleAccent.w).toBeLessThanOrEqual(title.x)
  })

  it("body text sits inside the body card", () => {
    const { bodyCard, bodyText } = standardContentBoxes()
    expect(bodyText.x).toBeGreaterThanOrEqual(bodyCard.x)
    expect(bodyText.y).toBeGreaterThanOrEqual(bodyCard.y)
    expect(bodyText.x + bodyText.w).toBeLessThanOrEqual(bodyCard.x + bodyCard.w)
    expect(bodyText.y + bodyText.h).toBeLessThanOrEqual(bodyCard.y + bodyCard.h)
  })
})

describe("gridCardsBoxes", () => {
  it("returns exactly `count` boxes", () => {
    expect(gridCardsBoxes(4)).toHaveLength(4)
    expect(gridCardsBoxes(8)).toHaveLength(8)
    expect(gridCardsBoxes(5)).toHaveLength(5)
  })

  it("produces non-overlapping cards for a 2x2 grid", () => {
    const cards = gridCardsBoxes(4)
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i]
        const b = cards[j]
        if (!a || !b) continue
        const overlaps = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
        expect(overlaps).toBe(false)
      }
    }
  })

  it("all cards are within content bounds", () => {
    const cards = gridCardsBoxes(8)
    for (const card of cards) {
      expect(card.x).toBeGreaterThanOrEqual(LAYOUT_CONSTANTS.MARGIN)
      expect(card.y).toBeGreaterThanOrEqual(LAYOUT_CONSTANTS.CONTENT_TOP)
      expect(card.x + card.w).toBeLessThanOrEqual(
        LAYOUT_CONSTANTS.SLIDE_W - LAYOUT_CONSTANTS.MARGIN,
      )
      // Floating-point safe: card.y + card.h can be 6.800000000000001 due to FP arithmetic
      expect(card.y + card.h).toBeLessThanOrEqual(LAYOUT_CONSTANTS.CONTENT_BOTTOM + 1e-9)
    }
  })
})

describe("closingSlideBoxes", () => {
  it("accent line is horizontally centered under the text box", () => {
    const { text, accentLine } = closingSlideBoxes()
    const textCenter = text.x + text.w / 2
    const lineCenter = accentLine.x + accentLine.w / 2
    expect(Math.abs(textCenter - lineCenter)).toBeLessThan(0.01)
  })
})

describe("gridTitleBox", () => {
  it("is within slide bounds and left-aligned at margin", () => {
    const box = gridTitleBox()
    expect(box.x).toBe(LAYOUT_CONSTANTS.MARGIN)
    expect(box.x + box.w).toBeLessThanOrEqual(LAYOUT_CONSTANTS.SLIDE_W)
  })
})
