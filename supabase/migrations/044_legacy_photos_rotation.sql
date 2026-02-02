-- Add rotation column to legacy_history_photos
ALTER TABLE legacy_history_photos
ADD COLUMN rotation INTEGER DEFAULT 0;

-- Add comment
COMMENT ON COLUMN legacy_history_photos.rotation IS 'Rotation angle in degrees (0, 90, 180, 270)';
