"use client"

import { createContext, useContext, useState } from "react"
import type { ReactNode } from "react"

interface ConversationContextValue {
  /** Currently active conversation ID. */
  readonly activeId: string | null
  /** Set the active conversation ID. */
  readonly setActiveId: (id: string | null) => void
}

const ConversationContext = createContext<ConversationContextValue | null>(null)

export function ConversationProvider({ children }: { readonly children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null)

  return (
    <ConversationContext.Provider value={{ activeId, setActiveId }}>
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
