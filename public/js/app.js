// =======================
// 1) Globals & helpers
// =======================
let likedSet = new Set();
let watchedSet = new Set();       // titleIds שנצפו ע"י הפרופיל
let allTitles = [];               // כל הכותרים (נטען פעם אחת)
const ONE_HOUR = 60 * 60 * 1000;

// לייקים
async function getLikes() {
  try {
    const r = await fetch('/api/likes', { credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) likedSet = new Set((await r.json()).likes || []);
  } catch {}
}
// נצפו
async function getWatched() {
  try {
    const r = await fetch('/api/watch', { credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) watchedSet = new Set(((await r.json()).items || []).map(it => String(it.titleId)));
  } catch {}
}
// הבאת כל הכותרים (לפי שרת; אם תרצה, אפשר להוסיף ?limit=500)
async function fetchAllTitles() {
  const r = await fetch('/api/titles', { credentials: 'same-origin', cache: 'no-store' });
  const data = await r.json();
  allTitles = Array.isArray(data.titles) ? data.titles : [];
}

// כרטיס אריח אחיד
function cardTile(t, opts = {}) {
  const id = t._id;
  const liked = likedSet.has(String(id));
  const resumeSec = opts.resumeSec || 0;
  const progress = opts.durationSec
    ? Math.min(100, Math.round((resumeSec / opts.durationSec) * 100))
    : (resumeSec ? 40 : 0);
  const poster = t.posterPath || '/img/placeholder.jpg';

  return `
    <div class="card-tile" data-id="${id}">
      <img src="${poster}" alt="${t.name}">
      <div class="d-flex justify-content-between align-items-center mt-2">
        <div class="title text-truncate" title="${t.name}">${t.name}</div>
        <button class="btn btn-sm btn-like like-btn" data-id="${id}" aria-pressed="${liked}">
          ${liked ? '♥' : '♡'}
        </button>
      </div>
      ${resumeSec > 0 ? `
        <button class="btn btn-primary btn-sm mt-2 resume-btn" data-id="${id}" data-pos="${resumeSec}">המשך</button>
        <div class="progress-xs mt-2"><div style="width:${progress}%"></div></div>
      ` : ''}
    </div>
  `;
}
function playTitle(id, startAt = 0) {
  const t = startAt ? `&t=${Math.floor(startAt)}` : '';
  location.href = `/watch.html?id=${encodeURIComponent(id)}${t}`;
}
function slugify(str) {
  return String(str || '').toLowerCase().replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-\u0590-\u05FF]/g, '').slice(0, 40);
}
const isNew = (t) => {
  const ts = new Date(t.createdAt).getTime();
  return Number.isFinite(ts) && (Date.now() - ts) <= ONE_HOUR;
};

// =======================
// 2) Shelves (recent/reco/popular/newest/genre-shelves)
// =======================
async function loadRecent() {
  const row = document.getElementById('rowRecent'); if (!row) return;
  try {
    const r = await fetch('/api/recent', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) { row.innerHTML = ''; return; }
    const { items } = await r.json();
    row.innerHTML = (items || []).map(it => cardTile(it.title, { resumeSec: it.positionSec || 0 })).join('');
    wireRowClicks(row);
  } catch { row.innerHTML = ''; }
}
async function loadRecommendations() {
  const row = document.getElementById('rowReco'); if (!row) return;
  try {
    const r = await fetch('/api/recommendations', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) { row.innerHTML = ''; return; }
    const { titles } = await r.json();
    row.innerHTML = (titles || []).map(t => cardTile(t)).join('');
    wireRowClicks(row);
  } catch { row.innerHTML = ''; }
}
async function loadPopular() {
  const row = document.getElementById('rowPopular'); if (!row) return;
  try {
    const r = await fetch('/api/popular', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) { row.innerHTML = ''; return; }
    const { items } = await r.json();
    row.innerHTML = (items || []).map(it => `
      <div class="position-relative">
        ${cardTile(it.title)}
        <span class="badge bg-danger position-absolute top-0 start-0 m-1" title="צפיות">${it.views}</span>
      </div>
    `).join('');
    wireRowClicks(row);
  } catch { row.innerHTML = ''; }
}
// “חדש” — מהשעה האחרונה מתוך allTitles
function renderNewest() {
  const row = document.getElementById('rowNewest'); if (!row) return;
  const newest = allTitles.filter(isNew)
    .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);
  row.innerHTML = newest.map(t => cardTile(t)).join('') || '<div class="text-muted">אין תכנים חדשים כרגע</div>';
  wireRowClicks(row);
}
// “מדפים לפי ז׳אנר” — רק תכנים בני יותר משעה
function renderGenreShelves() {
  const host = document.getElementById('genreShelves'); if (!host) return;
  const older = allTitles.filter(t => !isNew(t));
  const byGenre = new Map();
  for (const t of older) {
    for (const g of (t.genres || [])) {
      if (!g) continue;
      const key = String(g).trim();
      if (!byGenre.has(key)) byGenre.set(key, []);
      byGenre.get(key).push(t);
    }
  }
  const sections = [];
  for (const [g, list] of byGenre.entries()) {
    const top = list.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0, 15);
    const tiles = top.map(t => cardTile(t)).join('');
    sections.push(`
      <section class="mt-3">
        <h3 class="h6 text-white mb-2">${g}</h3>
        <div id="row-genre-${slugify(g)}" class="d-flex gap-3 overflow-auto py-2">${tiles}</div>
      </section>
    `);
  }
  host.innerHTML = sections.join('') || '<div class="text-muted">אין תכנים להצגה לפי ז׳אנר</div>';
  wireRowClicks(host);
}
function wireRowClicks(scope) {
  scope.querySelectorAll('.like-btn').forEach(btn => btn.onclick = () => toggleLike(btn));
  scope.querySelectorAll('.card-tile img').forEach(img => {
    img.style.cursor = 'pointer';
    img.onclick = () => {
      const id = img.closest('.card-tile')?.getAttribute('data-id');
      if (id) playTitle(id, 0);
    };
  });
  scope.querySelectorAll('.resume-btn').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id, pos = btn.dataset.pos || 0;
      location.href = `/watch.html?id=${encodeURIComponent(id)}&t=${encodeURIComponent(pos)}`;
    };
  });
}

// =======================
// 3) Grid (client-side filters)
// =======================
function filtersActive() {
  const q = (document.getElementById('q')?.value || '').trim();
  const genre = (document.getElementById('genre')?.value || '').trim();
  const watched = (document.getElementById('watched')?.value || 'all').trim();
  return !!(q || genre || (watched && watched !== 'all'));
}
function toggleSectionsForFilters(active) {
  ['rowRecent','rowReco','rowPopular','rowNewest','genreShelves'].forEach(id => {
    const el = document.getElementById(id)?.closest('section') || document.getElementById(id);
    if (el) el.style.display = active ? 'none' : '';
  });
}
function applyClientFilters(source) {
  const q = (document.getElementById('q')?.value || '').trim().toLowerCase();
  const genreKey = (document.getElementById('genre')?.value || '').trim().toLowerCase();
  const watched = (document.getElementById('watched')?.value || 'all');

  let arr = [...source];
  if (q) {
    arr = arr.filter(t =>
      String(t.name||'').toLowerCase().includes(q) ||
      String(t.description||'').toLowerCase().includes(q)
    );
  }
  if (genreKey) {
    arr = arr.filter(t => (t.genres||[]).some(g => String(g).trim().toLowerCase() === genreKey));
  }
  if (watched === 'yes') {
    arr = arr.filter(t => watchedSet.has(String(t._id)));
  } else if (watched === 'no') {
    arr = arr.filter(t => !watchedSet.has(String(t._id)));
  }
  return arr;
}
function renderGrid() {
  const cards = document.getElementById('cards');
  const list = applyClientFilters(allTitles);
  cards.innerHTML = list.map(t => `
    <div class="col-6 col-md-4 col-lg-3">${cardTile(t)}</div>
  `).join('') || '<div class="text-muted">לא נמצאו תוצאות</div>';
  wireRowClicks(cards);
  toggleSectionsForFilters(filtersActive());
  if (filtersActive()) cards.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// =======================
// 4) Auth + genres dropdown + likes + init
// =======================
async function populateGenresDropdown() {
  const sel = document.getElementById('genre'); if (!sel) return;
  try {
    // מנסה מהשרת
    const r = await fetch('/api/genres', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) throw new Error();
    const { genres } = await r.json();
    const seen = new Set();
    const normalized = [];
    for (const g of (genres||[])) {
      const key = String(g).trim().toLowerCase();
      if (key && !seen.has(key)) { seen.add(key); normalized.push({key, label:String(g).trim()}); }
    }
    normalized.sort((a,b)=>a.label.localeCompare(b.label,'he'));
    sel.innerHTML = '<option value="">כל הז׳אנרים</option>' +
      normalized.map(({key,label}) => `<option value="${key}">${label}</option>`).join('');
  } catch {
    // fallback: מתוך allTitles
    const seen = new Map();
    for (const t of allTitles) {
      for (const g of (t.genres||[])) {
        const key = String(g).trim().toLowerCase();
        if (key && !seen.has(key)) seen.set(key, String(g).trim());
      }
    }
    const arr = [...seen.entries()].sort((a,b)=>a[1].localeCompare(b[1],'he'));
    sel.innerHTML = '<option value="">כל הז׳אנרים</option>' +
      arr.map(([key,label]) => `<option value="${key}">${label}</option>`).join('');
  }
}
async function toggleLike(btn) {
  const id = btn.getAttribute('data-id');
  const liked = btn.getAttribute('aria-pressed') === 'true';
  try {
    const r = await fetch('/api/likes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ titleId: id, like: !liked })
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Like failed');
    if (liked) {
      likedSet.delete(String(id)); btn.setAttribute('aria-pressed','false'); btn.textContent = '♡';
    } else {
      likedSet.add(String(id));    btn.setAttribute('aria-pressed','true');  btn.textContent = '♥';
    }
    loadRecommendations(); // כי המלצות תלויות לייקים
  } catch(e){ alert(e.message); }
}
async function getMe() {
  const r = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
  const data = await r.json();
  const nav = document.getElementById('authLinks');
  if (!data.user) { location.href = '/'; return null; }
  const prof = data.selectedProfile ? `👤 ${data.selectedProfile.name}` : 'בחר/י פרופיל';
  nav.innerHTML =
    '<li class="nav-item"><a class="nav-link" href="/profiles">' + prof + '</a></li>' +
    '<li class="nav-item"><a class="nav-link" href="/admin.html">אדמין</a></li>' +
    '<li class="nav-item"><a class="nav-link" href="#" id="logout">יציאה</a></li>';
  document.getElementById('logout').onclick = async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    location.href = '/';
  };
  if (!data.selectedProfile) { location.href = '/profiles'; return null; }
  return data.user;
}

// Bind events
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('searchForm')?.addEventListener('submit', (e) => { e.preventDefault(); renderGrid(); });
  document.getElementById('genre')  ?.addEventListener('change', () => renderGrid());
  document.getElementById('watched')?.addEventListener('change', () => renderGrid());

  (async () => {
    if (!await getMe()) return;
    await Promise.all([getLikes(), getWatched(), fetchAllTitles()]);
    await populateGenresDropdown();
    // Shelves:
    loadRecent();
    loadRecommendations();
    loadPopular();
    renderNewest();
    renderGenreShelves();
    // Grid:
    renderGrid();
  })();
});
