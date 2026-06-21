import { useEffect, useState } from "react"

export function useTypewriter(
  content: string,
  isStreaming: boolean,
): { text: string; isTyping: boolean } {
  const [displayedLength, setDisplayedLength] = useState(() => (isStreaming ? 0 : content.length))

  useEffect(() => {
    if (displayedLength >= content.length) {
      return
    }

    const frameId = requestAnimationFrame(() => {
      setDisplayedLength((currentLength) => {
        const behind = content.length - currentLength
        if (behind <= 0) {
          return currentLength
        }

        return Math.min(content.length, currentLength + Math.max(1, Math.ceil(behind / 20)))
      })
    })

    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [displayedLength, content])

  return {
    text: content.slice(0, displayedLength),
    isTyping: displayedLength < content.length,
  }
}
