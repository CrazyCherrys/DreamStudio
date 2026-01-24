CREATE TABLE IF NOT EXISTS image_generation_tasks (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model_id VARCHAR(200) NOT NULL,
    prompt TEXT NOT NULL,
    resolution VARCHAR(32),
    aspect_ratio VARCHAR(32),
    reference_image TEXT,
    count INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    image_urls JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_image_generation_tasks_user_created_at
    ON image_generation_tasks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_image_generation_tasks_status_created_at
    ON image_generation_tasks (status, created_at);
