-- Map background image (spec § 6.12.5): base64 PNG from the image model.
alter table routes add column if not exists map_image text;
alter table routes add column if not exists map_image_generated_at timestamptz;
