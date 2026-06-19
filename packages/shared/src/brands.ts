declare const __brand: unique symbol

export type Brand<T, B> = T & { readonly [__brand]: B }

export type UserId = Brand<string, "UserId">
export type ConversationId = Brand<string, "ConversationId">
export type MessageId = Brand<string, "MessageId">
export type SkillId = Brand<string, "SkillId">
export type MemoryId = Brand<string, "MemoryId">
export type SessionId = Brand<string, "SessionId">
