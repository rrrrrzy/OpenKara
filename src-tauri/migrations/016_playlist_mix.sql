ALTER TABLE playlist_songs ADD COLUMN vocal_volume REAL CHECK (vocal_volume BETWEEN 0 AND 1);
ALTER TABLE playlist_songs ADD COLUMN accompaniment_volume REAL CHECK (accompaniment_volume BETWEEN 0 AND 1);
