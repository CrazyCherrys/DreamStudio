CREATE TABLE "model_categories" (
  "id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(120) NOT NULL,
  "icon" VARCHAR(80),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "model_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "model_categories_slug_key" ON "model_categories"("slug");
CREATE INDEX "model_categories_sort_order_idx" ON "model_categories"("sort_order");
CREATE INDEX "model_categories_is_enabled_idx" ON "model_categories"("is_enabled");
CREATE INDEX "model_categories_deleted_at_idx" ON "model_categories"("deleted_at");

CREATE TABLE "ai_models" (
  "id" UUID NOT NULL,
  "category_id" UUID,
  "model_id" VARCHAR(240) NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "provider_name" VARCHAR(120),
  "endpoint_type" "model_endpoint_type" NOT NULL,
  "reference_transfer_mode" "reference_transfer_mode" NOT NULL DEFAULT 'none',
  "supports_reference_image" BOOLEAN NOT NULL DEFAULT false,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "is_recommended" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "default_params" JSONB NOT NULL DEFAULT '{}',
  "parameter_schema" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_models_model_id_endpoint_type_active_key" ON "ai_models"("model_id", "endpoint_type") WHERE "deleted_at" IS NULL;
CREATE INDEX "ai_models_category_id_idx" ON "ai_models"("category_id");
CREATE INDEX "ai_models_endpoint_type_idx" ON "ai_models"("endpoint_type");
CREATE INDEX "ai_models_is_enabled_idx" ON "ai_models"("is_enabled");
CREATE INDEX "ai_models_is_recommended_idx" ON "ai_models"("is_recommended");
CREATE INDEX "ai_models_sort_order_idx" ON "ai_models"("sort_order");
CREATE INDEX "ai_models_deleted_at_idx" ON "ai_models"("deleted_at");
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "model_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "model_sync_snapshots" (
  "id" UUID NOT NULL,
  "base_url" TEXT NOT NULL,
  "operator_id" UUID NOT NULL,
  "raw_response" JSONB NOT NULL,
  "model_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "model_sync_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "model_sync_snapshots_operator_id_idx" ON "model_sync_snapshots"("operator_id");
CREATE INDEX "model_sync_snapshots_created_at_idx" ON "model_sync_snapshots"("created_at");
ALTER TABLE "model_sync_snapshots" ADD CONSTRAINT "model_sync_snapshots_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
