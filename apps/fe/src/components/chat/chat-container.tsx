"use client"

import { useConversation } from "@/components/sidebar/conversation-context"
import { createConversation, generateConversationTitle } from "@/lib/api"
import { useCallback, useEffect, useRef, useState } from "react"
import { ChatComposer } from "./chat-composer"
import { ChatTranscript } from "./chat-transcript"
import { useStreamChat } from "./use-stream-chat"

interface ChatContainerProps {
  readonly userName: string
}

export function ChatContainer({ userName }: ChatContainerProps) {
  const {
    activeId: conversationId,
    setActiveId,
    triggerRefresh,
    setDisableNewChat,
  } = useConversation()
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const titleGeneratedRef = useRef(false)
  const autoCreateRef = useRef(false)
  const { messages, status, sendMessage, stop, clear, loadMessages } = useStreamChat({
    onError: (error) => {
      console.error("[chat] stream error:", error)
    },
  })

  useEffect(() => {
    if (conversationId) {
      if (autoCreateRef.current) {
        autoCreateRef.current = false
        return
      }
      titleGeneratedRef.current = false
      clear()
      void loadMessages(conversationId)
    } else {
      setDisableNewChat(false)
    }
  }, [conversationId, clear, loadMessages, setDisableNewChat])

  // Disable "New chat" when the active conversation has no messages
  useEffect(() => {
    setDisableNewChat(conversationId !== null && messages.length === 0)
  }, [conversationId, messages.length, setDisableNewChat])

  // Generate title after first exchange completes
  useEffect(() => {
    if (
      status === "done" &&
      !titleGeneratedRef.current &&
      messages.length === 2 &&
      messages[0]?.role === "user" &&
      conversationId &&
      selectedModel
    ) {
      titleGeneratedRef.current = true
      generateConversationTitle(conversationId, selectedModel)
        .then(() => {
          triggerRefresh()
        })
        .catch((err: unknown) => {
          console.error("[chat] title generation failed:", err)
        })
    }
  }, [status, messages.length, messages[0]?.role, conversationId, selectedModel, triggerRefresh])

  const handleSend = useCallback(
    async (content: string) => {
      let cid = conversationId
      if (!cid) {
        autoCreateRef.current = true
        const conv = await createConversation({ title: "New chat" })
        cid = conv.id
        setActiveId(cid)
        triggerRefresh()
      }
      void sendMessage(content, cid, selectedSkillId, selectedModel)
    },
    [sendMessage, conversationId, selectedSkillId, selectedModel, setActiveId, triggerRefresh],
  )

  return (
    <div className="flex h-full flex-col">
      <ChatTranscript messages={messages} userName={userName} />
      <ChatComposer
        status={status}
        onSend={handleSend}
        onStop={stop}
        conversationId={conversationId}
        selectedSkillId={selectedSkillId}
        onSkillSelect={setSelectedSkillId}
        selectedModel={selectedModel}
        onModelSelect={setSelectedModel}
      />
    </div>
  )
}
