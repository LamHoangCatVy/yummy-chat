import { useCallback, useEffect, useRef, useState } from "react"

const MAX_CHARACTERS_PER_FRAME = 24

export function advanceTypewriterLength(currentLength: number, targetLength: number): number {
  const behind = targetLength - currentLength
  if (behind <= 0) return currentLength

  const step = Math.min(MAX_CHARACTERS_PER_FRAME, Math.max(1, Math.ceil(behind / 20)))
  return Math.min(targetLength, currentLength + step)
}

export function useTypewriter(
  content: string,
  animate: boolean,
): { text: string; isTyping: boolean } {
  const initialLength = animate ? 0 : content.length
  const [displayedLength, setDisplayedLength] = useState(initialLength)
  const displayedLengthRef = useRef(initialLength)
  const targetLengthRef = useRef(content.length)
  const animateRef = useRef(animate)
  const frameRef = useRef<number | null>(null)
  const tickRef = useRef<() => void>(() => undefined)

  const scheduleFrame = useCallback(() => {
    if (
      frameRef.current !== null ||
      !animateRef.current ||
      displayedLengthRef.current >= targetLengthRef.current
    ) {
      return
    }

    frameRef.current = requestAnimationFrame(() => tickRef.current())
  }, [])

  tickRef.current = () => {
    frameRef.current = null
    if (!animateRef.current) return

    const nextLength = advanceTypewriterLength(displayedLengthRef.current, targetLengthRef.current)
    if (nextLength !== displayedLengthRef.current) {
      displayedLengthRef.current = nextLength
      setDisplayedLength(nextLength)
    }

    if (nextLength < targetLengthRef.current) {
      scheduleFrame()
    }
  }

  useEffect(() => {
    targetLengthRef.current = content.length
    animateRef.current = animate

    if (!animate) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      displayedLengthRef.current = content.length
      setDisplayedLength(content.length)
      return
    }

    if (displayedLengthRef.current > content.length) {
      displayedLengthRef.current = content.length
      setDisplayedLength(content.length)
    }

    scheduleFrame()
  }, [animate, content, scheduleFrame])

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [])

  const visibleLength = animate ? Math.min(displayedLength, content.length) : content.length

  return {
    text: content.slice(0, visibleLength),
    isTyping: animate && visibleLength < content.length,
  }
}
