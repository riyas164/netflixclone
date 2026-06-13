/* ─── State ──────────────────────────────────────────────────────────────────── */
const API = 'http://localhost:5000/api';
let token       = localStorage.getItem('sf_token') || null;
let currentUser = JSON.parse(localStorage.getItem('sf_user') || 'null');
let allMovies   = [];
let watchlistIds = new Set();
let currentFeatured = null;
let activeGenre = 'All';
let playerTimer = null;

/* ─── Init ───────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (token && currentUser) {
    showApp();
  } else {
    showAuthOverlay();
  }
  window.addEventListener('scroll', handleNavScroll);
});

function handleNavScroll() {
  const navbar = document.getElementById('navbar');
  navbar.classList.toggle('scrolled', window.scrollY > 20);
}

/* ─── Auth ───────────────────────────────────────────────────────────────────── */
function showAuthOverlay() {
  document.getElementById('auth-overlay').style.display = 'flex';
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');
  applyUserInfo();
  loadHome();
  loadGenreFilters();
}

function applyUserInfo() {
  if (!currentUser) return;
  document.getElementById('user-avatar').textContent = currentUser.name[0].toUpperCase();
  document.getElementById('dropdown-name').textContent = currentUser.name;
  document.getElementById('dropdown-plan').textContent = capitalize(currentUser.plan) + ' Plan';
}

function switchToRegister() {
  document.getElementById('login-form').classList.remove('active');
  document.getElementById('register-form').classList.add('active');
}
function switchToLogin() {
  document.getElementById('register-form').classList.remove('active');
  document.getElementById('login-form').classList.add('active');
}

async function handleLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; return; }
  try {
    const data = await post('/login', { email, password });
    if (data.error) { errEl.textContent = data.error; return; }
    saveSession(data);
    showApp();
  } catch { errEl.textContent = 'Server error. Is the backend running?'; }
}

async function handleRegister() {
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('reg-error');
  errEl.textContent = '';
  if (!name || !email || !password) { errEl.textContent = 'Please fill in all fields.'; return; }
  try {
    const data = await post('/register', { name, email, password });
    if (data.error) { errEl.textContent = data.error; return; }
    saveSession(data);
    showApp();
  } catch { errEl.textContent = 'Server error. Is the backend running?'; }
}

async function demoLogin() {
  // Auto-create demo account
  try {
    let data = await post('/login', { email: 'demo@streamflix.com', password: 'demo1234' });
    if (data.error) {
      data = await post('/register', { name: 'Demo User', email: 'demo@streamflix.com', password: 'demo1234' });
    }
    if (data.token) { saveSession(data); showApp(); }
  } catch { showToast('Could not reach server.'); }
}

function saveSession(data) {
  token = data.token;
  currentUser = data.user;
  localStorage.setItem('sf_token', token);
  localStorage.setItem('sf_user', JSON.stringify(currentUser));
}

async function handleLogout() {
  try { await authPost('/logout', {}); } catch {}
  token = null; currentUser = null;
  localStorage.removeItem('sf_token');
  localStorage.removeItem('sf_user');
  showAuthOverlay();
}

/* ─── Navigation ─────────────────────────────────────────────────────────────── */
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + name)?.classList.add('active');
  document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
  const map = { home: 0, browse: 1, watchlist: 2 };
  const idx = map[name];
  if (idx !== undefined) document.querySelectorAll('.nav-links li')[idx]?.classList.add('active');
  if (name === 'home')      loadHome();
  if (name === 'browse')    loadBrowse();
  if (name === 'watchlist') loadWatchlist();
  if (name === 'history')   loadHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─── Home ───────────────────────────────────────────────────────────────────── */
async function loadHome() {
  allMovies = await getJSON('/movies');
  await loadWatchlistIds();
  loadFeatured();
  renderRow('row-trending', allMovies.slice(0, 8));
  renderRow('row-top', [...allMovies].sort((a,b) => b.rating - a.rating).slice(0, 8));
  loadHistoryRow();
}

async function loadFeatured() {
  const featured = await getJSON('/movies/featured');
  if (!featured.length) return;
  const m = featured[Math.floor(Math.random() * featured.length)];
  currentFeatured = m;
  const hero = document.getElementById('hero-banner');
  hero.style.backgroundImage = `url('${m.banner}')`;
  document.getElementById('hero-title').textContent = m.title;
  document.getElementById('hero-desc').textContent = m.description;
  document.getElementById('hero-meta').innerHTML =
    `<span class="rating">★ ${m.rating}</span><span>${m.release_year}</span><span>${m.duration}</span><span>${m.genre}</span>`;
}

async function loadHistoryRow() {
  try {
    const hist = await authGet('/history');
    const container = document.getElementById('row-history');
    const section = container.closest('.row-section');
    if (!hist.length) { section.style.display = 'none'; return; }
    section.style.display = '';
    renderRow('row-history', hist);
  } catch {}
}

/* ─── Browse ─────────────────────────────────────────────────────────────────── */
async function loadBrowse(genre) {
  if (genre) activeGenre = genre;
  // Update genre button states
  document.querySelectorAll('.genre-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.genre === activeGenre);
  });
  let movies = genre && genre !== 'All'
    ? await getJSON(`/movies?genre=${encodeURIComponent(genre)}`)
    : await getJSON('/movies');
  renderGrid('browse-grid', movies);
}

async function loadGenreFilters() {
  const movies = await getJSON('/movies');
  const genres = ['All', ...new Set(movies.flatMap(m => m.genre.split('/').map(g => g.trim())))];
  const container = document.getElementById('genre-filters');
  container.innerHTML = genres.map(g =>
    `<button class="genre-btn ${g === activeGenre ? 'active' : ''}" data-genre="${g}" onclick="loadBrowse('${g}')">${g}</button>`
  ).join('');
}

/* ─── Watchlist ──────────────────────────────────────────────────────────────── */
async function loadWatchlistIds() {
  try {
    const wl = await authGet('/watchlist');
    watchlistIds = new Set(wl.map(m => m.id));
  } catch { watchlistIds = new Set(); }
}

async function loadWatchlist() {
  try {
    const movies = await authGet('/watchlist');
    const empty  = document.getElementById('watchlist-empty');
    if (!movies.length) {
      document.getElementById('watchlist-grid').innerHTML = '';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      renderGrid('watchlist-grid', movies);
    }
  } catch {}
}

async function toggleWatchlist(movieId, event) {
  event?.stopPropagation();
  try {
    if (watchlistIds.has(movieId)) {
      await authDelete(`/watchlist/${movieId}`);
      watchlistIds.delete(movieId);
      showToast('Removed from My List');
    } else {
      await authPost(`/watchlist/${movieId}`, {});
      watchlistIds.add(movieId);
      showToast('Added to My List');
    }
    refreshWLButtons(movieId);
  } catch { showToast('Error updating list'); }
}

function refreshWLButtons(movieId) {
  document.querySelectorAll(`.wl-btn[data-id="${movieId}"]`).forEach(btn => {
    btn.textContent = watchlistIds.has(movieId) ? '✓' : '+';
    btn.title = watchlistIds.has(movieId) ? 'Remove from list' : 'Add to list';
  });
  // Also refresh modal button if open
  const modalWl = document.getElementById('modal-wl');
  if (modalWl && parseInt(modalWl.dataset.id) === movieId) {
    modalWl.textContent = watchlistIds.has(movieId) ? '✓ In My List' : '+ My List';
    modalWl.classList.toggle('added', watchlistIds.has(movieId));
  }
}

/* ─── History ─────────────────────────────────────────────────────────────────── */
async function loadHistory() {
  try {
    const movies = await authGet('/history');
    const empty  = document.getElementById('history-empty');
    if (!movies.length) {
      document.getElementById('history-grid').innerHTML = '';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      renderGrid('history-grid', movies);
    }
  } catch {}
}

/* ─── Render ─────────────────────────────────────────────────────────────────── */
function renderRow(containerId, movies) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = movies.map(m => cardHTML(m)).join('');
}

function renderGrid(containerId, movies) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = movies.map(m => cardHTML(m)).join('');
}

function cardHTML(m) {
  const inWL = watchlistIds.has(m.id);
  return `
  <div class="movie-card" onclick="openModal(${JSON.stringify(m).replace(/"/g,'&quot;')})">
    <img class="card-thumb" src="${m.thumbnail}" alt="${m.title}" loading="lazy"
         onerror="this.src='https://picsum.photos/seed/${m.id}/400/225'" />
    <div class="card-body">
      <div class="card-title">${m.title}</div>
      <div class="card-meta">
        <span class="card-rating">★ ${m.rating}</span>
        <span>${m.release_year}</span>
        <span>${m.duration}</span>
      </div>
    </div>
    <div class="card-overlay">
      <div class="card-overlay-btns">
        <button onclick="event.stopPropagation();playMovie(${JSON.stringify(m).replace(/"/g,'&quot;')})" title="Play">▶</button>
        <button class="wl-btn" data-id="${m.id}"
          onclick="event.stopPropagation();toggleWatchlist(${m.id},event)"
          title="${inWL ? 'Remove from list' : 'Add to list'}">${inWL ? '✓' : '+'}</button>
      </div>
    </div>
  </div>`;
}

/* ─── Modal ──────────────────────────────────────────────────────────────────── */
let currentModalMovie = null;

function openModal(m) {
  if (!m) return;
  currentModalMovie = m;
  const inWL = watchlistIds.has(m.id);
  document.getElementById('modal-banner').style.backgroundImage = `url('${m.banner}')`;
  document.getElementById('modal-title').textContent = m.title;
  document.getElementById('modal-meta').innerHTML =
    `<span class="rating">★ ${m.rating}</span><span>${m.release_year}</span><span>${m.duration}</span>`;
  document.getElementById('modal-desc').textContent = m.description;
  document.getElementById('modal-tags').innerHTML =
    m.genre.split('/').map(g => `<span>${g.trim()}</span>`).join('');

  const playBtn = document.getElementById('modal-play');
  playBtn.onclick = () => { closeModal(); playMovie(m); };

  const wlBtn = document.getElementById('modal-wl');
  wlBtn.dataset.id = m.id;
  wlBtn.textContent = inWL ? '✓ In My List' : '+ My List';
  wlBtn.classList.toggle('added', inWL);
  wlBtn.onclick = () => toggleWatchlist(m.id);

  document.getElementById('movie-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('movie-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('movie-modal')) closeModal();
}

/* ─── Player ─────────────────────────────────────────────────────────────────── */
let playerPlaying = true;
let playerProgress = 0;

async function playMovie(m) {
  if (!m) return;
  document.getElementById('player-title').textContent = m.title;
  document.getElementById('player-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  playerPlaying = true;
  playerProgress = 0;
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('ctrl-time').textContent = `0:00 / ${m.duration || '50:00'}`;
  startProgressTimer();

  // Log to history
  try { await authPost(`/history/${m.id}`, { progress: 0 }); } catch {}
}

function closePlayer() {
  document.getElementById('player-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  clearInterval(playerTimer);
  playerPlaying = false;
}

function togglePlay() {
  playerPlaying = !playerPlaying;
  const btn = document.querySelector('.ctrl-btns button:first-child');
  btn.textContent = playerPlaying ? '⏸' : '▶';
  if (playerPlaying) startProgressTimer();
  else clearInterval(playerTimer);
}

function startProgressTimer() {
  clearInterval(playerTimer);
  playerTimer = setInterval(() => {
    if (!playerPlaying) return;
    playerProgress = Math.min(playerProgress + 0.5, 100);
    document.getElementById('progress-fill').style.width = playerProgress + '%';
    const mins = Math.floor(playerProgress / 100 * 50);
    const secs = Math.floor((playerProgress / 100 * 3000) % 60);
    document.getElementById('ctrl-time').textContent =
      `${mins}:${secs.toString().padStart(2,'0')} / 50:00`;
    if (playerProgress >= 100) clearInterval(playerTimer);
  }, 300);
}

/* ─── Search ─────────────────────────────────────────────────────────────────── */
let searchTimeout = null;
function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(doSearch, 350);
}

async function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  const movies = await getJSON(`/movies?search=${encodeURIComponent(q)}`);
  showSection('browse');
  renderGrid('browse-grid', movies);
  document.querySelector('.browse-header h2').textContent =
    `Results for "${q}" (${movies.length})`;
}

/* ─── HTTP helpers ───────────────────────────────────────────────────────────── */
async function getJSON(path) {
  const r = await fetch(API + path);
  return r.json();
}

async function post(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function authGet(path) {
  const r = await fetch(API + path, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return r.json();
}

async function authPost(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function authDelete(path) {
  const r = await fetch(API + path, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return r.json();
}

/* ─── Toast ──────────────────────────────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2500);
}

/* ─── Util ───────────────────────────────────────────────────────────────────── */
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
