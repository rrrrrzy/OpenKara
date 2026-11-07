use crate::cache;
use crate::commands::error::{database_error, CommandResult};
use crate::library::playlist;
use crate::AppState;
use tauri::State;

pub use crate::library::playlist::{Playlist, PlaylistSong, RotationState};

fn get_connection(state: &AppState) -> CommandResult<rusqlite::Connection> {
    let library_root = state.library_root()?;
    cache::open_database(&library_root.database_path()).map_err(database_error)
}

#[tauri::command]
pub fn list_playlists(state: State<'_, AppState>) -> CommandResult<Vec<Playlist>> {
    let conn = get_connection(&state)?;
    playlist::list_playlists(&conn)
}

#[tauri::command]
pub fn create_playlist(state: State<'_, AppState>, name: String) -> CommandResult<Playlist> {
    let conn = get_connection(&state)?;
    playlist::create_playlist(&conn, name)
}

#[tauri::command]
pub fn rename_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    name: String,
) -> CommandResult<()> {
    let conn = get_connection(&state)?;
    playlist::rename_playlist(&conn, &playlist_id, &name)
}

#[tauri::command]
pub fn delete_playlist(state: State<'_, AppState>, playlist_id: String) -> CommandResult<()> {
    let conn = get_connection(&state)?;
    playlist::delete_playlist(&conn, &playlist_id)
}

#[tauri::command]
pub fn add_songs_to_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    song_hashes: Vec<String>,
) -> CommandResult<()> {
    let mut conn = get_connection(&state)?;
    playlist::add_songs_to_playlist(&mut conn, &playlist_id, &song_hashes)
}

#[tauri::command]
pub fn remove_songs_from_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    song_hashes: Vec<String>,
) -> CommandResult<()> {
    let mut conn = get_connection(&state)?;
    playlist::remove_songs_from_playlist(&mut conn, &playlist_id, &song_hashes)
}

#[tauri::command]
pub fn reorder_playlist_songs(
    state: State<'_, AppState>,
    playlist_id: String,
    song_hashes: Vec<String>,
) -> CommandResult<()> {
    let mut conn = get_connection(&state)?;
    playlist::reorder_playlist_songs(&mut conn, &playlist_id, &song_hashes)
}

#[tauri::command]
pub fn get_playlist_songs(
    state: State<'_, AppState>,
    playlist_id: String,
) -> CommandResult<Vec<PlaylistSong>> {
    let conn = get_connection(&state)?;
    playlist::get_playlist_songs(&conn, &playlist_id)
}

#[tauri::command]
pub fn set_rotation_state(
    state: State<'_, AppState>,
    rotation: RotationState,
) -> CommandResult<()> {
    let conn = get_connection(&state)?;
    playlist::set_rotation_state(&conn, &rotation)
}

#[tauri::command]
pub fn get_rotation_state(state: State<'_, AppState>) -> CommandResult<RotationState> {
    let conn = get_connection(&state)?;
    playlist::get_rotation_state(&conn)
}

#[tauri::command]
pub fn advance_rotation(state: State<'_, AppState>) -> CommandResult<RotationState> {
    let mut conn = get_connection(&state)?;
    playlist::advance_rotation(&mut conn)
}

#[tauri::command]
pub fn set_queue_entry_singer(
    state: State<'_, AppState>,
    playlist_id: String,
    song_hash: String,
    singer: Option<String>,
) -> CommandResult<()> {
    let conn = get_connection(&state)?;
    playlist::set_queue_entry_singer(&conn, &playlist_id, &song_hash, singer.as_deref())
}

#[tauri::command]
pub fn save_playlist_songs(
    state: State<'_, AppState>,
    playlist_id: String,
    expected: Vec<PlaylistSong>,
    entries: Vec<PlaylistSong>,
) -> CommandResult<()> {
    let mut conn = get_connection(&state)?;
    playlist::save_playlist_songs(&mut conn, &playlist_id, &expected, &entries)
}

#[tauri::command]
pub fn check_playlist_ready(
    state: State<'_, AppState>,
    song_hashes: Vec<String>,
) -> CommandResult<Vec<String>> {
    let root = state.library_root()?;
    let conn = get_connection(&state)?;
    let mut unavailable = Vec::new();
    for hash in song_hashes {
        let song = cache::get_song_by_hash(&conn, &hash).map_err(database_error)?;
        let stems = cache::stems::get_cached_stem_entry(&conn, &hash).map_err(database_error)?;
        let ready = song.as_ref().is_some_and(|s| {
            !s.is_remote()
                && s.file_path
                    .as_ref()
                    .is_some_and(|path| root.resolve(path).is_file())
        }) && stems.is_some_and(|entry| {
            let mut paths = vec![entry.vocals_path.as_str()];
            if entry.has_individual_stems() {
                paths.extend([
                    entry.drums_path.as_deref().unwrap(),
                    entry.bass_path.as_deref().unwrap(),
                    entry.other_path.as_deref().unwrap(),
                ]);
            } else {
                paths.push(&entry.accomp_path);
            }
            paths.iter().all(|path| {
                root.resolve(path)
                    .metadata()
                    .is_ok_and(|m| m.is_file() && m.len() > 0)
            })
        });
        if !ready {
            unavailable.push(hash);
        }
    }
    Ok(unavailable)
}
