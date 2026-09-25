#!/usr/bin/env python3
"""
Spotify -> Navidrome sync.

Pulls your Spotify playlists, Liked Songs, and Saved Albums, matches each
track against your Navidrome library (fuzzy match on artist + title), and
creates/updates matching playlists in Navidrome. Tracks that can't be
matched are logged to unmatched_tracks.log so you know what's missing
from your local library.

Setup:
    pip install -r requirements.txt
    cp config.example.json config.json   # fill in your values
    python spotify_navidrome_sync.py            # run once
    python spotify_navidrome_sync.py --daemon    # run once, then every 24h
"""

import argparse
import hashlib
import json
import logging
import sys
import time
from pathlib import Path

import requests
import spotipy
from rapidfuzz import fuzz
from spotipy.oauth2 import SpotifyOAuth

CONFIG_PATH = Path(__file__).parent / "config.json"
UNMATCHED_LOG = Path(__file__).parent / "unmatched_tracks.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("sync")


def load_config():
    if not CONFIG_PATH.exists():
        log.error(f"Missing {CONFIG_PATH}. Copy config.example.json to config.json and fill it in.")
        sys.exit(1)
    with open(CONFIG_PATH) as f:
        return json.load(f)


# ---------- Spotify ----------

def get_spotify_client(cfg):
    auth = SpotifyOAuth(
        client_id=cfg["spotify"]["client_id"],
        client_secret=cfg["spotify"]["client_secret"],
        redirect_uri=cfg["spotify"]["redirect_uri"],
        scope="playlist-read-private user-library-read",
        cache_path=str(Path(__file__).parent / ".spotify_cache"),
        open_browser=cfg["spotify"].get("open_browser", True),
    )
    return spotipy.Spotify(auth_manager=auth)


def fetch_playlists(sp):
    """Returns {playlist_name: [(artist, title), ...]}"""
    playlists = {}
    results = sp.current_user_playlists(limit=50)
    while results:
        for pl in results["items"]:
            tracks = []
            track_results = sp.playlist_items(pl["id"], additional_types=["track"])
            while track_results:
                for item in track_results["items"]:
                    t = item.get("track")
                    if t and t.get("artists"):
                        tracks.append((t["artists"][0]["name"], t["name"]))
                track_results = sp.next(track_results) if track_results.get("next") else None
            playlists[pl["name"]] = tracks
        results = sp.next(results) if results.get("next") else None
    return playlists


def fetch_liked_songs(sp):
    tracks = []
    results = sp.current_user_saved_tracks(limit=50)
    while results:
        for item in results["items"]:
            t = item["track"]
            if t and t.get("artists"):
                tracks.append((t["artists"][0]["name"], t["name"]))
        results = sp.next(results) if results.get("next") else None
    return tracks


def fetch_saved_albums(sp):
    """Returns {album_name (Artist - Album): [(artist, title), ...]}"""
    albums = {}
    results = sp.current_user_saved_albums(limit=50)
    while results:
        for item in results["items"]:
            album = item["album"]
            key = f"{album['artists'][0]['name']} - {album['name']}"
            tracks = [(t["artists"][0]["name"], t["name"]) for t in album["tracks"]["items"]]
            albums[key] = tracks
        results = sp.next(results) if results.get("next") else None
    return albums


# ---------- Navidrome (Subsonic API) ----------

class Navidrome:
    def __init__(self, cfg):
        self.base_url = cfg["navidrome"]["url"].rstrip("/")
        self.user = cfg["navidrome"]["username"]
        self.password = cfg["navidrome"]["password"]
        self.client_name = "spotify-sync"
        self._song_cache = None  # id -> (artist, title)

    def _auth_params(self):
        # Subsonic token auth (salted MD5, avoids sending plaintext password)
        salt = hashlib.md5(str(time.time()).encode()).hexdigest()[:8]
        token = hashlib.md5((self.password + salt).encode()).hexdigest()
        return {
            "u": self.user,
            "t": token,
            "s": salt,
            "v": "1.16.1",
            "c": self.client_name,
            "f": "json",
        }

    def _get(self, endpoint, extra_params=None):
        params = self._auth_params()
        if extra_params:
            params.update(extra_params)
        r = requests.get(f"{self.base_url}/rest/{endpoint}", params=params, timeout=30)
        r.raise_for_status()
        data = r.json()["subsonic-response"]
        if data.get("status") != "ok":
            raise RuntimeError(f"Navidrome error on {endpoint}: {data.get('error')}")
        return data

    def all_songs(self):
        """Fetch and cache the full song library as {id: (artist, title)}."""
        if self._song_cache is not None:
            return self._song_cache
        log.info("Indexing Navidrome library (first run may take a moment)...")
        songs = {}
        offset = 0
        page_size = 500
        while True:
            data = self._get("search3", {
                "query": "",
                "songCount": page_size,
                "songOffset": offset,
                "albumCount": 0,
                "artistCount": 0,
            })
            batch = data.get("searchResult3", {}).get("song", [])
            if not batch:
                break
            for s in batch:
                songs[s["id"]] = (s.get("artist", ""), s.get("title", ""))
            offset += page_size
            if len(batch) < page_size:
                break
        log.info(f"Indexed {len(songs)} songs from Navidrome.")
        self._song_cache = songs
        return songs

    def find_best_match(self, artist, title, threshold=82):
        """Fuzzy-match (artist, title) against the library. Returns song id or None."""
        songs = self.all_songs()
        best_id, best_score = None, 0
        target = f"{artist} {title}".lower()
        for song_id, (a, t) in songs.items():
            score = fuzz.token_sort_ratio(target, f"{a} {t}".lower())
            if score > best_score:
                best_score, best_id = score, song_id
        return best_id if best_score >= threshold else None

    def get_or_create_playlist_id(self, name):
        data = self._get("getPlaylists")
        for pl in data.get("playlists", {}).get("playlist", []):
            if pl["name"] == name:
                return pl["id"]
        data = self._get("createPlaylist", {"name": name})
        return data["playlist"]["id"]

    def set_playlist_songs(self, playlist_id, song_ids):
        """Replace a playlist's contents entirely with song_ids (dedup order-preserving)."""
        seen = set()
        ordered = [s for s in song_ids if not (s in seen or seen.add(s))]
        # Clear existing songs first
        data = self._get("getPlaylist", {"id": playlist_id})
        existing = data.get("playlist", {}).get("entry", [])
        if existing:
            idx_params = [("songIndexToRemove", i) for i in range(len(existing))]
            self._get("updatePlaylist", {"playlistId": playlist_id, **dict(idx_params)})
        for song_id in ordered:
            self._get("updatePlaylist", {"playlistId": playlist_id, "songIdToAdd": song_id})


# ---------- Sync logic ----------

def sync_track_group(nav, group_name, tracks, unmatched_writer):
    song_ids = []
    for artist, title in tracks:
        match = nav.find_best_match(artist, title)
        if match:
            song_ids.append(match)
        else:
            unmatched_writer.write(f"[{group_name}] {artist} - {title}\n")
    if not song_ids:
        log.warning(f"'{group_name}': no matches found, skipping playlist creation.")
        return 0, len(tracks)
    playlist_id = nav.get_or_create_playlist_id(group_name)
    nav.set_playlist_songs(playlist_id, song_ids)
    log.info(f"'{group_name}': matched {len(song_ids)}/{len(tracks)} tracks.")
    return len(song_ids), len(tracks)


def run_sync(cfg):
    sp = get_spotify_client(cfg)
    nav = Navidrome(cfg)

    total_matched, total_tracks = 0, 0
    with open(UNMATCHED_LOG, "w") as unmatched:
        playlists = fetch_playlists(sp)
        for name, tracks in playlists.items():
            m, t = sync_track_group(nav, name, tracks, unmatched)
            total_matched += m
            total_tracks += t

        liked = fetch_liked_songs(sp)
        m, t = sync_track_group(nav, "Spotify Liked Songs", liked, unmatched)
        total_matched += m
        total_tracks += t

        albums = fetch_saved_albums(sp)
        for name, tracks in albums.items():
            m, t = sync_track_group(nav, f"Album: {name}", tracks, unmatched)
            total_matched += m
            total_tracks += t

    log.info(f"Sync complete: {total_matched}/{total_tracks} tracks matched overall.")
    if total_tracks - total_matched > 0:
        log.info(f"Unmatched tracks logged to {UNMATCHED_LOG}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--daemon", action="store_true", help="Run once, then repeat every N hours (see config).")
    args = parser.parse_args()

    cfg = load_config()
    run_sync(cfg)

    if args.daemon:
        interval_hours = cfg.get("sync_interval_hours", 24)
        log.info(f"Daemon mode: syncing every {interval_hours}h. Press Ctrl+C to stop.")
        while True:
            time.sleep(interval_hours * 3600)
            try:
                run_sync(cfg)
            except Exception as e:
                log.error(f"Sync failed: {e}")


if __name__ == "__main__":
    main()
