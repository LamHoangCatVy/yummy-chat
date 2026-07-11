"use client"

import { Brain, ChevronDown, Download, Sparkles, User } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { stripGeneratedJsonBlocks } from "./chat-transcript-helpers"
import type { ChatMessage, FileAttachment } from "./types"
import { useTypewriter } from "./use-typewriter"

interface ChatTranscriptProps {
  readonly messages: readonly ChatMessage[]
  readonly userName: string
  readonly onPromptSelect?: (prompt: string) => void
}

const QUICK_PROMPTS = [
  {
    title: "Analyze a requirement",
    prompt: "Help me analyze this requirement, identify business rules, edge cases, and acceptance criteria.",
  },
  {
    title: "Draft a work plan",
    prompt: "Create a clear implementation plan with milestones, owners, risks, and dependencies.",
  },
  {
    title: "Review a document",
    prompt: "Review this document and point out gaps, ambiguities, risks, and recommended improvements.",
  },
  {
    title: "Explain a system",
    prompt: "Explain this system flow simply, then map it into components, APIs, data, and failure points.",
  },
] as const

export function ChatTranscript({ messages, userName, onPromptSelect }: ChatTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const prevMessageCountRef = useRef(0)
  const lastMessageContentLengthRef = useRef(0)

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  const currentCount = messages.length
  if (currentCount !== prevMessageCountRef.current) {
    prevMessageCountRef.current = currentCount
    if (isAtBottomRef.current) {
      requestAnimationFrame(scrollToBottom)
    }
  }

  const lastMessage = messages[messages.length - 1]
  const currentLastMessageLength =
    (lastMessage?.content.length ?? 0) + (lastMessage?.reasoningContent?.length ?? 0)
  if (currentLastMessageLength !== lastMessageContentLengthRef.current) {
    lastMessageContentLengthRef.current = currentLastMessageLength
    if (isAtBottomRef.current) {
      requestAnimationFrame(scrollToBottom)
    }
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-spacing-4 py-spacing-6 md:px-spacing-8">
        <EmptyState userName={userName} onPromptSelect={onPromptSelect} />
      </div>
    )
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[58rem] px-spacing-4 pb-spacing-8 pt-spacing-6 md:px-spacing-8 md:pt-spacing-8">
        <div className="mb-spacing-6 rounded-[24px] border border-border-subtle bg-gradient-to-r from-brand-ice to-brand-mint p-spacing-4 shadow-[0_18px_45px_rgba(6,35,59,0.06)]">
          <div className="flex items-start gap-spacing-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-raised text-brand-green shadow-[0_10px_24px_rgba(6,35,59,0.08)]">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-[0.95rem] font-semibold leading-[1.35] text-text-primary">
                Conversation workspace
              </p>
              <p className="mt-spacing-1 text-[0.8rem] leading-[1.55] text-text-secondary">
                Keep context precise. Ask for assumptions, edge cases, diagrams, test cases, or
                implementation steps when the topic becomes complex.
              </p>
            </div>
          </div>
        </div>

        {messages.map((message) => (
          <MessageRow key={message.id} message={message} userName={userName} />
        ))}
      </div>
    </div>
  )
}

function EmptyState({
  userName,
  onPromptSelect,
}: { readonly userName: string; readonly onPromptSelect?: (prompt: string) => void }) {
  const firstName = userName.split(" ")[0] || userName
  return (
    <div className="w-full max-w-[62rem]">
      <div className="mx-auto max-w-[46rem] text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-gradient-to-br from-brand-blue to-brand-green text-white shadow-[0_22px_48px_rgba(0,99,177,0.26)]">
          <Sparkles size={28} />
        </div>
        <p className="mt-spacing-6 text-[0.78rem] font-bold uppercase tracking-[0.22em] text-brand-green">
          Yummy Chat Workspace
        </p>
        <h1 className="mt-spacing-2 text-[2.45rem] font-semibold leading-[1.05] tracking-[-0.055em] text-text-primary md:text-[4rem]">
          What should we solve today, {firstName}?
        </h1>
        <p className="mx-auto mt-spacing-5 max-w-[38rem] text-[1rem] leading-[1.75] text-text-secondary">
          Turn messy requirements, documents, code context, and operational knowledge into clear
          decisions, plans, test cases, and reusable outputs.
        </p>
      </div>

      <div className="mt-spacing-10 grid gap-spacing-3 md:grid-cols-2">
        {QUICK_PROMPTS.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => onPromptSelect?.(item.prompt)}
            className="group rounded-[24px] border border-border-subtle bg-surface-glass p-spacing-5 text-left shadow-[0_18px_45px_rgba(6,35,59,0.07)] backdrop-blur-xl transition-all duration-150 hover:-translate-y-[2px] hover:border-border-hover hover:shadow-[0_24px_60px_rgba(6,35,59,0.12)]"
          >
            <div className="flex items-start gap-spacing-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-mint text-brand-green transition-transform duration-150 group-hover:scale-105">
                <Brain size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.95rem] font-semibold leading-[1.35] text-text-primary">
                  {item.title}
                </span>
                <span className="mt-spacing-2 block text-[0.82rem] leading-[1.55] text-text-secondary">
                  {item.prompt}
                </span>
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageRow({
  message,
  userName,
}: {
  readonly message: ChatMessage
  readonly userName: string
}) {
  const isUser = message.role === "user"
  const label = isUser ? userName.split(" ")[0] || userName : "Yummy"
  const displayContent = isUser ? message.content : stripGeneratedJsonBlocks(message.content)
  const timestamp = formatTime(message.createdAt)

  return (
    <article className={`mb-spacing-6 flex gap-spacing-4 ${isUser ? "md:justify-end" : ""}`}>
      {!isUser && <Avatar isUser={false} />}
      <div className={`min-w-0 ${isUser ? "max-w-[46rem] md:w-[82%]" : "flex-1"}`}>
        <div className={`mb-spacing-2 flex items-center gap-spacing-2 ${isUser ? "md:justify-end" : ""}`}>
          <span className="text-[0.78rem] font-bold leading-[1.3] text-text-primary">{label}</span>
          <span className="rounded-full bg-surface-tertiary px-spacing-2 py-spacing-half text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            {isUser ? "You" : "Assistant"}
          </span>
          {timestamp && (
            <span className="text-[0.72rem] leading-[1.3] text-text-tertiary">{timestamp}</span>
          )}
        </div>
        <div
          className={`rounded-[24px] border p-spacing-5 text-[0.95rem] leading-[1.75] shadow-[0_14px_36px_rgba(6,35,59,0.06)] ${
            isUser
              ? "border-brand-blue/20 bg-gradient-to-br from-brand-blue to-brand-green text-white md:rounded-tr-[8px]"
              : "border-border-subtle bg-surface-glass text-text-primary backdrop-blur-xl md:rounded-tl-[8px]"
          }`}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{displayContent}</span>
          ) : (
            <>
              {message.reasoningContent && (
                <ThinkingPanel
                  reasoning={message.reasoningContent}
                  isStreaming={message.isStreaming}
                />
              )}
              <AssistantMessageContent
                content={displayContent}
                isStreaming={message.isStreaming}
                hasReasoning={!!message.reasoningContent}
              />
            </>
          )}
          {message.files && message.files.length > 0 && <FileDownloads files={message.files} />}
        </div>
      </div>
      {isUser && <Avatar isUser />}
    </article>
  )
}

function AssistantMessageContent({
  content,
  isStreaming,
  hasReasoning,
}: {
  readonly content: string
  readonly isStreaming: boolean
  readonly hasReasoning: boolean
}) {
  const { text: typedText, isTyping } = useTypewriter(content, isStreaming)

  if (content.length === 0 && isStreaming) {
    return hasReasoning ? null : <TypingIndicator />
  }

  if (content.length === 0) {
    return null
  }

  return (
    <div className="prose-chat">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{typedText}</ReactMarkdown>
      {isTyping && <StreamingCursor />}
    </div>
  )
}

function FileDownloads({ files }: { readonly files: readonly FileAttachment[] }) {
  return (
    <div className="mt-spacing-4 flex flex-wrap gap-spacing-2">
      {files.map((file) => (
        <a
          key={file.downloadUrl}
          href={file.downloadUrl}
          download={file.filename}
          className="flex items-center gap-spacing-2 rounded-[14px] border border-border-subtle bg-surface-raised px-spacing-3 py-spacing-2 text-[0.8125rem] font-semibold leading-[1.5] text-text-primary shadow-[0_10px_24px_rgba(6,35,59,0.06)] transition-all duration-150 hover:-translate-y-[1px] hover:border-border-hover"
        >
          <Download size={15} className="text-brand-green" />
          <span>{file.filename}</span>
        </a>
      ))}
    </div>
  )
}

function Avatar({ isUser }: { readonly isUser: boolean }) {
  return (
    <div
      className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-[0_12px_28px_rgba(6,35,59,0.08)] md:flex ${
        isUser ? "bg-surface-tertiary text-text-secondary" : "bg-gradient-to-br from-brand-blue to-brand-green text-white"
      }`}
      aria-hidden="true"
    >
      {isUser ? <User size={17} /> : <Sparkles size={17} />}
    </div>
  )
}

function StreamingCursor() {
  return (
    <span
      className="ml-[2px] inline-block h-[1em] w-[2px] animate-pulse bg-brand-green align-text-bottom"
      aria-label="Streaming"
    />
  )
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      <span
        className="h-[4px] w-[4px] animate-bounce rounded-full bg-brand-green"
        style={{ animationDelay: "-0.3s" }}
      />
      <span
        className="h-[4px] w-[4px] animate-bounce rounded-full bg-brand-green"
        style={{ animationDelay: "-0.15s" }}
      />
      <span className="h-[4px] w-[4px] animate-bounce rounded-full bg-brand-green" />
    </span>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-[5px] py-spacing-1" aria-label="Assistant is typing">
      <span
        className="h-[8px] w-[8px] animate-bounce rounded-full bg-brand-blue"
        style={{ animationDelay: "-0.3s" }}
      />
      <span
        className="h-[8px] w-[8px] animate-bounce rounded-full bg-brand-green"
        style={{ animationDelay: "-0.15s" }}
      />
      <span className="h-[8px] w-[8px] animate-bounce rounded-full bg-brand-blue" />
    </div>
  )
}

function ThinkingPanel({
  reasoning,
  isStreaming,
}: {
  readonly reasoning: string
  readonly isStreaming: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const { text: typedReasoning, isTyping } = useTypewriter(reasoning, isStreaming)
  const visible = isStreaming || !collapsed

  return (
    <div className="mb-spacing-4 rounded-[18px] border border-border-subtle bg-brand-ice p-spacing-3">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        disabled={isStreaming}
        className="flex items-center gap-spacing-2 text-[0.8125rem] font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:hover:text-text-secondary"
        aria-expanded={visible}
      >
        <Brain size={14} className="text-brand-green" />
        <span>{isStreaming ? "Reasoning" : "Reasoning notes"}</span>
        {isStreaming ? (
          <ThinkingDots />
        ) : (
          <ChevronDown
            size={14}
            className={`transition-transform duration-150 ${collapsed ? "" : "rotate-180"}`}
          />
        )}
      </button>
      {visible && (
        <div className="mt-spacing-3 border-l-2 border-brand-green/35 pl-spacing-3 text-[0.875rem] leading-[1.65] text-text-secondary">
          <span className="whitespace-pre-wrap">{typedReasoning}</span>
          {isTyping && <StreamingCursor />}
        </div>
      )}
    </div>
  )
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}
