CREATE TABLE "image_tasks" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "model_record_id" UUID NOT NULL,
  "model_id_snapshot" VARCHAR(240) NOT NULL,
  "endpoint_type_snapshot" "model_endpoint_type" NOT NULL,
  "new_api_base_url_snapshot" TEXT NOT NULL,
  "prompt_summary" VARCHAR(500) NOT NULL,
  "encrypted_prompt" TEXT NOT NULL,
  "prompt_iv" TEXT NOT NULL,
  "prompt_tag" TEXT NOT NULL,
  "negative_prompt_summary" VARCHAR(500),
  "encrypted_negative_prompt" TEXT,
  "negative_prompt_iv" TEXT,
  "negative_prompt_tag" TEXT,
  "parameter_snapshot" JSONB NOT NULL,
  "sanitized_parameter_snapshot" JSONB NOT NULL,
  "reference_asset_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "status" "image_task_status" NOT NULL DEFAULT 'pending',
  "error_code" VARCHAR(120),
  "error_message" TEXT,
  "client_request_id" VARCHAR(120),
  "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "deleted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "image_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "image_tasks_user_id_idx" ON "image_tasks"("user_id");
CREATE INDEX "image_tasks_status_idx" ON "image_tasks"("status");
CREATE INDEX "image_tasks_model_record_id_idx" ON "image_tasks"("model_record_id");
CREATE INDEX "image_tasks_created_at_idx" ON "image_tasks"("created_at");
CREATE INDEX "image_tasks_deleted_at_idx" ON "image_tasks"("deleted_at");
CREATE UNIQUE INDEX "image_tasks_user_id_client_request_id_key" ON "image_tasks"("user_id", "client_request_id") WHERE "client_request_id" IS NOT NULL;
ALTER TABLE "image_tasks" ADD CONSTRAINT "image_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "image_tasks" ADD CONSTRAINT "image_tasks_model_record_id_fkey" FOREIGN KEY ("model_record_id") REFERENCES "ai_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "image_task_attempts" (
  "id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "attempt_no" INTEGER NOT NULL,
  "status" "image_task_status" NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL,
  "finished_at" TIMESTAMPTZ(6),
  "http_status" INTEGER,
  "error_code" VARCHAR(120),
  "error_message" TEXT,
  "is_retryable" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "image_task_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "image_task_attempts_task_id_idx" ON "image_task_attempts"("task_id");
CREATE UNIQUE INDEX "image_task_attempts_task_id_attempt_no_key" ON "image_task_attempts"("task_id", "attempt_no");
ALTER TABLE "image_task_attempts" ADD CONSTRAINT "image_task_attempts_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "image_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "request_logs" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "attempt_id" UUID,
  "new_api_base_url_host" VARCHAR(255) NOT NULL,
  "model_id" VARCHAR(240) NOT NULL,
  "endpoint_type" "model_endpoint_type" NOT NULL,
  "status" "request_log_status" NOT NULL,
  "http_status" INTEGER,
  "duration_ms" INTEGER,
  "prompt_summary" VARCHAR(500),
  "encrypted_prompt" TEXT,
  "prompt_iv" TEXT,
  "prompt_tag" TEXT,
  "sanitized_params" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "encrypted_params" TEXT,
  "params_iv" TEXT,
  "params_tag" TEXT,
  "error_code" VARCHAR(120),
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "request_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "request_logs_user_id_idx" ON "request_logs"("user_id");
CREATE INDEX "request_logs_task_id_idx" ON "request_logs"("task_id");
CREATE INDEX "request_logs_status_idx" ON "request_logs"("status");
CREATE INDEX "request_logs_created_at_idx" ON "request_logs"("created_at");
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "image_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "image_task_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "assets" ADD CONSTRAINT "assets_source_task_id_fkey" FOREIGN KEY ("source_task_id") REFERENCES "image_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
