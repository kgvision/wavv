// Wavv ↔ Spotify (Authorization Code + PKCE, fully client-side — works on GitHub Pages)
(function () {
  const DEFAULT_CLIENT_ID = ''; // optional: paste your Spotify app Client ID here
  const SCOPES = 'user-read-private playlist-read-private playlist-read-collaborative user-library-read user-read-currently-playing';
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
    const tok = { access: j.access_token, refresh: j.refresh_token || prev.refresh, exp: Date.now() + (j.expires_in - 60) * 1000 };
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

  async function api(path) {
    const at = await accessToken();
    if (!at) throw new Error('Not connected');
    const r = await fetch(path.startsWith('http') ? path : 'https://api.spotify.com/v1' + path, { headers: { Authorization: 'Bearer ' + at } });
    if (r.status === 204) return null;
    const j = await r.json();
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
      api('/me'), all('/me/playlists?limit=50'), all('/me/albums?limit=50'), api('/me/tracks?limit=1')
    ]);
    const n = pls.length;
    const lib = {
      user: { name: user.display_name || user.id, image: img(user.images), product: user.product },
      liked: liked ? liked.total : 0,
      playlists: pls.filter(Boolean).map((p, i) => ({ id: p.id, name: p.name, n: (p.tracks && p.tracks.total) ?? (p.items && p.items.total) ?? 0, added: n - i, image: img(p.images), url: p.external_urls && p.external_urls.spotify })),
      albums: albs.map(a => ({ id: a.album.id, name: a.album.name, artist: (a.album.artists || []).map(x => x.name).join(', '), n: a.album.total_tracks, added: Date.parse(a.added_at) || 0, image: img(a.album.images), url: a.album.external_urls && a.album.external_urls.spotify })),
      syncedAt: Date.now()
    };
    set(K.lib, lib);
    return lib;
  }

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
    connected: () => !!get(K.tok)
  };
})();
