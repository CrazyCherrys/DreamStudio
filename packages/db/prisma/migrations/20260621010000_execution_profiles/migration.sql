CREATE TYPE "execution_profile_operation" AS ENUM ('text_to_image', 'image_to_image', 'image_edit', 'conversational_image');
CREATE TYPE "execution_profile_revision_status" AS ENUM ('draft', 'active', 'archived');
CREATE TYPE "execution_profile_source_kind" AS ENUM ('manual', 'openai_official', 'gemini_official', 'third_party_docs', 'imported_json');

CREATE TABLE "ai_model_execution_profiles" (
  "id" UUID NOT NULL,
  "ai_model_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "operation" "execution_profile_operation" NOT NULL,
  "adapter_key" VARCHAR(120) NOT NULL,
  "adapter_version" VARCHAR(40) NOT NULL DEFAULT '1',
  "transport_key" VARCHAR(80) NOT NULL DEFAULT 'new_api_bearer',
  "upstream_model_id" VARCHAR(240) NOT NULL,
  "upstream_endpoint_path" VARCHAR(240),
  "reference_transfer_mode" "reference_transfer_mode" NOT NULL DEFAULT 'none',
  "supports_reference_image" BOOLEAN NOT NULL DEFAULT false,
  "max_reference_images" INTEGER NOT NULL DEFAULT 0,
  "parameter_schema" JSONB NOT NULL DEFAULT '[]',
  "default_params" JSONB NOT NULL DEFAULT '{}',
  "request_mapping" JSONB NOT NULL DEFAULT '{}',
  "response_parser_key" VARCHAR(120) NOT NULL,
  "capabilities" JSONB NOT NULL DEFAULT '{}',
  "validation_rules" JSONB NOT NULL DEFAULT '{}',
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "ai_model_execution_profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_model_execution_profiles_ai_model_id_idx" ON "ai_model_execution_profiles"("ai_model_id");
CREATE INDEX "ai_model_execution_profiles_operation_idx" ON "ai_model_execution_profiles"("operation");
CREATE INDEX "ai_model_execution_profiles_adapter_key_idx" ON "ai_model_execution_profiles"("adapter_key");
CREATE INDEX "ai_model_execution_profiles_is_default_idx" ON "ai_model_execution_profiles"("is_default");
CREATE INDEX "ai_model_execution_profiles_is_enabled_idx" ON "ai_model_execution_profiles"("is_enabled");
CREATE INDEX "ai_model_execution_profiles_sort_order_idx" ON "ai_model_execution_profiles"("sort_order");
CREATE INDEX "ai_model_execution_profiles_deleted_at_idx" ON "ai_model_execution_profiles"("deleted_at");
ALTER TABLE "ai_model_execution_profiles" ADD CONSTRAINT "ai_model_execution_profiles_ai_model_id_fkey" FOREIGN KEY ("ai_model_id") REFERENCES "ai_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ai_model_execution_profile_revisions" (
  "id" UUID NOT NULL,
  "execution_profile_id" UUID NOT NULL,
  "revision_no" INTEGER NOT NULL,
  "status" "execution_profile_revision_status" NOT NULL DEFAULT 'draft',
  "source_kind" "execution_profile_source_kind" NOT NULL DEFAULT 'manual',
  "source_url" TEXT,
  "source_checked_at" TIMESTAMPTZ(6),
  "source_summary" TEXT,
  "adapter_key" VARCHAR(120) NOT NULL,
  "adapter_version" VARCHAR(40) NOT NULL DEFAULT '1',
  "transport_key" VARCHAR(80) NOT NULL DEFAULT 'new_api_bearer',
  "upstream_model_id" VARCHAR(240) NOT NULL,
  "upstream_endpoint_path" VARCHAR(240),
  "reference_transfer_mode" "reference_transfer_mode" NOT NULL DEFAULT 'none',
  "supports_reference_image" BOOLEAN NOT NULL DEFAULT false,
  "max_reference_images" INTEGER NOT NULL DEFAULT 0,
  "parameter_schema" JSONB NOT NULL DEFAULT '[]',
  "default_params" JSONB NOT NULL DEFAULT '{}',
  "request_mapping" JSONB NOT NULL DEFAULT '{}',
  "response_parser_key" VARCHAR(120) NOT NULL,
  "capabilities" JSONB NOT NULL DEFAULT '{}',
  "validation_rules" JSONB NOT NULL DEFAULT '{}',
  "change_summary" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activated_by" UUID,
  "activated_at" TIMESTAMPTZ(6),
  "archived_at" TIMESTAMPTZ(6),
  CONSTRAINT "ai_model_execution_profile_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "profile_revisions_profile_id_revision_no_key" ON "ai_model_execution_profile_revisions"("execution_profile_id", "revision_no");
CREATE INDEX "ai_model_execution_profile_revisions_execution_profile_id_idx" ON "ai_model_execution_profile_revisions"("execution_profile_id");
CREATE INDEX "ai_model_execution_profile_revisions_status_idx" ON "ai_model_execution_profile_revisions"("status");
CREATE INDEX "ai_model_execution_profile_revisions_source_kind_idx" ON "ai_model_execution_profile_revisions"("source_kind");
CREATE INDEX "ai_model_execution_profile_revisions_created_by_idx" ON "ai_model_execution_profile_revisions"("created_by");
CREATE INDEX "ai_model_execution_profile_revisions_activated_by_idx" ON "ai_model_execution_profile_revisions"("activated_by");
CREATE INDEX "ai_model_execution_profile_revisions_created_at_idx" ON "ai_model_execution_profile_revisions"("created_at");
CREATE INDEX "ai_model_execution_profile_revisions_activated_at_idx" ON "ai_model_execution_profile_revisions"("activated_at");
ALTER TABLE "ai_model_execution_profile_revisions" ADD CONSTRAINT "ai_model_execution_profile_revisions_execution_profile_id_fkey" FOREIGN KEY ("execution_profile_id") REFERENCES "ai_model_execution_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_model_execution_profile_revisions" ADD CONSTRAINT "ai_model_execution_profile_revisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_model_execution_profile_revisions" ADD CONSTRAINT "ai_model_execution_profile_revisions_activated_by_fkey" FOREIGN KEY ("activated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "image_tasks"
  ADD COLUMN "execution_profile_id" UUID,
  ADD COLUMN "execution_profile_revision_id" UUID,
  ADD COLUMN "adapter_key_snapshot" VARCHAR(120),
  ADD COLUMN "adapter_version_snapshot" VARCHAR(40),
  ADD COLUMN "execution_profile_snapshot" JSONB,
  ADD COLUMN "request_mapping_snapshot" JSONB,
  ADD COLUMN "resolved_request_sanitized_snapshot" JSONB;

CREATE INDEX "image_tasks_execution_profile_id_idx" ON "image_tasks"("execution_profile_id");
CREATE INDEX "image_tasks_execution_profile_revision_id_idx" ON "image_tasks"("execution_profile_revision_id");
ALTER TABLE "image_tasks" ADD CONSTRAINT "image_tasks_execution_profile_id_fkey" FOREIGN KEY ("execution_profile_id") REFERENCES "ai_model_execution_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "image_tasks" ADD CONSTRAINT "image_tasks_execution_profile_revision_id_fkey" FOREIGN KEY ("execution_profile_revision_id") REFERENCES "ai_model_execution_profile_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "request_logs"
  ADD COLUMN "adapter_key" VARCHAR(120),
  ADD COLUMN "adapter_version" VARCHAR(40),
  ADD COLUMN "execution_profile_id" UUID,
  ADD COLUMN "execution_profile_revision_id" UUID,
  ADD COLUMN "resolved_request_sanitized" JSONB,
  ADD COLUMN "upstream_response_summary" JSONB,
  ADD COLUMN "profile_error_hint" TEXT;

CREATE INDEX "request_logs_execution_profile_id_idx" ON "request_logs"("execution_profile_id");
CREATE INDEX "request_logs_execution_profile_revision_id_idx" ON "request_logs"("execution_profile_revision_id");
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_execution_profile_id_fkey" FOREIGN KEY ("execution_profile_id") REFERENCES "ai_model_execution_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_execution_profile_revision_id_fkey" FOREIGN KEY ("execution_profile_revision_id") REFERENCES "ai_model_execution_profile_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
