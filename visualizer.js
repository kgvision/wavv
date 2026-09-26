(function () {
  const PALETTES = {
    glacier: ['#1E4E8C', '#29B6F6', '#E6ECF2'],
    aurora: ['#14D8EA', '#4AA8FF', '#9A5CFF', '#FF5EC4'],
    ember: ['#8B1E2B', '#E4572E', '#FFB86B'],
    mono: ['#5F6B7A', '#E6ECF2'],
    lagoon: ['#0F766E', '#2DD4BF', '#CCFBF1'],
    sunset: ['#6D28D9', '#DB2777', '#F59E0B'],
    lime: ['#14532D', '#84CC16', '#ECFCCB'],
    violet: ['#312E81', '#8B5CF6', '#E9D5FF']
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const TAU = Math.PI * 2;

  function spectrum(t, bpm, N, prev) {
    const beat = t * bpm / 60, ph = beat % 1;
    const kick = Math.exp(-ph * 5), off = Math.exp(-((beat + 0.5) % 1) * 8);
    const out = new Array(N);
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1);
      let v = 0.16 + 0.26 * (0.5 + 0.5 * Math.sin(t * 1.7 + i * 0.9)) * (0.5 + 0.5 * Math.sin(t * 0.63 + i * 0.37));
      v += kick * 0.55 * Math.pow(1 - x, 1.4);
      v += off * 0.3 * x * x;
      v += 0.1 * Math.sin(t * 3.1 + i * 2.3) * (0.5 + x * 0.5);
      v = clamp(v, 0.03, 1);
      out[i] = prev && prev.length === N ? prev[i] + (v - prev[i]) * 0.35 : v;
    }
    return { bands: out, kick, beat };
  }
  function sample(bands, x) {
    const f = clamp(x, 0, 1) * (bands.length - 1), i = Math.floor(f), r = f - i;
    return bands[i] * (1 - r) + (bands[Math.min(i + 1, bands.length - 1)]) * r;
  }
  function grad(ctx, x0, y0, x1, y1, colors) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    colors.forEach((c, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
    return g;
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  const seeds = Array.from({ length: 70 }, (_, i) => ({ a: (i * 137.5) % 360 * Math.PI / 180, r: ((i * 53) % 100) / 100, s: 0.4 + ((i * 29) % 60) / 100, b: i % 24 }));

  const DRAW = {
    bars(ctx, w, h, S) {
      const n = 24, gap = w / n * 0.28, bw = w / n - gap;
      ctx.fillStyle = grad(ctx, 0, h, 0, 0, S.colors);
      for (let i = 0; i < n; i++) { const v = sample(S.bands, i / (n - 1)) * h * 0.92; rr(ctx, i * (bw + gap) + gap / 2, h - v, bw, v, bw / 3); ctx.fill(); }
    },
    mirror(ctx, w, h, S) {
      const n = 32, gap = w / n * 0.3, bw = w / n - gap;
      ctx.fillStyle = grad(ctx, 0, 0, w, 0, S.colors);
      for (let i = 0; i < n; i++) { const v = sample(S.bands, Math.abs(i - (n - 1) / 2) / ((n - 1) / 2)) * h * 0.46; rr(ctx, i * (bw + gap) + gap / 2, h / 2 - v, bw, v * 2, bw / 2); ctx.fill(); }
    },
    wave(ctx, w, h, S) {
      ctx.lineWidth = Math.max(2, h / 80); ctx.lineCap = 'round';
      for (let k = 2; k >= 0; k--) {
        ctx.globalAlpha = k === 0 ? 1 : 0.35 / k;
        ctx.strokeStyle = grad(ctx, 0, 0, w, 0, S.colors);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const u = x / w, env = Math.sin(u * Math.PI);
          const y = h / 2 + env * h * 0.36 * (0.35 + S.kick * 0.65) * (Math.sin(u * 14 + S.t * 4 + k) * 0.6 + Math.sin(u * 31 - S.t * 6) * sample(S.bands, u) * 0.6);
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    radial(ctx, w, h, S) {
      const cx = w / 2, cy = h / 2, m = Math.min(w, h), r0 = m * 0.2 * (1 + S.kick * 0.1), n = 60;
      ctx.strokeStyle = grad(ctx, cx - m / 2, cy + m / 2, cx + m / 2, cy - m / 2, S.colors);
      ctx.lineWidth = Math.max(1.5, m / 90); ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + S.t * 0.2, v = sample(S.bands, Math.abs(i / n * 2 - 1)) * m * 0.26;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * (r0 + v), cy + Math.sin(a) * (r0 + v)); ctx.stroke();
      }
    },
    rings(ctx, w, h, S) {
      const cx = w / 2, cy = h / 2, m = Math.min(w, h);
      for (let i = 0; i < 6; i++) {
        const v = sample(S.bands, i / 5);
        ctx.strokeStyle = S.colors[i % S.colors.length]; ctx.globalAlpha = 1 - i * 0.13;
        ctx.lineWidth = Math.max(1.5, m / 70) * (1 + v);
        ctx.beginPath(); ctx.arc(cx, cy, m * (0.08 + i * 0.07) * (1 + v * 0.35), 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    dots(ctx, w, h, S) {
      const cols = 14, rows = 9, cw = w / cols, ch = h / rows;
      for (let c = 0; c < cols; c++) {
        const lit = sample(S.bands, c / (cols - 1)) * rows;
        for (let r = 0; r < rows; r++) {
          const on = rows - r <= lit;
          ctx.fillStyle = on ? S.colors[Math.min(S.colors.length - 1, Math.floor((rows - r) / rows * S.colors.length))] : 'rgba(255,255,255,0.06)';
          ctx.beginPath(); ctx.arc(c * cw + cw / 2, r * ch + ch / 2, Math.min(cw, ch) * (on ? 0.32 : 0.2), 0, TAU); ctx.fill();
        }
      }
    },
    particles(ctx, w, h, S) {
      const cx = w / 2, cy = h / 2, m = Math.min(w, h);
      seeds.forEach((p, i) => {
        const v = S.bands[p.b % S.bands.length];
        const rad = ((p.r + S.t * 0.05 * p.s * (1 + S.kick)) % 1) * m * 0.55;
        const a = p.a + S.t * 0.15 * p.s;
        ctx.fillStyle = S.colors[i % S.colors.length]; ctx.globalAlpha = 1 - rad / (m * 0.55);
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 1 + v * m / 45, 0, TAU); ctx.fill();
      });
      ctx.globalAlpha = 1;
    },
    blob(ctx, w, h, S) {
      const cx = w / 2, cy = h / 2, m = Math.min(w, h), n = 40, pts = [];
      for (let i = 0; i < n; i++) { const a = i / n * TAU, v = sample(S.bands, Math.abs(i / n * 2 - 1)); const r = m * (0.2 + v * 0.16 + S.kick * 0.04 + 0.02 * Math.sin(a * 3 + S.t * 2)); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const p = pts[i % n], q = pts[(i + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; i ? ctx.quadraticCurveTo(p[0], p[1], mx, my) : ctx.moveTo(mx, my); }
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.42);
      S.colors.slice().reverse().forEach((c, i, a) => g.addColorStop(a.length === 1 ? 0 : i / (a.length - 1), c));
      ctx.fillStyle = g; ctx.fill();
    },
    mountains(ctx, w, h, S) {
      for (let k = 2; k >= 0; k--) {
        ctx.globalAlpha = k === 0 ? 1 : 0.4 / k;
        ctx.fillStyle = grad(ctx, 0, h, 0, h * 0.1, S.colors);
        ctx.beginPath(); ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 3) { const u = x / w; ctx.lineTo(x, h - sample(S.bands, (u + k * 0.13) % 1) * h * (0.85 - k * 0.12)); }
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    pixel(ctx, w, h, S) {
      const cols = 16, cell = w / cols, rows = Math.floor(h / cell);
      for (let c = 0; c < cols; c++) {
        const lit = Math.round(sample(S.bands, c / (cols - 1)) * rows);
        for (let r = 0; r < lit; r++) { ctx.fillStyle = S.colors[Math.min(S.colors.length - 1, Math.floor(r / rows * S.colors.length))]; ctx.fillRect(c * cell + 1.5, h - (r + 1) * cell + 1.5, cell - 3, cell - 3); }
      }
    },
    spiral(ctx, w, h, S) {
      const cx = w / 2, cy = h / 2, m = Math.min(w, h), n = 120;
      for (let i = 0; i < n; i++) {
        const u = i / n, a = u * TAU * 3 + S.t * 0.6, r = u * m * 0.46, v = sample(S.bands, u);
        ctx.fillStyle = S.colors[Math.floor(u * S.colors.length) % S.colors.length];
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.8 + v * m / 40 * (0.4 + u), 0, TAU); ctx.fill();
      }
    },
    ridges(ctx, w, h, S) {
      const n = 12, step = h / (n + 3);
      ctx.lineWidth = Math.max(1.2, h / 180);
      for (let k = 0; k < n; k++) {
        const base = step * (k + 3);
        ctx.beginPath(); ctx.moveTo(0, base);
        for (let x = 0; x <= w; x += 3) {
          const u = x / w, env = Math.pow(Math.sin(u * Math.PI), 4);
          ctx.lineTo(x, base - env * sample(S.bands, (u * 0.7 + k * 0.07) % 1) * step * 3.2 * (0.6 + 0.4 * Math.sin(S.t * 2 + k + u * 9)));
        }
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
        ctx.fillStyle = S.bg; ctx.fill();
        ctx.strokeStyle = S.colors[k % S.colors.length]; ctx.stroke();
      }
    }
  };

  function readSaved() { try { return JSON.parse(localStorage.getItem('wavv.visual') || '{}'); } catch (e) { return {}; } }

  function Visualizer(props) {
    const ref = React.useRef(null);
    const pr = React.useRef(props); pr.current = props;
    React.useEffect(() => {
      const cv = ref.current, ctx = cv.getContext('2d');
      let raf, prev = null, saved = readSaved();
      const onSaved = () => { saved = readSaved(); };
      window.addEventListener('storage', onSaved); window.addEventListener('wavv-visual', onSaved);
      const t0 = performance.now();
      const loop = () => {
        const p = pr.current, dpr = window.devicePixelRatio || 1;
        const w = cv.clientWidth, h = cv.clientHeight;
        if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
        const styleId = (p.saved ? saved.style : p.viz) || 'bars';
        const palId = (p.saved ? saved.palette : p.palette) || 'auto';
        const colors = palId === 'auto' ? (p.autoColors || PALETTES.glacier) : (PALETTES[palId] || PALETTES.glacier);
        const t = (performance.now() - t0) / 1000 + (p.seed || 0);
        const sp = spectrum(t, p.bpm || 100, 32, prev); prev = sp.bands;
        if (w > 0 && h > 0) (DRAW[styleId] || DRAW.bars)(ctx, w, h, { bands: sp.bands, kick: sp.kick, t, colors, bg: p.bg || '#12161C' });
        raf = requestAnimationFrame(loop);
      };
      loop();
      return () => { cancelAnimationFrame(raf); window.removeEventListener('storage', onSaved); window.removeEventListener('wavv-visual', onSaved); };
    }, []);
    return React.createElement('canvas', { ref, 'aria-hidden': true, style: { display: 'block', width: '100%', height: '100%' } });
  }
  window.WAVV_PALETTES = PALETTES;
  if (typeof module !== 'undefined') module.exports = { Visualizer };
  else window.Visualizer = Visualizer;
})();
