"use client"

import { useConversation } from "@/components/sidebar/conversation-context"
import { Button } from "@/components/ui/button"
import { createConversation, generateConversationTitle, getConversationSkill } from "@/lib/api"
import { CheckCircle2, Clock3, X } from "lucide-react"
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
  const [isTemporary, setIsTemporary] = useState(false)
  const [memoryNotice, setMemoryNotice] = useState<string | null>(null)
  const titleGeneratedRef = useRef(false)
  const autoCreateRef = useRef(false)
  const noticeTimeoutRef = useRef<number | null>(null)
  const { messages, status, sendMessage, stop, clear, loadMessages } = useStreamChat({
    onError: (error) => {
      console.error("[chat] stream error:", error)
    },
    onMemoryUpdated: (message) => {
      setMemoryNotice(message)
      if (noticeTimeoutRef.current !== null) window.clearTimeout(noticeTimeoutRef.current)
      noticeTimeoutRef.current = window.setTimeout(() => setMemoryNotice(null), 4_000)
    },
    pollMemoryUpdates: !isTemporary,
  })

  useEffect(
    () => () => {
      if (noticeTimeoutRef.current !== null) window.clearTimeout(noticeTimeoutRef.current)
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    if (conversationId) {
      if (autoCreateRef.current) {
        autoCreateRef.current = false
        setSelectedSkillId(null)
        return () => {
          cancelled = true
        }
      }
      titleGeneratedRef.current = false
      setIsTemporary(false)
      setSelectedSkillId(null)
      clear()
      void loadMessages(conversationId)
      void getConversationSkill(conversationId)
        .then((selection) => {
          if (!cancelled) setSelectedSkillId(selection.skillId)
        })
        .catch(() => {
          if (!cancelled) setSelectedSkillId(null)
        })
    } else {
      setIsTemporary(false)
      setSelectedSkillId(null)
      setDisableNewChat(false)
    }
    return () => {
      cancelled = true
    }
  }, [conversationId, clear, loadMessages, setDisableNewChat])

  // Disable "New chat" when the active conversation has no messages
  useEffect(() => {
    setDisableNewChat(!isTemporary && conversationId !== null && messages.length === 0)
  }, [conversationId, isTemporary, messages.length, setDisableNewChat])

  // Generate title after first exchange completes
  useEffect(() => {
    if (
      status === "done" &&
      !titleGeneratedRef.current &&
      messages.length === 2 &&
      messages[0]?.role === "user" &&
      conversationId &&
      selectedModel &&
      !isTemporary
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
  }, [
    status,
    messages.length,
    messages[0]?.role,
    conversationId,
    selectedModel,
    isTemporary,
    triggerRefresh,
  ])

  const handleStartTemporary = useCallback(async () => {
    if (status === "streaming") return
    try {
      const conv = await createConversation({ title: "Temporary chat", mode: "temporary" })
      autoCreateRef.current = true
      setIsTemporary(true)
      setSelectedSkillId(null)
      titleGeneratedRef.current = true
      clear()
      setActiveId(conv.id)
    } catch (err: unknown) {
      setMemoryNotice(err instanceof Error ? err.message : "Failed to start temporary chat")
    }
  }, [clear, setActiveId, status])

  const handleExitTemporary = useCallback(() => {
    stop()
    clear()
    setIsTemporary(false)
    setActiveId(null)
  }, [clear, setActiveId, stop])

  const handleSend = useCallback(
    async (content: string) => {
      let cid = conversationId
      if (!cid) {
        autoCreateRef.current = true
        const conv = await createConversation({
          title: isTemporary ? "Temporary chat" : "New chat",
          mode: isTemporary ? "temporary" : "standard",
        })
        cid = conv.id
        setActiveId(cid)
        if (!isTemporary) triggerRefresh()
      }
      void sendMessage(content, cid, selectedSkillId, selectedModel)
    },
    [
      sendMessage,
      conversationId,
      selectedSkillId,
      selectedModel,
      setActiveId,
      triggerRefresh,
      isTemporary,
    ],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-12 shrink-0 items-center justify-end gap-spacing-2 border-b border-border-subtle px-spacing-4 py-spacing-2">
        {memoryNotice && (
          <output
            className="mr-auto flex items-center gap-spacing-2 text-[0.8125rem] text-status-success"
            aria-live="polite"
          >
            <CheckCircle2 size={14} />
            <span>{memoryNotice}</span>
          </output>
        )}
        {isTemporary ? (
          <>
            <div className="mr-auto flex items-center gap-spacing-2 text-[0.8125rem] text-text-secondary">
              <Clock3 size={14} />
              Temporary chat — memory and chat history are off
            </div>
            <Button variant="ghost" size="sm" onClick={handleExitTemporary}>
              <X size={14} />
              Exit
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleStartTemporary()}
            disabled={status === "streaming"}
          >
            <Clock3 size={14} />
            Temporary chat
          </Button>
        )}
      </div>
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
