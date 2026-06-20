ALTER TABLE "storage_settings"
  ADD COLUMN "s3_endpoint" TEXT,
  ADD COLUMN "s3_bucket" TEXT,
  ADD COLUMN "s3_region" TEXT,
  ADD COLUMN "s3_force_path_style" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "s3_public_base_url" TEXT,
  ADD COLUMN "encrypted_s3_access_key" TEXT,
  ADD COLUMN "s3_access_key_iv" TEXT,
  ADD COLUMN "s3_access_key_tag" TEXT,
  ADD COLUMN "s3_access_key_version" INTEGER,
  ADD COLUMN "masked_s3_access_key" VARCHAR(160),
  ADD COLUMN "encrypted_s3_secret_key" TEXT,
  ADD COLUMN "s3_secret_key_iv" TEXT,
  ADD COLUMN "s3_secret_key_tag" TEXT,
  ADD COLUMN "s3_secret_key_version" INTEGER,
  ADD COLUMN "masked_s3_secret_key" VARCHAR(160);

CREATE TABLE "assets" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "kind" "asset_kind" NOT NULL,
  "status" "asset_status" NOT NULL DEFAULT 'available',
  "storage_driver" "storage_driver" NOT NULL,
  "bucket" TEXT,
  "object_key" TEXT NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(120) NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "checksum" VARCHAR(128) NOT NULL,
  "source_task_id" UUID,
  "needs_physical_delete" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "cleaned_at" TIMESTAMPTZ(6),
  CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assets_user_id_idx" ON "assets"("user_id");
CREATE INDEX "assets_kind_idx" ON "assets"("kind");
CREATE INDEX "assets_status_idx" ON "assets"("status");
CREATE INDEX "assets_storage_driver_idx" ON "assets"("storage_driver");
CREATE INDEX "assets_source_task_id_idx" ON "assets"("source_task_id");
CREATE INDEX "assets_created_at_idx" ON "assets"("created_at");
CREATE INDEX "assets_deleted_at_idx" ON "assets"("deleted_at");
CREATE INDEX "assets_expires_at_idx" ON "assets"("expires_at");
CREATE INDEX "assets_cleaned_at_idx" ON "assets"("cleaned_at");
CREATE INDEX "assets_needs_physical_delete_idx" ON "assets"("needs_physical_delete");
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "cleanup_runs" (
  "id" UUID NOT NULL,
  "job_type" VARCHAR(80) NOT NULL,
  "status" VARCHAR(40) NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL,
  "finished_at" TIMESTAMPTZ(6),
  "scanned_count" INTEGER NOT NULL DEFAULT 0,
  "deleted_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "error_summary" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cleanup_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cleanup_runs_job_type_idx" ON "cleanup_runs"("job_type");
CREATE INDEX "cleanup_runs_status_idx" ON "cleanup_runs"("status");
CREATE INDEX "cleanup_runs_started_at_idx" ON "cleanup_runs"("started_at");
CREATE INDEX "cleanup_runs_created_at_idx" ON "cleanup_runs"("created_at");
