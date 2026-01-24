ALTER TABLE gallery_images
    ADD COLUMN IF NOT EXISTS submission_status VARCHAR(20) NOT NULL DEFAULT 'none';
ALTER TABLE gallery_images
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE gallery_images
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE gallery_images
    ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id);

UPDATE gallery_images
SET submission_status = 'approved',
    submitted_at = COALESCE(submitted_at, created_at),
    reviewed_at = COALESCE(reviewed_at, updated_at)
WHERE is_public = TRUE
  AND submission_status = 'none';

CREATE INDEX IF NOT EXISTS idx_gallery_images_submission_status_created_at
    ON gallery_images (submission_status, created_at DESC);
