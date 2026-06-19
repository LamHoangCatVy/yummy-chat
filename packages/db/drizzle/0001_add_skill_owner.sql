ALTER TABLE "skill" ADD COLUMN "owner_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "prompt" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "model" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "temperature" real;
--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "max_tokens" integer;
--> statement-breakpoint
ALTER TABLE "skill" DROP CONSTRAINT "skill_name_unique";
