// Wavv ↔ Spotify (Authorization Code + PKCE, fully client-side — works on GitHub Pages)
(function () {
  const DEFAULT_CLIENT_ID = ''; // optional: paste your Spotify app Client ID here
  const SCOPES = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative user-library-read user-read-currently-playing user-read-playback-state user-modify-playback-state streaming';
  const K = { cid: 'wavv.spotify.clientId', tok: 'wavv.spotify.token', ver: 'wavv.spotify.verifier', lib: 'wavv.spotify.lib' };
  const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const redirectUri = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'Sync.dc.html';
  const clientId = () => get(K.cid) || DEFAULT_CLIENT_ID;

  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const randStr = n => b64url(crypto.getRandomValues(new Uint8Array(n)));

  async function login() {
    const id = clientId();
    if (!id) throw new Error('Add your Spotify Client ID first.');
    const verifier = randStr(64);
    set(K.ver, verifier);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const q = new URLSearchParams({ response_type: 'code', client_id: id, scope: SCOPES, redirect_uri: redirectUri(), code_challenge_method: 'S256', code_challenge: challenge });
    const url = 'https://accounts.spotify.com/authorize?' + q;
    if (window.top !== window) { const w = window.open(url, '_blank'); if (w) return 'popup'; }
    location.href = url;
  }

  async function tokenRequest(body) {
    const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.error || 'Token request failed');
    const prev = get(K.tok) || {};
    const tok = { access: j.access_token, refresh: j.refresh_token || prev.refresh, scope: j.scope || prev.scope || '', exp: Date.now() + (j.expires_in - 60) * 1000 };
    set(K.tok, tok);
    return tok;
  }

  // Call on the Sync page load: finishes the redirect back from Spotify.
  async function handleRedirect() {
    const p = new URLSearchParams(location.search);
    if (p.get('error')) { history.replaceState(null, '', location.pathname); throw new Error('Spotify: ' + p.get('error')); }
    const code = p.get('code');
    if (!code) return false;
    history.replaceState(null, '', location.pathname);
    await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), client_id: clientId(), code_verifier: get(K.ver) });
    localStorage.removeItem(K.ver);
    return true;
  }

  async function accessToken() {
    const t = get(K.tok);
    if (!t) return null;
    if (Date.now() < t.exp) return t.access;
    if (!t.refresh) return null;
    return (await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: clientId() })).access;
  }

  async function api(path, method, body) {
    const at = await accessToken();
    if (!at) throw new Error('Not connected');
    const opts = { method: method || 'GET', headers: { Authorization: 'Bearer ' + at } };
    if (body) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
    const r = await fetch(path.startsWith('http') ? path : 'https://api.spotify.com/v1' + path, opts);
    if (r.status === 204 || r.status === 202) return null;
    const txt = await r.text();
    const j = txt ? JSON.parse(txt) : null;
    if (!j) { if (r.ok) return null; throw new Error('Spotify API error ' + r.status); }
    if (!r.ok) throw new Error((j.error && j.error.message) || 'Spotify API error ' + r.status);
    return j;
  }

  async function all(path, max = 200) {
    let url = path, out = [];
    while (url && out.length < max) { const j = await api(url); out = out.concat(j.items || []); url = j.next; }
    return out;
  }

  const img = imgs => (imgs && imgs[0] && imgs[0].url) || null;

  async function sync() {
    const [user, pls, albs, liked] = await Promise.all([
      api('/me'), all('/me/playlists?limit=50'), all('/me/albums?limit=50'), api('/me/tracks?limit=50')
    ]);
    const n = pls.length;
    const lib = {
      user: { name: user.display_name || user.id, image: img(user.images), product: user.product },
      liked: liked ? liked.total : 0,
      playlists: pls.filter(Boolean).map((p, i) => ({ id: p.id, name: p.name, n: (p.tracks && p.tracks.total) ?? (p.items && p.items.total) ?? 0, added: n - i, image: img(p.images), url: p.external_urls && p.external_urls.spotify })),
      albums: albs.map(a => ({ id: a.album.id, name: a.album.name, artist: (a.album.artists || []).map(x => x.name).join(', '), n: a.album.total_tracks, added: Date.parse(a.added_at) || 0, image: img(a.album.images), url: a.album.external_urls && a.album.external_urls.spotify })),
      likedTracks: ((liked && liked.items) || []).map(x => x.track).filter(Boolean).map(t => ({ id: t.id, uri: t.uri, name: t.name, artist: (t.artists || []).map(a => a.name).join(', '), ms: t.duration_ms, image: img(t.album && t.album.images) })),
      syncedAt: Date.now()
    };
    set(K.lib, lib);
    return lib;
  }

  // Load a playlist or album with its tracks
  async function collection(kind, id) {
    if (kind === 'liked') {
      const raw = await all('/me/tracks?limit=50', 200);
      const tr = raw.map(x => x.track).filter(Boolean);
      return { uri: null, name: 'Liked Songs', image: null, tracks: tr.map(t => ({ id: t.id, uri: t.uri, name: t.name, artist: (t.artists || []).map(a => a.name).join(', '), ms: t.duration_ms, image: img(t.album && t.album.images) })) };
    }
    const c = await api(`/${kind}s/${id}`);
    let items;
    if (kind === 'playlist') {
      const raw = await all(`/playlists/${id}/tracks?limit=100`, 300);
      items = raw.map(x => x.track || x.item).filter(t => t && t.type === 'track');
    } else {
      items = (await all(`/albums/${id}/tracks?limit=50`, 300)).map(t => Object.assign(t, { album: { images: c.images, name: c.name } }));
    }
    return {
      uri: c.uri, name: c.name, image: img(c.images), url: c.external_urls && c.external_urls.spotify,
      tracks: items.map(t => ({ id: t.id, uri: t.uri, name: t.name, artist: (t.artists || []).map(a => a.name).join(', '), ms: t.duration_ms, image: img(t.album && t.album.images) || img(c.images) }))
    };
  }

  // Spotify Web Playback SDK (Premium) — plays inside the page
  let playerP = null;
  function initPlayer(onState) {
    if (playerP) return playerP;
    playerP = new Promise((resolve, reject) => {
      const start = () => {
        const player = new window.Spotify.Player({ name: 'Wavv', volume: 0.8, getOAuthToken: cb => accessToken().then(cb) });
        player.addListener('ready', ({ device_id }) => resolve({ player, deviceId: device_id }));
        player.addListener('player_state_changed', st => onState && onState(st));
        ['initialization_error', 'authentication_error', 'account_error', 'playback_error'].forEach(ev => player.addListener(ev, ({ message }) => { reject(new Error(message)); onState && onState(null, message); }));
        player.connect().then(ok => { if (!ok) reject(new Error('Could not start the Spotify player.')); });
      };
      if (window.Spotify && window.Spotify.Player) return start();
      window.onSpotifyWebPlaybackSDKReady = start;
      const sc = document.createElement('script'); sc.src = 'https://sdk.scdn.co/spotify-player.js'; document.head.appendChild(sc);
      setTimeout(() => reject(new Error('Spotify player timed out.')), 15000);
    });
    return playerP;
  }
  const play = (deviceId, contextUri, position, uris) => api('/me/player/play?device_id=' + deviceId, 'PUT', uris ? { uris, offset: { position: position || 0 } } : { context_uri: contextUri, offset: { position: position || 0 } });
  const setShuffle = (deviceId, on) => api(`/me/player/shuffle?state=${on}&device_id=${deviceId}`, 'PUT');
  const canStream = () => { const t = get(K.tok); return !!(t && /streaming/.test(t.scope || '')); };

  function disconnect() { [K.tok, K.lib, K.ver].forEach(k => localStorage.removeItem(k)); }

  function ago(ts) {
    if (!ts) return '';
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60);
    return h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
  }

  window.WavvSpotify = {
    framed: () => window.top !== window,
    onPublishedSite: () => /github\.io$/.test(location.hostname),
    login, handleRedirect, sync, disconnect, api, ago, redirectUri,
    clientId, setClientId: id => set(K.cid, id.trim()),
    library: () => get(K.lib),
    collection, initPlayer, play, setShuffle, canStream,
    connected: () => !!get(K.tok)
  };
})();
