"use client"

import { useConversation } from "@/components/sidebar/conversation-context"
import { useCallback, useEffect, useState } from "react"
import { ChatComposer } from "./chat-composer"
import { ChatTranscript } from "./chat-transcript"
import { useStreamChat } from "./use-stream-chat"

interface ChatContainerProps {
  readonly userName: string
}

export function ChatContainer({ userName }: ChatContainerProps) {
  const { activeId: conversationId } = useConversation()
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const { messages, status, sendMessage, stop, clear } = useStreamChat({
    onError: (error) => {
      console.error("[chat] stream error:", error)
    },
  })

  useEffect(() => {
    if (conversationId) {
      clear()
      setSelectedSkillId(null)
    }
  }, [conversationId, clear])

  const handleSend = useCallback(
    (content: string) => {
      if (!conversationId) return
      void sendMessage(content, conversationId)
    },
    [sendMessage, conversationId],
  )

  return (
    <div className="flex h-full flex-col">
      <ChatTranscript messages={messages} userName={userName} />
      <ChatComposer
        status={status}
        onSend={handleSend}
        onStop={stop}
        disabled={!conversationId}
        conversationId={conversationId}
        selectedSkillId={selectedSkillId}
        onSkillSelect={setSelectedSkillId}
      />
    </div>
  )
}
