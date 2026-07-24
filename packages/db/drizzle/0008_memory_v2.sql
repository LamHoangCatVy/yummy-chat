CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE "conversation" ADD COLUMN "mode" text DEFAULT 'standard' NOT NULL;
ALTER TABLE "conversation" ADD COLUMN "expires_at" timestamp with time zone;
CREATE INDEX "conversation_user_mode_idx" ON "conversation" USING btree ("user_id", "mode");
CREATE INDEX "conversation_expires_at_idx" ON "conversation" USING btree ("expires_at");

ALTER TABLE "user_memory_settings" RENAME COLUMN "enabled" TO "saved_memory_enabled";
ALTER TABLE "user_memory_settings" ADD COLUMN "chat_history_enabled" boolean DEFAULT false NOT NULL;

ALTER TABLE "memory_entry" ADD COLUMN "normalized_key" text DEFAULT '' NOT NULL;
ALTER TABLE "memory_entry" ADD COLUMN "origin" text DEFAULT 'manual' NOT NULL;
ALTER TABLE "memory_entry" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;
ALTER TABLE "memory_entry" ADD COLUMN "importance" real DEFAULT 0.5 NOT NULL;
ALTER TABLE "memory_entry" ADD COLUMN "embedding" vector(1536);
ALTER TABLE "memory_entry" ADD COLUMN "source_conversation_id" text;
ALTER TABLE "memory_entry" ADD COLUMN "source_message_id" text;
ALTER TABLE "memory_entry" ADD COLUMN "last_used_at" timestamp with time zone;
ALTER TABLE "memory_entry" ADD COLUMN "use_count" integer DEFAULT 0 NOT NULL;
UPDATE "memory_entry"
SET "normalized_key" = trim(both '_' from regexp_replace(lower(unaccent(trim("key"))), '[^a-z0-9]+', '_', 'g'))
WHERE "normalized_key" = '';
UPDATE "memory_entry"
SET "normalized_key" = 'memory_' || substr(md5("id"), 1, 12)
WHERE "normalized_key" = '';
WITH ranked_memories AS (
  SELECT "id", "normalized_key",
    row_number() OVER (
      PARTITION BY "user_id", "normalized_key"
      ORDER BY "updated_at" DESC, "id" DESC
    ) AS duplicate_rank
  FROM "memory_entry"
)
UPDATE "memory_entry" AS entry
SET "normalized_key" = entry."normalized_key" || '_' || substr(md5(entry."id"), 1, 8)
FROM ranked_memories
WHERE entry."id" = ranked_memories."id" AND ranked_memories.duplicate_rank > 1;
ALTER TABLE "memory_entry" ADD CONSTRAINT "memory_entry_source_conversation_id_conversation_id_fk"
  FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null;
ALTER TABLE "memory_entry" ADD CONSTRAINT "memory_entry_source_message_id_message_id_fk"
  FOREIGN KEY ("source_message_id") REFERENCES "public"."message"("id") ON DELETE set null;
CREATE UNIQUE INDEX "memory_entry_user_normalized_key_uidx" ON "memory_entry" USING btree ("user_id", "normalized_key");
CREATE INDEX "memory_entry_user_status_idx" ON "memory_entry" USING btree ("user_id", "status");
CREATE INDEX "memory_entry_search_idx" ON "memory_entry" USING gin (to_tsvector('simple', coalesce("key", '') || ' ' || coalesce("value", '')));
CREATE INDEX "memory_entry_embedding_hnsw_idx" ON "memory_entry" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE "memory_history_chunk" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "conversation_id" text NOT NULL,
  "user_message_id" text NOT NULL,
  "assistant_message_id" text NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(1536),
  "token_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "memory_history_chunk_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade,
  CONSTRAINT "memory_history_chunk_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade,
  CONSTRAINT "memory_history_chunk_user_message_id_message_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."message"("id") ON DELETE cascade,
  CONSTRAINT "memory_history_chunk_assistant_message_id_message_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."message"("id") ON DELETE cascade
);
CREATE UNIQUE INDEX "memory_history_chunk_exchange_uidx" ON "memory_history_chunk" USING btree ("user_id", "user_message_id", "assistant_message_id");
CREATE INDEX "memory_history_chunk_user_idx" ON "memory_history_chunk" USING btree ("user_id");
CREATE INDEX "memory_history_chunk_conversation_idx" ON "memory_history_chunk" USING btree ("conversation_id");
CREATE INDEX "memory_history_chunk_search_idx" ON "memory_history_chunk" USING gin (to_tsvector('simple', "content"));
CREATE INDEX "memory_history_chunk_embedding_hnsw_idx" ON "memory_history_chunk" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE "memory_job" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text,
  "type" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "run_after" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "memory_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
CREATE INDEX "memory_job_claim_idx" ON "memory_job" USING btree ("status", "run_after");

CREATE TABLE "memory_event" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "memory_id" text,
  "type" text NOT NULL,
  "key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "memory_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
CREATE INDEX "memory_event_user_created_idx" ON "memory_event" USING btree ("user_id", "created_at");

CREATE TABLE "memory_pending_action" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "memory_pending_action_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
CREATE INDEX "memory_pending_action_user_idx" ON "memory_pending_action" USING btree ("user_id", "status");
