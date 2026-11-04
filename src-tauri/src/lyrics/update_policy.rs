use crate::{cache, config};
use rusqlite::Connection;
use std::{path::Path, sync::Mutex};

use super::{acquisition::LyricsOnlineFetchIntent, error::LyricsError, fetch::LyricsSource};

// Serialize the preference write with the final automatic cache write, never HTTP.
pub(crate) static AUTO_UPDATE_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn blocks_automatic_update(
    connection: &Connection,
    app_data_dir: &Path,
    song_id: &str,
    intent: LyricsOnlineFetchIntent,
) -> Result<bool, LyricsError> {
    if intent != LyricsOnlineFetchIntent::AutomaticUpgrade {
        return Ok(false);
    }
    let config = config::load_config(app_data_dir)
        .map_err(|error| LyricsError::Internal(error.to_string()))?
        .unwrap_or_default();
    if config.effective_auto_update_lyrics() {
        return Ok(false);
    }
    let current = cache::lyrics::get_lyrics_cache_entry(connection, song_id)
        .map_err(|error| LyricsError::DatabaseUnavailable(error.to_string()))?;
    Ok(current
        .is_some_and(|entry| entry.source != LyricsSource::Absent && !entry.lrc.trim().is_empty()))
}
