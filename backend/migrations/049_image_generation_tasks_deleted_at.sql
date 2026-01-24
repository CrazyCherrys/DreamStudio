ALTER TABLE image_generation_tasks
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_image_generation_tasks_user_active_created_at
    ON image_generation_tasks (user_id, created_at DESC)
    WHERE deleted_at IS NULL;
