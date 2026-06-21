import { z } from "zod"
import type { ConversationId, MemoryId, MessageId, SessionId, SkillId, UserId } from "./brands"

const uuidBrand = <T>(): z.ZodType<T> => z.string().uuid() as unknown as z.ZodType<T>
const stringBrand = <T>(): z.ZodType<T> => z.string().min(1) as unknown as z.ZodType<T>

export const userIdSchema = stringBrand<UserId>()
export const conversationIdSchema = uuidBrand<ConversationId>()
export const messageIdSchema = uuidBrand<MessageId>()
export const skillIdSchema = uuidBrand<SkillId>()
export const memoryIdSchema = uuidBrand<MemoryId>()
export const sessionIdSchema = uuidBrand<SessionId>()

export const chatMessageSchema = z.object({
  id: messageIdSchema,
  conversationId: conversationIdSchema,
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
  parentId: messageIdSchema.nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const conversationSchema = z.object({
  id: conversationIdSchema,
  userId: userIdSchema,
  title: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const skillSchema = z.object({
  id: skillIdSchema,
  ownerId: userIdSchema,
  name: z.string().min(1).max(100),
  prompt: z.string().max(100_000),
  model: z.string().min(1).max(100),
  temperature: z.number().min(0).max(2).nullish(),
  maxTokens: z.number().int().min(1).max(1_000_000).nullish(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const createSkillInputSchema = z.object({
  name: z.string().min(1).max(100),
  prompt: z.string().min(1).max(100_000),
  model: z.string().min(1).max(100),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(1_000_000).optional(),
})

export const updateSkillInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  prompt: z.string().min(1).max(100_000).optional(),
  model: z.string().min(1).max(100).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(1_000_000).optional(),
})

export const memoryEntrySchema = z.object({
  id: memoryIdSchema,
  userId: userIdSchema,
  key: z.string().min(1).max(200),
  value: z.string(),
  category: z.string().max(50).nullable().optional(),
  source: z.string().max(50).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const sendMessageInputSchema = z.object({
  conversationId: conversationIdSchema.optional(),
  content: z.string().min(1).max(100_000),
  model: z.string().min(1).max(100),
  sessionId: sessionIdSchema,
})

export const sendMessageResponseSchema = z.object({
  messageId: messageIdSchema,
  conversationId: conversationIdSchema,
  content: z.string(),
})

export const createConversationInputSchema = z.object({
  title: z.string().min(1).max(200),
})

export const updateConversationInputSchema = z.object({
  title: z.string().min(1).max(200),
})

export const appendMessageInputSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(100_000),
  parentId: messageIdSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const paginationInputSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().datetime().optional(),
})

export const conversationListResponseSchema = z.object({
  conversations: z.array(conversationSchema),
  nextCursor: z.string().nullable().optional(),
})

export const skillListResponseSchema = z.object({
  skills: z.array(skillSchema),
})

export const createMemoryInputSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.string().min(1).max(100_000),
  category: z.string().max(50).optional(),
  source: z.string().max(50).optional(),
  confidence: z.number().min(0).max(1).optional(),
})

export const updateMemoryInputSchema = z.object({
  key: z.string().min(1).max(200).optional(),
  value: z.string().min(1).max(100_000).optional(),
  category: z.string().max(50).optional(),
  source: z.string().max(50).optional(),
  confidence: z.number().min(0).max(1).optional(),
})

export const memorySettingsSchema = z.object({
  enabled: z.boolean(),
})

export const memoryListResponseSchema = z.object({
  entries: z.array(memoryEntrySchema),
})

export const modelItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
})

export const modelListResponseSchema = z.object({
  models: z.array(modelItemSchema),
})

export const advancedSettingsGetResponseSchema = z.object({
  hasApiKey: z.boolean(),
  endpoint: z.string().nullable(),
  selectedModel: z.string().nullable(),
})

export const advancedSettingsPutInputSchema = z.object({
  apiKey: z.string().min(1).optional(),
  endpoint: z.string().url().optional(),
})

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "error"]),
  version: z.string(),
  timestamp: z.string().datetime(),
})

export const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation" as const

export const GENERATED_FILE_MAX_BYTES = 10 * 1024 * 1024

export const PPTX_LIMITS = {
  maxSlides: 10,
  maxContentSlides: 8,
  maxBulletsPerSlide: 8,
  maxBulletChars: 180,
  maxDeckTitleChars: 120,
  maxSlideTitleChars: 100,
} as const

export const fileAttachmentSchema = z.object({
  filename: z.string().min(1).max(200),
  downloadUrl: z.string().min(1),
  mimeType: z.string().min(1),
})

export const pptxSlideSchema = z
  .object({
    title: z.string().min(1).max(100),
    bullets: z.array(z.string().min(1).max(180)).min(1).max(8),
  })
  .strict()

export const pptxJsonDataSchema = z
  .object({
    title: z.string().min(1).max(120),
    slides: z.array(pptxSlideSchema).min(1).max(8),
    closing: z.string().min(1).max(240).optional(),
  })
  .strict()

export type ChatMessage = z.infer<typeof chatMessageSchema>
export type Conversation = z.infer<typeof conversationSchema>
export type Skill = z.infer<typeof skillSchema>
export type CreateSkillInput = z.infer<typeof createSkillInputSchema>
export type UpdateSkillInput = z.infer<typeof updateSkillInputSchema>
export type CreateMemoryInput = z.infer<typeof createMemoryInputSchema>
export type UpdateMemoryInput = z.infer<typeof updateMemoryInputSchema>
export type MemorySettings = z.infer<typeof memorySettingsSchema>
export type MemoryEntry = z.infer<typeof memoryEntrySchema>
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>
export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>
export type CreateConversationInput = z.infer<typeof createConversationInputSchema>
export type UpdateConversationInput = z.infer<typeof updateConversationInputSchema>
export type AppendMessageInput = z.infer<typeof appendMessageInputSchema>
export type PaginationInput = z.infer<typeof paginationInputSchema>
export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>
export type SkillListResponse = z.infer<typeof skillListResponseSchema>
export type MemoryListResponse = z.infer<typeof memoryListResponseSchema>
export type ModelItem = z.infer<typeof modelItemSchema>
export type ModelListResponse = z.infer<typeof modelListResponseSchema>
export type AdvancedSettingsGetResponse = z.infer<typeof advancedSettingsGetResponseSchema>
export type AdvancedSettingsPutInput = z.infer<typeof advancedSettingsPutInputSchema>
export type HealthResponse = z.infer<typeof healthResponseSchema>
export type FileAttachment = z.infer<typeof fileAttachmentSchema>
export type PptxSlideData = z.infer<typeof pptxSlideSchema>
export type PptxJsonData = z.infer<typeof pptxJsonDataSchema>
