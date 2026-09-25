# Spotify → Navidrome Sync

Syncs your Spotify playlists, Liked Songs, and Saved Albums into Navidrome
playlists, matching each track against your local library.

## Setup

1. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Create a Spotify app**
   Go to https://developer.spotify.com/dashboard → Create app.
   - Add `http://localhost:8888/callback` as a Redirect URI (or match whatever you put in config.json)
   - Copy the Client ID and Client Secret

3. **Configure**
   ```bash
   cp config.example.json config.json
   ```
   Fill in your Spotify client ID/secret and your Navidrome URL + login.

4. **First run** (opens a browser for Spotify login/consent once, then caches the token)
   ```bash
   python spotify_navidrome_sync.py
   ```

5. **Check results**
   - Matched tracks appear as playlists in Navidrome (playlists get your Spotify playlist names; albums are prefixed `Album:`; liked songs go to "Spotify Liked Songs")
   - Anything that couldn't be matched is listed in `unmatched_tracks.log` — use this to see what's missing from your library

## Running it daily, automatically

Pick whichever fits your setup:

**Option A — built into the script (works anywhere, needs the process to stay running)**
```bash
python spotify_navidrome_sync.py --daemon
```
Runs once immediately, then repeats every 24h (configurable via `sync_interval_hours` in config.json). Good inside a Docker container or a `screen`/`tmux` session, or as a systemd service.

**Option B — cron (Linux/macOS/NAS)**
```bash
crontab -e
# Add:
0 3 * * * cd /path/to/this/folder && /usr/bin/python3 spotify_navidrome_sync.py >> sync.log 2>&1
```

**Option C — Windows Task Scheduler**
Create a daily task that runs:
```
python C:\path\to\spotify_navidrome_sync.py
```

Once you know where this will actually run, I can write the exact systemd unit file or Task Scheduler XML for it.

## Notes

- Matching is fuzzy (artist + title similarity), since Spotify and your local file metadata won't be identical. Adjust the `threshold` in `Navidrome.find_best_match()` if you get too many/few false matches.
- Re-running the sync overwrites the matched playlists each time (idempotent) — safe to run daily.
- Spotify's API only gives metadata, never audio, so this never downloads or streams anything from Spotify — it just tells Navidrome what to build from files you already have.
