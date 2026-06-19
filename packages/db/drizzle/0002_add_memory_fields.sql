ALTER TABLE "memory_entry" ADD COLUMN "category" text;
ALTER TABLE "memory_entry" ADD COLUMN "source" text;
ALTER TABLE "memory_entry" ADD COLUMN "confidence" real;
--> statement-breakpoint
