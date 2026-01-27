CREATE TABLE IF NOT EXISTS redink_records (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    outline_raw TEXT,
    content_json JSONB,
    input_images JSONB,
    text_model_id VARCHAR(200),
    image_model_id VARCHAR(200),
    resolution VARCHAR(32),
    aspect_ratio VARCHAR(32),
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    thumbnail_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS redink_pages (
    id BIGSERIAL PRIMARY KEY,
    record_id BIGINT NOT NULL REFERENCES redink_records(id) ON DELETE CASCADE,
    page_index INT NOT NULL,
    page_type VARCHAR(20) NOT NULL DEFAULT 'content',
    page_content TEXT NOT NULL,
    prompt_text TEXT,
    image_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    error_message TEXT,
    last_error TEXT,
    next_attempt_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_redink_records_user_created_at
    ON redink_records (user_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_redink_records_status_created_at
    ON redink_records (status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_redink_pages_record_page_index
    ON redink_pages (record_id, page_index)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_redink_pages_record_status
    ON redink_pages (record_id, status)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_redink_pages_status_retry
    ON redink_pages (status, next_attempt_at)
    WHERE deleted_at IS NULL;
