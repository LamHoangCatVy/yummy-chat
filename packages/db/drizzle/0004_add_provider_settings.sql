CREATE TABLE "ai_providers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider_kind" text NOT NULL,
	"display_name" text NOT NULL,
	"encrypted_api_key" text,
	"endpoint" text,
	"selected_model" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_providers_provider_kind_check" CHECK ("provider_kind" IN ('openai', 'anthropic', 'google', 'openai-compatible'))
);
--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "ai_providers" (
	"user_id",
	"provider_kind",
	"display_name",
	"encrypted_api_key",
	"endpoint",
	"selected_model",
	"is_default"
)
SELECT
	"user_id",
	'openai-compatible',
	'OpenAI Compatible',
	"encrypted_api_key",
	"endpoint",
	"selected_model",
	true
FROM "user_api_settings"
WHERE "encrypted_api_key" IS NOT NULL OR "endpoint" IS NOT NULL;
