ALTER TABLE image_generation_tasks
    ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_error TEXT,
    ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_image_generation_tasks_retry
    ON image_generation_tasks (status, next_attempt_at)
    WHERE deleted_at IS NULL;
