CREATE TYPE "profile_preset_family" AS ENUM (
  'openai_official',
  'openai_compatible',
  'gemini_official'
);

CREATE TYPE "profile_preset_origin" AS ENUM (
  'manual',
  'template_clone'
);

CREATE TABLE "profile_presets" (
  "id" UUID NOT NULL,
  "family" "profile_preset_family" NOT NULL,
  "origin" "profile_preset_origin" NOT NULL DEFAULT 'manual',
  "label" VARCHAR(160) NOT NULL,
  "description" VARCHAR(1200),
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "bootstrap_enabled" BOOLEAN NOT NULL DEFAULT false,
  "bootstrap_profile_name" VARCHAR(160) NOT NULL,
  "bootstrap_operation" "execution_profile_operation" NOT NULL,
  "source_template_id" VARCHAR(120),
  "source_template_mode" VARCHAR(80),
  "revision_template" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "profile_presets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "profile_presets_family_idx" ON "profile_presets"("family");
CREATE INDEX "profile_presets_origin_idx" ON "profile_presets"("origin");
CREATE INDEX "profile_presets_sort_order_idx" ON "profile_presets"("sort_order");
CREATE INDEX "profile_presets_bootstrap_enabled_idx" ON "profile_presets"("bootstrap_enabled");
CREATE INDEX "profile_presets_deleted_at_idx" ON "profile_presets"("deleted_at");
