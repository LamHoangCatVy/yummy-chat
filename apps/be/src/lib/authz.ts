import type { UserId } from "@yummy/shared"

/**
 * Authorization policy functions.
 *
 * Every function receives an {@link Actor} (the authenticated principal) and
 * the resource being accessed.  The resource shape mirrors the DB row so that
 * callers can pass query results directly.
 */

export type Actor = { readonly userId: UserId }

// ── Conversation policies (owner-only) ──────────────────────────────────────

export function canReadConversation(actor: Actor, resource: { readonly userId: UserId }): boolean {
  return actor.userId === resource.userId
}

export function canWriteConversation(actor: Actor, resource: { readonly userId: UserId }): boolean {
  return actor.userId === resource.userId
}

// ── Skill policies (owner-only) ─────────────────────────────────────────────

export function canManageSkill(actor: Actor, resource: { readonly ownerId: string }): boolean {
  return actor.userId === resource.ownerId
}

// ── Memory policies (owner-only) ────────────────────────────────────────────

export function canManageMemory(actor: Actor, resource: { readonly userId: UserId }): boolean {
  return actor.userId === resource.userId
}
