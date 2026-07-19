ALTER TABLE "skill" ADD COLUMN "slug" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "manifest" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "skill"
SET "slug" = CONCAT(
  COALESCE(
    NULLIF(
      TRIM(
        BOTH '-' FROM LEFT(
          REGEXP_REPLACE(LOWER("name"), '[^a-z0-9]+', '-', 'g'),
          55
        )
      ),
      ''
    ),
    'skill'
  ),
  '-',
  LEFT(REPLACE("id", '-', ''), 8)
);
--> statement-breakpoint
UPDATE "skill"
SET "description" = LEFT(
  CONCAT('Use this skill for tasks that match the ', "name", ' workflow.'),
  1024
)
WHERE BTRIM("description") = '';
--> statement-breakpoint
CREATE UNIQUE INDEX "skill_owner_slug_unique" ON "skill" USING btree ("owner_id", "slug");
--> statement-breakpoint
DELETE FROM "conversation_skill_snapshot" AS older
USING "conversation_skill_snapshot" AS newer
WHERE older."conversation_id" = newer."conversation_id"
  AND (
    older."created_at" < newer."created_at"
    OR (older."created_at" = newer."created_at" AND older."id" < newer."id")
  );
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_skill_snapshot_conversation_unique"
ON "conversation_skill_snapshot" USING btree ("conversation_id");
--> statement-breakpoint
CREATE TABLE "skill_resource" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "skill_id" text NOT NULL,
  "path" text NOT NULL,
  "content" text NOT NULL,
  "encoding" text DEFAULT 'utf8' NOT NULL,
  "mime_type" text DEFAULT 'text/plain' NOT NULL,
  "byte_size" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "skill_resource_skill_id_skill_id_fk"
    FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id")
    ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "skill_resource_skill_path_unique"
ON "skill_resource" USING btree ("skill_id", "path");
