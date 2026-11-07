use openkara_lib::{cache, library::playlist::*};
use rusqlite::Connection;

fn database() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    cache::apply_migrations(&conn).unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON; INSERT INTO songs (hash, file_path, duration_ms, imported_at) VALUES ('a', 'a.wav', 1000, 1), ('b', 'b.wav', 1000, 1);").unwrap();
    conn
}

#[test]
fn batch_save_is_atomic_and_detects_stale_edits() {
    let mut conn = database();
    let playlist = create_playlist(&conn, "Show".into()).unwrap();
    add_songs_to_playlist(&mut conn, &playlist.id, &["a".into(), "b".into()]).unwrap();
    let before = get_playlist_songs(&conn, &playlist.id).unwrap();
    assert_eq!(before[0].vocal_volume, None);
    let mut next = before.clone();
    next.reverse();
    for (index, entry) in next.iter_mut().enumerate() {
        entry.sort_order = index as i64;
        entry.vocal_volume = Some(if index == 0 { 0.0 } else { 0.3 });
        entry.accompaniment_volume = Some(0.85);
        entry.singer = Some("Guest".into());
    }
    save_playlist_songs(&mut conn, &playlist.id, &before, &next).unwrap();
    assert_eq!(get_playlist_songs(&conn, &playlist.id).unwrap(), next);
    assert!(save_playlist_songs(&mut conn, &playlist.id, &before, &next).is_err());
    let mut invalid = next.clone();
    invalid[1].song_hash = "missing".into();
    assert!(save_playlist_songs(&mut conn, &playlist.id, &next, &invalid).is_err());
    assert_eq!(get_playlist_songs(&conn, &playlist.id).unwrap(), next);
    cache::apply_migrations(&conn).unwrap();
    assert_eq!(get_playlist_songs(&conn, &playlist.id).unwrap(), next);
}

#[test]
fn levels_are_per_playlist_and_invalid_data_cannot_replace_saved_entries() {
    let mut conn = database();
    let a = create_playlist(&conn, "A".into()).unwrap();
    let b = create_playlist(&conn, "B".into()).unwrap();
    for id in [&a.id, &b.id] {
        add_songs_to_playlist(&mut conn, id, &["a".into()]).unwrap();
    }
    let original = get_playlist_songs(&conn, &a.id).unwrap();
    let mut next = original.clone();
    next[0].vocal_volume = Some(0.0);
    next[0].accompaniment_volume = Some(1.0);
    save_playlist_songs(&mut conn, &a.id, &original, &next).unwrap();
    assert_eq!(
        get_playlist_songs(&conn, &b.id).unwrap()[0].vocal_volume,
        None
    );
    for level in [f32::NAN, f32::INFINITY, -0.1, 1.1] {
        let mut invalid = next.clone();
        invalid[0].vocal_volume = Some(level);
        assert!(save_playlist_songs(&mut conn, &a.id, &next, &invalid).is_err());
    }
    let duplicated = vec![next[0].clone(), next[0].clone()];
    assert!(save_playlist_songs(&mut conn, &a.id, &next, &duplicated).is_err());
    assert_eq!(get_playlist_songs(&conn, &a.id).unwrap(), next);
}
