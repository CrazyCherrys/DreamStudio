CREATE TABLE IF NOT EXISTS video_generation_tasks (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model_id VARCHAR(200) NOT NULL,
    prompt TEXT NOT NULL,
    image TEXT,
    duration INT,
    width INT,
    height INT,
    fps INT,
    seed INT,
    count INT NOT NULL DEFAULT 1,
    external_id VARCHAR(120),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    error_message TEXT,
    last_error TEXT,
    next_attempt_at TIMESTAMPTZ,
    video_urls JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_video_generation_tasks_user_active_created_at
    ON video_generation_tasks (user_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_video_generation_tasks_status_created_at
    ON video_generation_tasks (status, created_at);
CREATE INDEX IF NOT EXISTS idx_video_generation_tasks_retry
    ON video_generation_tasks (status, next_attempt_at)
    WHERE deleted_at IS NULL;
