CREATE TYPE "model_modality" AS ENUM ('chat', 'image', 'video');

ALTER TABLE "ai_models" DROP CONSTRAINT IF EXISTS "ai_models_category_id_fkey";
DROP INDEX IF EXISTS "ai_models_model_id_endpoint_type_active_key";
DROP INDEX IF EXISTS "ai_models_category_id_idx";
DROP INDEX IF EXISTS "ai_models_endpoint_type_idx";

ALTER TABLE "ai_models"
  ADD COLUMN "modality" "model_modality" NOT NULL DEFAULT 'image',
  ADD COLUMN "icon_url" VARCHAR(500),
  ADD COLUMN "description" TEXT,
  ADD COLUMN "endpoint_types" "model_endpoint_type"[];

UPDATE "ai_models"
SET "endpoint_types" = ARRAY["endpoint_type"]::"model_endpoint_type"[]
WHERE "endpoint_types" IS NULL;

ALTER TABLE "ai_models"
  ALTER COLUMN "endpoint_types" SET NOT NULL,
  DROP COLUMN "category_id",
  DROP COLUMN "endpoint_type";

CREATE INDEX "ai_models_modality_idx" ON "ai_models"("modality");

CREATE TABLE "user_model_favorites" (
  "user_id" UUID NOT NULL,
  "model_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_model_favorites_pkey" PRIMARY KEY ("user_id", "model_id")
);

CREATE INDEX "user_model_favorites_model_id_idx" ON "user_model_favorites"("model_id");
ALTER TABLE "user_model_favorites" ADD CONSTRAINT "user_model_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_model_favorites" ADD CONSTRAINT "user_model_favorites_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE IF EXISTS "model_categories";
