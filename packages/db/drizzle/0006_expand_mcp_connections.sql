ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "connection_type" text DEFAULT 'remote_custom' NOT NULL;
--> statement-breakpoint
ALTER TABLE "mcp_server" ALTER COLUMN "url" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "config" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "encrypted_secrets" text;
--> statement-breakpoint
ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "encrypted_oauth_tokens" text;
--> statement-breakpoint
ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "encrypted_oauth_client_information" text;
--> statement-breakpoint
UPDATE "mcp_server" SET "connection_type" = 'remote_custom' WHERE "connection_type" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_oauth_attempt" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" text NOT NULL,
	"user_id" text NOT NULL,
	"state_hash" text NOT NULL,
	"encrypted_code_verifier" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mcp_oauth_attempt" ADD CONSTRAINT "mcp_oauth_attempt_server_id_mcp_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."mcp_server"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mcp_oauth_attempt" ADD CONSTRAINT "mcp_oauth_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_oauth_attempt_state_hash_uidx" ON "mcp_oauth_attempt" USING btree ("state_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_oauth_attempt_server_id_idx" ON "mcp_oauth_attempt" USING btree ("server_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_oauth_attempt_user_id_idx" ON "mcp_oauth_attempt" USING btree ("user_id");
