-- M0/M1 foundation subset from the confirmed DreamStudio v1 data model.
CREATE TYPE "user_role" AS ENUM ('user', 'super_admin');
CREATE TYPE "user_status" AS ENUM ('active', 'disabled', 'deleted');
CREATE TYPE "new_api_config_status" AS ENUM ('untested', 'valid', 'invalid');
CREATE TYPE "model_endpoint_type" AS ENUM ('openai_image_generations', 'openai_image_edits', 'gemini_generate_content');
CREATE TYPE "reference_transfer_mode" AS ENUM ('none', 'multipart', 'url');
CREATE TYPE "image_task_status" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'timeout', 'canceled');
CREATE TYPE "asset_kind" AS ENUM ('reference_image', 'result_image');
CREATE TYPE "asset_status" AS ENUM ('available', 'deleted', 'expired_cleaned');
CREATE TYPE "storage_driver" AS ENUM ('local', 's3');
CREATE TYPE "request_log_status" AS ENUM ('succeeded', 'failed', 'timeout', 'canceled');
CREATE TYPE "audit_result" AS ENUM ('success', 'failed');

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "username" VARCHAR(120) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" "user_role" NOT NULL DEFAULT 'user',
  "status" "user_status" NOT NULL DEFAULT 'active',
  "display_name" VARCHAR(160),
  "last_login_at" TIMESTAMPTZ(6),
  "disabled_at" TIMESTAMPTZ(6),
  "deleted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

CREATE TABLE "user_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "refresh_token_hash" TEXT,
  "ip_address" INET,
  "user_agent" TEXT,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");
CREATE INDEX "user_sessions_revoked_at_idx" ON "user_sessions"("revoked_at");
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "system_settings" (
  "key" VARCHAR(120) NOT NULL,
  "value" JSONB NOT NULL,
  "description" TEXT,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "storage_settings" (
  "id" UUID NOT NULL,
  "driver" "storage_driver" NOT NULL DEFAULT 'local',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "local_input_path" TEXT,
  "local_output_path" TEXT,
  "reference_retention_hours" INTEGER NOT NULL DEFAULT 12,
  "result_retention_hours" INTEGER NOT NULL DEFAULT 12,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "storage_settings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "storage_settings_driver_idx" ON "storage_settings"("driver");
CREATE INDEX "storage_settings_is_active_idx" ON "storage_settings"("is_active");
