"use client"

import { createContext, useCallback, useContext, useState } from "react"
import type { ReactNode } from "react"

interface ConversationContextValue {
  /** Currently active conversation ID. */
  readonly activeId: string | null
  /** Set the active conversation ID. */
  readonly setActiveId: (id: string | null) => void
  /** Call to force the conversation list to re-fetch from the backend. */
  readonly triggerRefresh: () => void
  /** Incremented each time triggerRefresh is called — used as a dependency. */
  readonly refreshKey: number
  /** True when "New chat" should be disabled (active conversation is empty). */
  readonly disableNewChat: boolean
  /** Update the disableNewChat flag. */
  readonly setDisableNewChat: (disabled: boolean) => void
}

const ConversationContext = createContext<ConversationContextValue | null>(null)

export function ConversationProvider({ children }: { readonly children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [disableNewChat, setDisableNewChat] = useState(false)

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <ConversationContext.Provider
      value={{
        activeId,
        setActiveId,
        triggerRefresh,
        refreshKey,
        disableNewChat,
        setDisableNewChat,
      }}
    >
      {children}
    </ConversationContext.Provider>
  )
}

export function useConversation(): ConversationContextValue {
  const ctx = useContext(ConversationContext)
  if (!ctx) {
    throw new Error("useConversation must be used within a ConversationProvider")
  }
  return ctx
}
