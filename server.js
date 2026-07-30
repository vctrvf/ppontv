const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');

function loadConfig() {
  const config = {
    PHOTOPRISM_URL: 'http://your-photoprism-host:2342',
    PHOTOPRISM_USER: 'your-username',
    PHOTOPRISM_PASSWORD: 'your-password',
    SLIDESHOW_INTERVAL: '5',
    SLIDESHOW_RANDOM: 'false',
    SHOW_INFO_OVERLAY: 'true',
    SHOW_CLOCK: 'true',
    PORT: '3000',
  };
  try {
    const confFile = fs.readFileSync('/config/ppontv.conf', 'utf8');
    confFile.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const idx = line.indexOf('=');
      if (idx === -1) return;
      config[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    });
  } catch (e) { console.log('No config file, using defaults'); }
  return config;
}

let config = loadConfig();
let sessionToken = null;
let previewToken = null;

function ppRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const baseUrl = new URL(config.PHOTOPRISM_URL);
    const isHttps = baseUrl.protocol === 'https:';
    const options = {
      hostname: baseUrl.hostname,
      port: baseUrl.port || (isHttps ? 443 : 80),
      path: endpoint, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (sessionToken) options.headers['X-Auth-Token'] = sessionToken;
    if (body) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    const req = (isHttps ? https : http).request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function ensureSession() {
  if (sessionToken) return true;
  try {
    const res = await ppRequest('/api/v1/session', 'POST', {
      username: config.PHOTOPRISM_USER,
      password: config.PHOTOPRISM_PASSWORD,
    });
    if (res.status === 200 && res.body.id) {
      sessionToken = res.body.id;
      previewToken = (res.body.config && res.body.config.previewToken) || 'public';
      console.log('Session established:', sessionToken.substring(0, 8) + '...');
      console.log('Preview token:', previewToken);
      return true;
    }
    console.log('Session failed:', res.status);
  } catch (e) { console.log('Session error:', e.message); }
  sessionToken = null;
  return false;
}

async function getAlbums() {
  await ensureSession();
  const res = await ppRequest('/api/v1/albums?count=500&offset=0&type=album&order=name');
  if (res.status === 401) { sessionToken = null; await ensureSession(); return getAlbums(); }
  return res.body || [];
}

async function getAlbumPhotos(albumUid) {
  await ensureSession();
  const res = await ppRequest(`/api/v1/photos?count=500&offset=0&s=${albumUid}&merged=true&order=oldest`);
  if (res.status === 401) { sessionToken = null; await ensureSession(); return getAlbumPhotos(albumUid); }
  return res.body || [];
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function albumsPage(albums) {
  const cfg = {
    interval: parseInt(config.SLIDESHOW_INTERVAL) * 1000,
    random: config.SLIDESHOW_RANDOM === 'true',
    overlay: config.SHOW_INFO_OVERLAY === 'true',
    clock: config.SHOW_CLOCK === 'true',
  };

  const albumCards = albums.map(a => {
    const thumb = a.Thumb ? `/proxy/t/${a.Thumb}/tile_500` : '';
    const count = a.PhotoCount || 0;
    return `
      <div class="album-card" onclick="startSlideshow('${a.UID}', '${escHtml(a.Title)}')"
           style="${thumb ? `background-image:url('${thumb}')` : 'background:#1a1a2e'}">
        <div class="album-info">
          <div class="album-title">${escHtml(a.Title)}</div>
          <div class="album-count">${count} photos</div>
        </div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ppontv</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0f; color: #fff; font-family: 'Segoe UI', sans-serif; overflow: hidden; height: 100vh; }

  #header { display: flex; justify-content: space-between; align-items: center; padding: 20px 40px; background: rgba(0,0,0,0.5); }
  #header h1 { font-size: 2rem; font-weight: 300; letter-spacing: 4px; color: #a78bfa; }
  #clock { font-size: 1.8rem; font-weight: 300; color: #e2e8f0; ${cfg.clock ? '' : 'display:none'} }

  #albums {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
    padding: 30px 40px;
    height: calc(100vh - 90px);
    overflow-y: auto;
    scrollbar-width: none;
  }
  #albums::-webkit-scrollbar { display: none; }

  .album-card {
    position: relative; height: 200px; border-radius: 12px;
    background-size: cover; background-position: center;
    cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;
    border: 2px solid transparent; overflow: hidden;
  }
  .album-card:hover {
    transform: scale(1.04);
    box-shadow: 0 0 0 3px #a78bfa;
    border-color: #a78bfa;
  }
  .album-card::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.1) 60%);
  }
  .album-info { position: absolute; bottom: 0; left: 0; right: 0; padding: 16px; }
  .album-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 4px; }
  .album-count { font-size: 0.85rem; color: #94a3b8; }

  /* Slideshow */
  #slideshow { display: none; position: fixed; inset: 0; background: #000; z-index: 100; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  #slide-img { width: 100%; height: 100%; object-fit: contain; transition: opacity 0.8s ease; }

  #slide-overlay {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 30px 40px 80px;
    background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
    display: ${cfg.overlay ? 'block' : 'none'};
    pointer-events: none;
  }
  #slide-album { font-size: 0.9rem; color: #a78bfa; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
  #slide-date { font-size: 1.2rem; color: #e2e8f0; margin-bottom: 4px; }
  #slide-location { font-size: 1rem; color: #94a3b8; }
  #slide-counter { position: absolute; top: 20px; right: 30px; color: rgba(255,255,255,0.5); font-size: 0.9rem; pointer-events: none; }

  #slide-progress {
    position: absolute; bottom: 0; left: 0;
    height: 3px; background: #a78bfa; transition: width linear;
  }

  /* Controls - auto-hide */
  #slide-controls {
    position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 8px; align-items: center;
    background: rgba(0,0,0,0.65); border-radius: 40px; padding: 10px 24px;
    transition: opacity 0.4s ease;
  }
  #slide-controls.hidden { opacity: 0; pointer-events: none; }
  #slide-controls button {
    background: none; border: none; color: #fff;
    font-size: 2rem; cursor: pointer; padding: 4px 20px;
    border-radius: 8px; transition: background 0.2s; line-height: 1;
  }
  #slide-controls button:hover { background: rgba(167,139,250,0.4); }

  #exit-btn {
    position: absolute; top: 20px; left: 30px;
    background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2);
    color: #fff; padding: 8px 20px; border-radius: 20px;
    cursor: pointer; font-size: 0.9rem; transition: opacity 0.4s ease;
  }
  #exit-btn.hidden { opacity: 0; pointer-events: none; }
  #exit-btn:hover { background: rgba(167,139,250,0.3); }

  #spinner {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 60px; height: 60px;
    border: 4px solid rgba(255,255,255,0.2);
    border-top-color: #a78bfa;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    display: none;
  }
  @keyframes spin { to { transform: translate(-50%, -50%) rotate(360deg); } }

  .loading {
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    background: #0a0a0f; z-index: 200; font-size: 1.2rem; color: #a78bfa; letter-spacing: 2px;
  }
</style>
</head>
<body>

<div id="header">
  <h1>ppontv</h1>
  <div id="clock"></div>
</div>

<div id="albums">${albumCards}</div>

<div id="slideshow" onclick="togglePause(event)">
  <img id="slide-img" src="" alt="" style="display:none">
  <video id="slide-video" muted playsinline
    style="display:none; width:100%; height:100%; object-fit:contain;"></video>
  <div id="slide-overlay">
    <div id="slide-album"></div>
    <div id="slide-date"></div>
    <div id="slide-location"></div>
  </div>
  <div id="slide-counter"></div>
  <div id="slide-progress"></div>
  <div id="spinner"></div>
  <div id="slide-controls" class="hidden">
    <button onclick="event.stopPropagation(); showPhoto(currentIdx - 1)">&#8249;</button>
    <button id="sound-btn" onclick="event.stopPropagation(); toggleSound()" style="font-size:1.4rem; padding: 4px 14px;">🔇</button>
    <button onclick="event.stopPropagation(); showPhoto(currentIdx + 1)">&#8250;</button>
  </div>
  <button id="exit-btn" class="hidden" onclick="event.stopPropagation(); exitSlideshow()">✕ Exit</button>
</div>

<div id="loading" class="loading" style="display:none">Loading album...</div>

<script>
const CFG = ${JSON.stringify(cfg)};

let photos = [], currentIdx = 0, slideshowTimer = null, albumTitle = '';
let paused = false, hideTimer = null, muted = true;

function toggleSound() {
  muted = !muted;
  document.getElementById('slide-video').muted = muted;
  document.getElementById('sound-btn').textContent = muted ? '🔇' : '🔊';
}

function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}
if (CFG.clock) { updateClock(); setInterval(updateClock, 1000); }

async function startSlideshow(albumUid, title) {
  albumTitle = title;
  document.getElementById('loading').style.display = 'flex';
  const res = await fetch('/api/album-photos/' + albumUid);
  photos = await res.json();
  document.getElementById('loading').style.display = 'none';
  if (!photos.length) { alert('No photos in this album'); return; }
  if (CFG.random) photos.sort(() => Math.random() - 0.5);
  paused = false;
  currentIdx = 0;
  document.getElementById('slideshow').style.display = 'block';
  showPhoto(0);
}

function showPhoto(idx) {
  if (!photos.length) return;
  currentIdx = (idx + photos.length) % photos.length;
  const photo = photos[currentIdx];
  const img = document.getElementById('slide-img');
  const vid = document.getElementById('slide-video');
  const isVideo = photo.Type === 'video';

  img.style.display = isVideo ? 'none' : 'block';
  vid.style.display = isVideo ? 'block' : 'none';

  if (isVideo) {
    // Show thumbnail while video loads
    img.style.display = 'block';
    img.style.opacity = 1;
    img.src = '/proxy/t/' + photo.Hash + '/fit_1920';
    vid.style.display = 'none';
    vid.src = '/proxy/video/' + photo.Hash;
    vid.muted = muted;
    document.getElementById('spinner').style.display = 'block';
    vid.oncanplay = () => {
      document.getElementById('spinner').style.display = 'none';
      img.style.display = 'none';
      vid.style.display = 'block';
      vid.style.opacity = 1;
      vid.play();
    };
    vid.onended = () => { if (!paused) showPhoto(currentIdx + 1); };
    clearTimeout(slideshowTimer);
  } else {
    document.getElementById('spinner').style.display = 'none';
    vid.pause(); vid.src = '';
    img.style.opacity = 0;
    img.onload = () => { img.style.opacity = 1; };
    img.src = '/proxy/t/' + photo.Hash + '/fit_1920';
    const bar = document.getElementById('slide-progress');
    bar.style.transition = 'none';
    bar.style.width = '0%';
    if (!paused) {
      setTimeout(() => {
        bar.style.transition = 'width ' + (CFG.interval / 1000) + 's linear';
        bar.style.width = '100%';
      }, 50);
    }
    clearTimeout(slideshowTimer);
    if (!paused) slideshowTimer = setTimeout(() => showPhoto(currentIdx + 1), CFG.interval);
  }

  document.getElementById('slide-album').textContent = albumTitle;
  document.getElementById('slide-counter').textContent = (currentIdx + 1) + ' / ' + photos.length;
  const takenAt = photo.TakenAt ? new Date(photo.TakenAt) : null;
  document.getElementById('slide-date').textContent = takenAt
    ? takenAt.toLocaleDateString([], {year:'numeric', month:'long', day:'numeric'}) : '';
  const loc = [photo.PhotoCity, photo.PhotoCountry].filter(Boolean).join(', ');
  document.getElementById('slide-location').textContent = loc;
}

function togglePause(e) {
  paused = !paused;
  showControls();
  if (paused) {
    clearTimeout(slideshowTimer);
    const bar = document.getElementById('slide-progress');
    bar.style.transition = 'none';
    bar.style.width = '0%';
  } else {
    showPhoto(currentIdx);
  }
}

function showControls() {
  document.getElementById('slide-controls').classList.remove('hidden');
  document.getElementById('exit-btn').classList.remove('hidden');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    document.getElementById('slide-controls').classList.add('hidden');
    document.getElementById('exit-btn').classList.add('hidden');
  }, 3000);
}

function exitSlideshow() {
  clearTimeout(slideshowTimer);
  clearTimeout(hideTimer);
  paused = false;
  document.getElementById('slideshow').style.display = 'none';
  document.getElementById('slide-img').src = '';
  const vid = document.getElementById('slide-video');
  vid.pause(); vid.src = '';
}

// Show controls on mouse move
document.getElementById('slideshow').addEventListener('mousemove', showControls);

document.addEventListener('keydown', e => {
  const ss = document.getElementById('slideshow');
  if (ss.style.display === 'block') {
    if (e.key === 'ArrowRight') { showPhoto(currentIdx + 1); showControls(); }
    if (e.key === 'ArrowLeft') { showPhoto(currentIdx - 1); showControls(); }
    if (e.key === 'Escape' || e.key === 'Backspace') exitSlideshow();
    if (e.key === 'Enter' || e.key === ' ') togglePause(e);
  }
});
</script>
</body>
</html>`;
}

// HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  config = loadConfig();

  if (pathname === '/favicon.ico' || pathname === '/favicon.svg') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0a0a0f"/><rect x="4" y="8" width="24" height="14" rx="2" fill="#a78bfa"/><rect x="6" y="10" width="20" height="10" rx="1" fill="#0a0a0f"/><rect x="12" y="22" width="8" height="2" fill="#a78bfa"/><rect x="10" y="24" width="12" height="1.5" rx="1" fill="#a78bfa"/><polygon points="13,13 13,17 19,15" fill="#a78bfa"/></svg>';
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
    res.end(svg);
    return;
  }

  if (pathname === '/') {
    try {
      await ensureSession();
      const albums = await getAlbums();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(albumsPage(albums));
    } catch (e) {
      res.writeHead(500);
      res.end('Error connecting to PhotoPrism: ' + e.message);
    }
    return;
  }

  if (pathname.startsWith('/api/album-photos/')) {
    const uid = pathname.split('/').pop();
    try {
      const photos = await getAlbumPhotos(uid);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(photos));
    } catch (e) { res.writeHead(500); res.end('[]'); }
    return;
  }

  // Video proxy: /proxy/video/<hash>
  if (pathname.startsWith('/proxy/video/')) {
    try {
      await ensureSession();
      const hash = pathname.split('/')[3];
      const ppPath = `/api/v1/videos/${hash}/${previewToken}/avc`;
      const baseUrl = new URL(config.PHOTOPRISM_URL);
      const isHttps = baseUrl.protocol === 'https:';
      const options = {
        hostname: baseUrl.hostname,
        port: baseUrl.port || (isHttps ? 443 : 80),
        path: ppPath, method: 'GET',
        headers: { 'X-Auth-Token': sessionToken },
      };
      const ppReq = (isHttps ? https : http).request(options, ppRes => {
        res.writeHead(ppRes.statusCode, {
          'Content-Type': ppRes.headers['content-type'] || 'video/mp4',
          'Cache-Control': 'public, max-age=86400',
        });
        ppRes.pipe(res);
      });
      ppReq.on('error', () => { res.writeHead(502); res.end(); });
      ppReq.end();
    } catch (e) { res.writeHead(500); res.end(); }
    return;
  }

  if (pathname.startsWith('/proxy/t/')) {
    try {
      await ensureSession();
      const parts = pathname.split('/');
      const hash = parts[3];
      const size = parts[4];
      const ppPath = `/api/v1/t/${hash}/${previewToken}/${size}`;
      const baseUrl = new URL(config.PHOTOPRISM_URL);
      const isHttps = baseUrl.protocol === 'https:';
      const options = {
        hostname: baseUrl.hostname,
        port: baseUrl.port || (isHttps ? 443 : 80),
        path: ppPath, method: 'GET',
        headers: { 'X-Auth-Token': sessionToken },
      };
      const ppReq = (isHttps ? https : http).request(options, ppRes => {
        res.writeHead(ppRes.statusCode, {
          'Content-Type': ppRes.headers['content-type'] || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
        });
        ppRes.pipe(res);
      });
      ppReq.on('error', () => { res.writeHead(502); res.end(); });
      ppReq.end();
    } catch (e) { res.writeHead(500); res.end(); }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const PORT = parseInt(config.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`ppontv running on http://0.0.0.0:${PORT}`);
});
