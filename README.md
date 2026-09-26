# Handoff: Wavv — music library, player, search & visuals

## Overview
Wavv is a music app that syncs a user's Spotify library and plays it with a customizable, beat-synced visualizer. This package covers four screens — **Library**, **Now Playing**, **Search**, **Visuals** — targeted at **mobile (iOS/Android)** and **web**.

## About the design files
The files in `design/` are **design references built in HTML** — prototypes showing the intended look and behavior, not production code. Recreate them in the target codebase's environment using its own patterns:
- **Mobile:** React Native (Expo) or SwiftUI/Jetpack Compose.
- **Web:** React (Next.js/Vite) or the existing web stack.
A shared cross-platform choice (React Native + React Native Web, or Expo Router) works well since all screens are phone-first.

To view: open any `design/*.dc.html` directly in a browser (keep `support.js` and `visualizer.js` beside them). Screens link to each other.

## Fidelity
**High-fidelity.** Colors, type sizes, spacing, radii and interactions are final. Recreate pixel-accurately.

## Canvas & layout
- Artboard: **390 × 844** (iPhone 14/15). Safe-area top padding is baked in as `56px`; bottom tab bar has `28px` bottom padding for the home indicator — use real safe-area insets in code.
- Horizontal page padding: **24px**.
- **Web:** center the 390px-wide column on phones; on tablet/desktop, cap content width (~480px for Player/Visuals) or expand grids (Library 3 → 5–6 columns) — the tab bar becomes a left rail ≥ 1024px (suggestion, not designed).

## Design tokens
**Colors (dark cool theme)**
| Token | Hex | Use |
|---|---|---|
| bg | `#12161C` | Page background |
| surface | `#1A2029` | Cards, search field, tiles |
| surface-2 | `#232B36` | Dividers, pressed/selected fills, small buttons |
| tabbar | `#151A21` | Bottom tab bar |
| border | `#2F3845` | Outlined chips/buttons |
| text | `#E6ECF2` | Primary text |
| text-2 | `#B8C3D1` | Secondary controls/icons |
| text-3 | `#8A96A6` | Meta text |
| text-4 | `#7C8898` | Inactive tab |
| text-5 | `#5F6B7A` | Tertiary / placeholders |
| text-6 | `#46505D` | Footer note on Player |
| accent | `#29B6F6` | Active tab, selected states, primary chip |
| accent-deep | `#1E4E8C` | Gradient end |
| success | `#4CA870` | Synced / matched |
| warning | `#C99A4A` | Partially matched |
| progress gradient | `#4A8FE7 → #8B1E2B` | Player progress fill (90°) |

Translucent accent: pause button `rgba(41,182,246,0.28)` fill + `rgba(41,182,246,0.5)` 1px border + `backdrop-filter: blur(12px)`.

**Typography** — `Sweet Sans Pro` (commercial; license required), fallback `Helvetica Neue`, sans-serif.
| Role | Size / weight |
|---|---|
| Screen title (wavv / Search / Visuals) | 30 / 600, letter-spacing −0.5px |
| Section heading | 17 / 600 |
| Item title | 13–15 / 600 |
| Body / chip | 14 / 500 |
| Meta | 12–13 / 400 |
| Tab label | 11 / 500 (active 600) |

**Radius:** 8 (small thumbs, menu items), 10 (grid covers), 12 (search field, tiles, menus, CTA), 14–16 (cards), 20 (pill chips), full (round buttons, artist avatars).
**Shadow:** sort menu only — `0 12px 32px rgba(0,0,0,0.45)`.
**Spacing:** 4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 28.

## Screens

### 1. Library (`Library.dc.html`)
- **Header:** "wavv" title; below, green check icon + "Synced from Spotify · 2h ago" (13px, text-3).
- **Filter chips** (row, gap 8, padding 20/24/4): Playlists (active: accent fill, bg text), Liked, Albums (outlined: 1px border, text-2). Pills 9×16 padding.
- **Scroll area** (padding 16/24/24, gap 14):
  - Row: "Playlists" heading + **Sort** button (lines icon + current label, 13px text-2). Tapping opens a dropdown (right-aligned, 180px min, surface bg, border, radius 12, shadow) with: Recently added (default), A–Z, Z–A, Most tracks. Selected option: surface-2 fill, accent text, ✓. Selecting closes the menu and re-sorts **both** grids.
  - **Playlists grid:** 3 equal columns (`minmax(0,1fr)`), gap 16 row / 10 col. Cell: square cover (radius 10) → title (13/600, 1-line ellipsis) → "N tracks" (12, text-3).
  - "Albums" heading, same 3-col grid; subtitle is artist.
  - Footer note: "12 unmatched tracks across your library" (13, text-5).
- **Tab bar:** Library (active) · Search · Visuals · Sync. 22px icons, 11px labels, 1px top border surface-2.
- Tapping "Late Night Drives" → Now Playing.

### 2. Now Playing (`Player.dc.html`)
- Top bar: back (36px round, surface) → Library; center label "LATE NIGHT DRIVES" (11/600, 1px tracking, uppercase); overflow ⋯ button.
- **Visualizer stage:** 300×300 cover art behind at **15% opacity**, masked with a vertical gradient so the lower half fades to ~5% (`#000 25% → rgba(0,0,0,.333) 75%`). The selected visualizer (from Visuals screen) renders on top at 300×300. Below: "Change visual" link → Visuals.
- Track title / artist (Holocene · Bon Iver), "Streaming from your library".
- **Progress:** 4px track surface-2, fill uses progress gradient, width = elapsed %. Times 1:47 / 4:36 (12, text-5).
- **Controls row** (centered, gap 36): Previous · Pause (64px circle, translucent accent, blur, light icon) · Next.
- **Shuffle** on its own row, right-aligned: icon toggles text-2 ↔ accent with a 4px dot indicator when on.
- Footer: `From playlist "Late Night Drives" · 32/32 matched`.

### 3. Search (`Search.dc.html`)
- Title "Search"; search field 46px tall, surface fill, radius 12, 1px border (surface-2 → accent on focus), leading search icon, placeholder "Songs, artists, playlists", clear (×) button when non-empty.
- **Empty query:** "Recent searches" chips (outlined pills) — tap fills the query.
- **With query:** live filter over songs, playlists, albums, artists (name + meta, case-insensitive). Label "N results in your library". Row: 48px thumb (artists round), title 15/600, meta 13 text-3. No results: "Nothing in your library matches that."

### 4. Visuals (`Visuals.dc.html`)
- Title "Visuals", subtitle "Pick a style and color. It plays in sync with your music."
- **Preview card** (surface, radius 16): 210px stage with current song's cover at 15% behind the live visualizer; now-playing strip below (40px cover, title, green dot + "Artist · synced at N BPM", round Next button that cycles demo songs).
- **Style grid:** 12 tiles, 3 columns, gap 10. Each tile: live mini visualizer (62px) + name. Selected: 2px accent border + accent label.
  Styles: Bars, Mirror, Wave, Radial, Rings, Dot grid, Particles, Blob, Terrain, Pixel, Spiral, Ridges.
- **Color row:** 9 × 32px circular swatches — **Auto** (uses the current song's cover-art colors; marked "A"), Glacier, Aurora, Ember, Mono, Lagoon, Sunset, Lime, Violet. Selected: 2px text-color ring. Palette hexes are in `visualizer.js` (`PALETTES`).
- CTA "See it in Now Playing →" (accent-tinted card) → Player.

## Visualizer engine (`visualizer.js`)
Reference implementation on `<canvas>` (2D context, DPR-aware, 60fps rAF). Props: `viz` (style id), `palette` (id or `auto`), `autoColors` (song colors), `bpm`, `bg`, `saved` (read selection from storage).
- **Prototype audio is simulated**: a 32-band spectrum is synthesized from BPM (kick envelope on each beat, hats on off-beats, low-frequency noise) and smoothed per frame (lerp 0.35).
- **Production:** replace `spectrum()` with real FFT data —
  - Web: Web Audio `AnalyserNode.getByteFrequencyData` (fftSize 2048 → bucket to 32 log-spaced bands).
  - iOS: `AVAudioEngine` tap + `vDSP` FFT. Android: `Visualizer` API (RECORD_AUDIO permission) or ExoPlayer audio processor.
  - Spotify-streamed audio can't be tapped directly; use the Spotify Web API audio-analysis (beats/segments/tempo) to drive the same envelope, or play local files.
- Port the 12 draw functions to Skia (`@shopify/react-native-skia`) on mobile or keep Canvas/WebGL on web.

## State management
- `visual: { style: string, palette: string }` — **persisted** (prototype uses `localStorage['wavv.visual']`; use AsyncStorage/MMKV on mobile). Shared by Visuals and Now Playing; changes apply live.
- Library: `sort: 'recent' | 'az' | 'za' | 'tracks'`, `sortOpen: boolean`.
- Player: `shuffle: boolean`, playback position, current track (title, artist, bpm, cover colors).
- Search: `query: string`, `focused: boolean`; results derived from library index.
- Data: Spotify sync (playlists, liked, albums, match counts), last-sync timestamp.

## Assets
- Icons: stroke icons in Lucide style (library, search, audio-lines, refresh, shuffle, skip, pause, arrow). Use `lucide-react` / `lucide-react-native`.
- Cover art: **placeholders** (CSS gradients). Replace with real artwork from the Spotify API.
- Font: Sweet Sans Pro — license and bundle `.otf/.woff2`.
- Album names and BPMs are demo content.

## Files
- `design/Library.dc.html` — Library screen
- `design/Player.dc.html` — Now Playing
- `design/Search.dc.html` — Search
- `design/Visuals.dc.html` — Visualizer picker
- `design/visualizer.js` — visualizer reference engine (12 styles, 8 palettes)
- `design/support.js` — runtime needed only to open the HTML prototypes
