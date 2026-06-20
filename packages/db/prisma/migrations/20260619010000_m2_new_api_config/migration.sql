CREATE TABLE "user_new_api_configs" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "new_api_base_url" TEXT NOT NULL,
  "uses_custom_base_url" BOOLEAN NOT NULL DEFAULT false,
  "encrypted_api_key" TEXT NOT NULL,
  "key_iv" TEXT NOT NULL,
  "key_tag" TEXT NOT NULL,
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "masked_api_key" VARCHAR(160) NOT NULL,
  "status" "new_api_config_status" NOT NULL DEFAULT 'untested',
  "last_tested_at" TIMESTAMPTZ(6),
  "last_test_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_new_api_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_new_api_configs_user_id_key" ON "user_new_api_configs"("user_id");
CREATE INDEX "user_new_api_configs_status_idx" ON "user_new_api_configs"("status");
CREATE INDEX "user_new_api_configs_last_tested_at_idx" ON "user_new_api_configs"("last_tested_at");
ALTER TABLE "user_new_api_configs" ADD CONSTRAINT "user_new_api_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "actor_user_id" UUID,
  "action" VARCHAR(160) NOT NULL,
  "target_type" VARCHAR(120) NOT NULL,
  "target_id" UUID,
  "result" "audit_result" NOT NULL DEFAULT 'success',
  "ip_address" INET,
  "user_agent" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX "audit_logs_expires_at_idx" ON "audit_logs"("expires_at");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
