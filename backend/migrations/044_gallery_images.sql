-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS gallery_images (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT,
    prompt TEXT,
    model VARCHAR(100),
    width INT,
    height INT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_images_public_created_at
    ON gallery_images (is_public, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_images_user_created_at
    ON gallery_images (user_id, created_at DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_gallery_images_user_created_at;
DROP INDEX IF EXISTS idx_gallery_images_public_created_at;
DROP TABLE IF EXISTS gallery_images;
-- +goose StatementEnd
