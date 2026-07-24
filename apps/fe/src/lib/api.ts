import { API_V1 } from "@yummy/shared"
import type {
  AdvancedSettingsGetResponse,
  AdvancedSettingsPutInput,
  ApiErrorResponse,
  ApiResponse,
  Conversation,
  ConversationListResponse,
  CreateConversationInput,
  CreateMemoryInput,
  CreateSkillInput,
  HealthResponse,
  McpOauthStartResponse,
  McpServer,
  McpServerCreateInput,
  McpServerListResponse,
  McpServerUpdateInput,
  McpToolListResponse,
  MemoryEntry,
  MemoryEventListResponse,
  MemoryListResponse,
  MemorySettings,
  ModelListResponse,
  SendMessageInput,
  SendMessageResponse,
  Skill,
  SkillListResponse,
  UpdateMemoryInput,
  UpdateSkillInput,
} from "@yummy/shared"
import {
  advancedSettingsGetResponseSchema,
  advancedSettingsPutInputSchema,
  conversationListResponseSchema,
  conversationSchema,
  healthResponseSchema,
  mcpOauthStartResponseSchema,
  mcpServerListResponseSchema,
  mcpServerSchema,
  mcpToolListResponseSchema,
  memoryEntrySchema,
  memoryEventListResponseSchema,
  memoryListResponseSchema,
  memorySettingsSchema,
  modelListResponseSchema,
  sendMessageResponseSchema,
  skillListResponseSchema,
  skillSchema,
} from "@yummy/shared"
import { z } from "zod"

interface FetchOptions<T extends z.ZodType> extends Omit<RequestInit, "body"> {
  readonly body?: unknown
  readonly schema?: T
}

class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly errorResponse: ApiErrorResponse,
  ) {
    super(errorResponse.error.message)
    this.name = "ApiError"
  }
}

/**
 * Typed fetch wrapper for the Yummy Chat API.
 *
 * - On success: extracts `data` from the `ApiResponse<T>` envelope and passes it
 *   through the optional Zod schema for runtime validation.
 * - On non-2xx: parses the `ApiErrorResponse` envelope and throws an `ApiError`.
 * - All paths are relative `/api/v1/*` (same-origin proxy → localhost:3001).
 */
async function fetchApi<T extends z.ZodType>(
  path: string,
  options: FetchOptions<T> = {} as FetchOptions<T>,
): Promise<z.infer<T>> {
  const { body, schema, ...init } = options

  const response = await fetch(path, {
    ...init,
    ...(body !== undefined && {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    }),
  })

  if (!response.ok) {
    const errorBody = (await response.json()) as ApiErrorResponse
    throw new ApiError(response.status, errorBody)
  }

  const json: unknown = await response.json()

  if (schema) {
    const data = (json as ApiResponse<unknown>).data ?? json
    const parsed = schema.safeParse(data)
    if (!parsed.success) {
      console.error(`[fetchApi] response schema mismatch for ${path}:`, parsed.error.issues)
      throw new ApiError(500, {
        success: false,
        error: {
          type: "INTERNAL_ERROR",
          message: "Received an unexpected response from the server.",
          statusCode: 500,
        },
        meta: { timestamp: new Date().toISOString(), requestId: "client" },
      })
    }
    return parsed.data
  }

  return json as z.infer<T>
}

export function checkHealth() {
  return fetchApi(API_V1.HEALTH, { schema: healthResponseSchema })
}

export function listConversations() {
  return fetchApi(API_V1.CONVERSATIONS, {
    schema: conversationListResponseSchema,
  })
}

export function createConversation(input: CreateConversationInput) {
  return fetchApi(API_V1.CONVERSATIONS, {
    method: "POST",
    body: input satisfies CreateConversationInput,
    schema: conversationSchema,
  })
}

export function sendMessage(input: SendMessageInput) {
  return fetchApi(API_V1.CHAT, {
    method: "POST",
    body: input satisfies SendMessageInput,
    schema: sendMessageResponseSchema,
  })
}

// ── Skills ────────────────────────────────────────────────────────────────────

export function listSkills() {
  return fetchApi(API_V1.SKILLS, { schema: skillListResponseSchema })
}

export function createSkill(input: CreateSkillInput) {
  return fetchApi(API_V1.SKILLS, {
    method: "POST",
    body: input satisfies CreateSkillInput,
    schema: skillSchema,
  })
}

export function getSkill(id: string) {
  return fetchApi(`${API_V1.SKILLS}/${id}`, { schema: skillSchema })
}

export function updateSkill(id: string, input: UpdateSkillInput) {
  return fetchApi(`${API_V1.SKILLS}/${id}`, {
    method: "PATCH",
    body: input satisfies UpdateSkillInput,
    schema: skillSchema,
  })
}

export function deleteSkill(id: string) {
  return fetchApi(`${API_V1.SKILLS}/${id}`, { method: "DELETE" })
}

export async function importAgentSkill(file: File): Promise<Skill> {
  const formData = new FormData()
  formData.set("file", file)
  const response = await fetch(`${API_V1.SKILLS}/import`, {
    method: "POST",
    body: formData,
  })
  const json = (await response.json()) as ApiResponse<unknown> | ApiErrorResponse
  if (!response.ok || !json.success) {
    throw new ApiError(response.status, json as ApiErrorResponse)
  }
  return skillSchema.parse(json.data)
}

export async function downloadAgentSkill(id: string): Promise<Blob> {
  const response = await fetch(`${API_V1.SKILLS}/${id}/export`)
  if (!response.ok) {
    const error = (await response.json()) as ApiErrorResponse
    throw new ApiError(response.status, error)
  }
  return response.blob()
}

export function getConversationSkill(conversationId: string) {
  return fetchApi(`${API_V1.CONVERSATIONS}/${conversationId}/skill`, {
    schema: z.object({
      skillId: z.string().uuid().nullable(),
      skillName: z.string().nullable(),
    }),
  })
}

export function setConversationSkill(conversationId: string, skillId: string | null) {
  return fetchApi(`${API_V1.CONVERSATIONS}/${conversationId}/skill`, {
    method: "PATCH",
    body: { skillId },
  })
}

// ── Memory ─────────────────────────────────────────────────────────────────────

export function listMemoryEntries() {
  return fetchApi(API_V1.MEMORY, { schema: memoryListResponseSchema })
}

export function createMemoryEntry(input: CreateMemoryInput) {
  return fetchApi(API_V1.MEMORY, {
    method: "POST",
    body: input satisfies CreateMemoryInput,
    schema: memoryEntrySchema,
  })
}

export function getMemoryEntry(id: string) {
  return fetchApi(`${API_V1.MEMORY}/${id}`, { schema: memoryEntrySchema })
}

export function updateMemoryEntry(id: string, input: UpdateMemoryInput) {
  return fetchApi(`${API_V1.MEMORY}/${id}`, {
    method: "PATCH",
    body: input satisfies UpdateMemoryInput,
    schema: memoryEntrySchema,
  })
}

export function deleteMemoryEntry(id: string) {
  return fetchApi(`${API_V1.MEMORY}/${id}`, { method: "DELETE" })
}

export function getMemorySettings() {
  return fetchApi(`${API_V1.MEMORY}/settings`, { schema: memorySettingsSchema })
}

export function updateMemorySettings(input: MemorySettings) {
  return fetchApi(`${API_V1.MEMORY}/settings`, {
    method: "PUT",
    body: input satisfies MemorySettings,
    schema: memorySettingsSchema,
  })
}

export function clearMemoryEntries() {
  return fetchApi(API_V1.MEMORY, { method: "DELETE" })
}

export function listMemoryEvents(after: string) {
  const params = new URLSearchParams({ after })
  return fetchApi(`${API_V1.MEMORY}/events?${params.toString()}`, {
    schema: memoryEventListResponseSchema,
  })
}

export function confirmMemoryProposal(id: string) {
  return fetchApi(`${API_V1.MEMORY}/proposals/${id}/confirm`, {
    method: "POST",
    schema: memoryEntrySchema,
  })
}

export function cancelMemoryProposal(id: string) {
  return fetchApi(`${API_V1.MEMORY}/proposals/${id}`, { method: "DELETE" })
}

export function getAdvancedSettings(): Promise<AdvancedSettingsGetResponse> {
  return fetchApi(`${API_V1.SETTINGS}/advanced`, { schema: advancedSettingsGetResponseSchema })
}

export function updateAdvancedSettings(
  input: AdvancedSettingsPutInput,
): Promise<AdvancedSettingsGetResponse> {
  return fetchApi(`${API_V1.SETTINGS}/advanced`, {
    method: "PUT",
    body: advancedSettingsPutInputSchema.parse(input) satisfies AdvancedSettingsPutInput,
    schema: advancedSettingsGetResponseSchema,
  })
}

export function fetchModels(): Promise<ModelListResponse> {
  return fetchApi(API_V1.MODELS, { schema: modelListResponseSchema })
}

// ── MCP servers ─────────────────────────────────────────────────────────────

export function listMcpServers(): Promise<McpServerListResponse> {
  return fetchApi(API_V1.MCP, { schema: mcpServerListResponseSchema })
}

export function createMcpServer(input: McpServerCreateInput): Promise<McpServer> {
  return fetchApi(API_V1.MCP, { method: "POST", body: input, schema: mcpServerSchema })
}

export function updateMcpServer(id: string, input: McpServerUpdateInput): Promise<McpServer> {
  return fetchApi(`${API_V1.MCP}/${id}`, {
    method: "PATCH",
    body: input,
    schema: mcpServerSchema,
  })
}

export function deleteMcpServer(id: string) {
  return fetchApi(`${API_V1.MCP}/${id}`, { method: "DELETE" })
}

export function listMcpTools(id: string): Promise<McpToolListResponse> {
  return fetchApi(`${API_V1.MCP}/${id}/tools`, { schema: mcpToolListResponseSchema })
}

export function startMcpOauth(id: string): Promise<McpOauthStartResponse> {
  return fetchApi(`${API_V1.MCP}/${id}/oauth/start`, {
    method: "POST",
    schema: mcpOauthStartResponseSchema,
  })
}

export function disconnectMcpOauth(id: string): Promise<McpServer> {
  return fetchApi(`${API_V1.MCP}/${id}/oauth/disconnect`, {
    method: "POST",
    schema: mcpServerSchema,
  })
}

export interface MessageListItem {
  readonly id: string
  readonly role: "system" | "user" | "assistant"
  readonly content: string
  readonly createdAt: string
  readonly metadata?: Record<string, unknown> | null
}

export const messageListItemSchema = z
  .object({
    id: z.string(),
    role: z.enum(["system", "user", "assistant"]),
    content: z.string(),
    createdAt: z.string(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .transform((message): MessageListItem => {
    if (message.metadata === undefined) {
      return {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      }
    }

    return message as MessageListItem
  })

const messageListResponseSchema = z.object({
  data: z.array(messageListItemSchema),
  nextCursor: z.string().nullable(),
})

export function listMessages(conversationId: string): Promise<{
  data: readonly MessageListItem[]
  nextCursor: string | null
}> {
  return fetchApi(`${API_V1.CONVERSATIONS}/${conversationId}/messages`, {
    schema: messageListResponseSchema,
  })
}

const generateTitleResponseSchema = z.object({
  title: z.string(),
})

export function generateConversationTitle(
  conversationId: string,
  model: string,
): Promise<{ title: string }> {
  return fetchApi(`${API_V1.CONVERSATIONS}/${conversationId}/generate-title`, {
    method: "POST",
    body: { model },
    schema: generateTitleResponseSchema,
  })
}

export function deleteConversation(id: string) {
  return fetchApi(`${API_V1.CONVERSATIONS}/${id}`, { method: "DELETE" })
}

export { ApiError, fetchApi }
export type {
  AdvancedSettingsGetResponse,
  AdvancedSettingsPutInput,
  HealthResponse,
  ConversationListResponse,
  Conversation,
  SendMessageInput,
  SendMessageResponse,
  Skill,
  SkillListResponse,
  CreateSkillInput,
  UpdateSkillInput,
  MemoryEntry,
  MemoryEventListResponse,
  MemoryListResponse,
  CreateMemoryInput,
  UpdateMemoryInput,
  MemorySettings,
  ModelListResponse,
  McpServer,
  McpServerCreateInput,
  McpServerListResponse,
  McpServerUpdateInput,
  McpOauthStartResponse,
  McpToolListResponse,
}
