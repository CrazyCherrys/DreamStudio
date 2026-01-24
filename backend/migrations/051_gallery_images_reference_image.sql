-- +goose Up
-- +goose StatementBegin
ALTER TABLE gallery_images
    ADD COLUMN IF NOT EXISTS reference_image_url TEXT;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE gallery_images
    DROP COLUMN IF EXISTS reference_image_url;
-- +goose StatementEnd
