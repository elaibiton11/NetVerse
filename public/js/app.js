// =======================
// 1) Globals & helpers
// =======================
let likedSet = new Set();
let watchedSet = new Set();       // titleIds שנצפו ע"י הפרופיל
let allTitles = [];               // כל הכותרים (נטען פעם אחת)
const ONE_HOUR = 60 * 60 * 1000;

// Escape לנתונים שנכנסים ל-HTML attributes
function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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

// הבאת כל הכותרים
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

  const year = t.year || '';
  const desc = t.description || '';

  return `
    <div class="card-tile" data-id="${id}">
      <img src="${poster}" alt="${escapeAttr(t.name)}">
      <div class="d-flex justify-content-between align-items-center mt-2">
        <div class="title text-truncate" title="${escapeAttr(t.name)}">${t.name}</div>
        <div class="d-flex align-items-center gap-1">
          <button
            type="button"
            class="btn btn-sm btn-like info-btn"
            data-id="${id}"
            data-title="${escapeAttr(t.name)}"
            data-year="${escapeAttr(year)}"
            data-desc="${escapeAttr(desc)}"
          >
            i
          </button>
          <button class="btn btn-sm btn-like like-btn" data-id="${id}" aria-pressed="${liked}">
            ${liked ? '♥' : '♡'}
          </button>
        </div>
      </div>
      ${
        resumeSec > 0
          ? `
        <button class="btn btn-primary btn-sm mt-2 resume-btn" data-id="${id}" data-pos="${resumeSec}">המשך</button>
        <div class="progress-xs mt-2"><div style="width:${progress}%"></div></div>
      `
          : ''
      }
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

// נצפו לאחרונה – כרטיס אחד לכל סדרה/סרט (כמו נטפליקס)
async function loadRecent() {
  const row = document.getElementById('rowRecent'); if (!row) return;
  try {
    const r = await fetch('/api/recent', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) { row.innerHTML = ''; return; }
    const { items } = await r.json(); // ממויין מהחדש לישן

    const byKey = new Map(); // key -> { seriesId?, items: [] }

    for (const it of (items || [])) {
      const t = it.title;
      if (!t) continue;
      const hasSeries = t.seriesId && String(t.seriesId).trim() !== '';
      const key = hasSeries ? 'series:' + String(t.seriesId).trim()
                            : 'movie:'  + String(t._id);
      if (!byKey.has(key)) byKey.set(key, { seriesId: hasSeries ? String(t.seriesId).trim() : null, items: [] });
      byKey.get(key).items.push(it);
    }

    const tiles = [];

    for (const { seriesId, items: list } of byKey.values()) {
      // הפריט האחרון שנצפה (הראשון ברשימה – כי ממויין מהשרת)
      const lastItem = list[0];
      const lastTitle = lastItem.title;
      const resumeSec = lastItem.positionSec || 0;

      let displayTitle = lastTitle;

      if (seriesId) {
        // מוצאים את פרק 1 של אותה סדרה מתוך allTitles (אם קיים)
        const sameSeries = allTitles.filter(t => String(t.seriesId || '').trim() === seriesId);
        const firstEpisode = sameSeries
          .slice()
          .sort((a,b) => (a.episodeIndex ?? 999) - (b.episodeIndex ?? 999))[0];

        if (firstEpisode) {
          // מציגים כמו פרק 1, אבל ה-id הוא של הפרק האחרון שצפינו בו
          displayTitle = {
            ...firstEpisode,
            _id: lastTitle._id
          };
        }
      }

      tiles.push(cardTile(displayTitle, { resumeSec }));
    }

    row.innerHTML = tiles.join('') || '<div class="text-muted">אין צפיות אחרונות</div>';
    wireRowClicks(row);
  } catch {
    row.innerHTML = '';
  }
}

async function loadRecommendations() {
  const row = document.getElementById('rowReco'); if (!row) return;
  try {
    const r = await fetch('/api/recommendations', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) { row.innerHTML = ''; return; }
    const { titles } = await r.json();
    const grouped = groupSeries(titles || []);
    row.innerHTML = grouped.map(t => cardTile(t)).join('');
    wireRowClicks(row);
  } catch { row.innerHTML = ''; }
}

async function loadPopular() {
  const row = document.getElementById('rowPopular'); if (!row) return;
  try {
    const r = await fetch('/api/popular', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) { row.innerHTML = ''; return; }
    const { items } = await r.json();

    // מאחד פרקים של אותה סדרה לפריט אחד וסוכם צפיות
    const byKey = new Map(); // key -> { title, views }
    for (const it of (items || [])) {
      const t = it.title;
      if (!t) continue;
      const key = (t.seriesId && String(t.seriesId).trim()) || String(t._id);
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, { title: t, views: it.views || 0 });
      } else {
        prev.views += it.views || 0;
      }
    }

    const merged = Array.from(byKey.values());
    row.innerHTML = merged.map(it => `
      <div class="position-relative">
        ${cardTile(it.title)}
      </div>
    `).join('');
    wireRowClicks(row);
  } catch { row.innerHTML = ''; }
}

// “חדש” — שעה אחרונה, עם קיבוץ סדרות
function renderNewest() {
  const row = document.getElementById('rowNewest'); if (!row) return;
  const newest = allTitles
    .filter(isNew)
    .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);

  const grouped = groupSeries(newest);
  row.innerHTML =
    grouped.map(t => cardTile(t)).join('') ||
    '<div class="text-muted">אין תכנים חדשים כרגע</div>';
  wireRowClicks(row);
}

// “מדפים לפי ז׳אנר” — רק תכנים בני יותר משעה, עם קיבוץ סדרות
function renderGenreShelves() {
  const host = document.getElementById('genreShelves'); if (!host) return;
  const older = allTitles.filter(t => !isNew(t));

  const groupedTitles = groupSeries(older);

  const byGenre = new Map();
  for (const t of groupedTitles) {
    for (const g of (t.genres || [])) {
      if (!g) continue;
      const key = String(g).trim();
      if (!byGenre.has(key)) byGenre.set(key, []);
      byGenre.get(key).push(t);
    }
  }

  const sections = [];
  for (const [g, list] of byGenre.entries()) {
    const top = list
      .slice()
      .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
      .slice(0, 15);
    const tiles = top.map(t => cardTile(t)).join('');
    sections.push(`
      <section class="mt-3">
        <h3 class="h6 text-white mb-2">${g}</h3>
        <div id="row-genre-${slugify(g)}" class="d-flex gap-3 overflow-auto py-2">${tiles}</div>
      </section>
    `);
  }
  host.innerHTML =
    sections.join('') ||
    '<div class="text-muted">אין תכנים להצגה לפי ז׳אנר</div>';
  wireRowClicks(host);
}

// =======================
// 3) Grouping series + grid
// =======================

// מאחד פרקים של אותה סדרה לכרטיס אחד
function groupSeries(arr) {
  const isSeriesTitle = (t) => {
    const kind = String(t.kind || '').toLowerCase();
    const hasSeriesId = t.seriesId && String(t.seriesId).trim() !== '';
    return kind === 'series' || hasSeriesId;
  };

  const movies = [];
  const series = [];

  for (const t of arr || []) {
    if (isSeriesTitle(t)) series.push(t);
    else movies.push(t);
  }

  // קיבוץ פרקים לפי seriesId (או לפי שם אם חסר)
  const grouped = new Map();
  for (const t of series) {
    const key =
      (t.seriesId && String(t.seriesId).trim()) ||
      slugify(String(t.name || ''));
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(t);
  }

  const normalizeName = (name) =>
    String(name || '')
      .toLowerCase()
      .replace(/פרק\s*\d+/g, '')
      .replace(/episode\s*\d+/gi, '')
      .trim();

  const seriesSingles = [];
  for (const [key, list] of grouped.entries()) {
    const sorted = list.slice().sort((a, b) =>
      (a.episodeIndex ?? 999) - (b.episodeIndex ?? 999)
    );
    const first = { ...sorted[0] };
    const baseName = normalizeName(first.name);
    if (baseName) first.name = baseName;
    seriesSingles.push(first);
  }

  // להסתיר סרטים "יתומים" שיש להם אותו שם כמו סדרה
  const seriesNameSet = new Set(seriesSingles.map(s => normalizeName(s.name)));
  const filteredMovies = movies.filter(m => {
    const nm = normalizeName(m.name);
    return !seriesNameSet.has(nm);
  });

  return [...filteredMovies, ...seriesSingles];
}

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

  let arr = [...(source || [])];

  if (q) {
    arr = arr.filter(t =>
      String(t.name||'').toLowerCase().includes(q) ||
      String(t.description||'').toLowerCase().includes(q)
    );
  }
  if (genreKey) {
    arr = arr.filter(t =>
      (t.genres||[]).some(g => String(g).trim().toLowerCase() === genreKey)
    );
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
  if (!cards) return;

  const active = filtersActive(); // יש חיפוש / ז'אנר / נצפה?

  // אם אין שום פילטר – לא מציגים גריד בכלל
  if (!active) {
    cards.innerHTML = '';
    cards.style.display = 'none';
    toggleSectionsForFilters(false); // משאיר את המדפים העליונים גלויים
    return;
  }

  // יש פילטר → מציגים גריד עם תוצאות
  cards.style.display = '';

  const grouped = groupSeries(allTitles);
  const list = applyClientFilters(grouped);

  cards.innerHTML = list.map(t => `
    <div class="col-6 col-md-4 col-lg-3">${cardTile(t)}</div>
  `).join('') || '<div class="text-muted">לא נמצאו תוצאות</div>';

  wireRowClicks(cards);
  toggleSectionsForFilters(true); // מחביא את המדפים כשהגריד בפעולה

  cards.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// =======================
// 4) Genres dropdown + likes + auth
// =======================

async function populateGenresDropdown() {
  const sel = document.getElementById('genre'); if (!sel) return;
  try {
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
    loadRecommendations(); // המלצות תלויות לייקים
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
  '<li class="nav-item"><a class="nav-link" href="/stats.html">סטטיסטיקות</a></li>' +
  '<li class="nav-item"><a class="nav-link" href="/admin.html">ניהול</a></li>' +
  '<li class="nav-item"><a class="nav-link" href="#" id="logout">יציאה</a></li>';
  document.getElementById('logout').onclick = async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    location.href = '/';
  };
  if (!data.selectedProfile) { location.href = '/profiles'; return null; }
  return data.user;
}

// =======================
// 5) Wire events (like/info/play) + init
// =======================

function wireRowClicks(scope) {
  // לייק
  scope.querySelectorAll('.like-btn').forEach(btn => {
    btn.onclick = () => toggleLike(btn);
  });

  // קליק על תמונה = ניגון
  scope.querySelectorAll('.card-tile img').forEach(img => {
    img.style.cursor = 'pointer';
    img.onclick = () => {
      const id = img.closest('.card-tile')?.getAttribute('data-id');
      if (id) playTitle(id, 0);
    };
  });

  // המשך צפייה
  scope.querySelectorAll('.resume-btn').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id, pos = btn.dataset.pos || 0;
      location.href = `/watch.html?id=${encodeURIComponent(id)}&t=${encodeURIComponent(pos)}`;
    };
  });

  // כפתור מידע (i)
  scope.querySelectorAll('.info-btn').forEach(btn => {
    btn.onclick = () => {
      const title = btn.dataset.title || '';
      const year  = btn.dataset.year || '';
      const desc  = btn.dataset.desc || '';

      const modalEl = document.getElementById('infoModal');
      if (!modalEl) return;

      const titleEl = modalEl.querySelector('#infoModalLabel');
      const bodyEl  = modalEl.querySelector('#infoModalBody');

      if (titleEl) titleEl.textContent = title || 'מידע על התוכן';
      if (bodyEl) {
        bodyEl.innerHTML = `
          ${desc ? `<p class="mb-2">${desc}</p>` : '<p class="mb-2 text-muted">אין תיאור זמין</p>'}
          ${
            year
              ? `<div class="small text-secondary">שנת יציאה: ${year}</div>`
              : ''
          }
        `;
      }

      if (window.bootstrap && bootstrap.Modal) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      } else {
        modalEl.style.display = 'block';
      }
    };
  });
}

// Init
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
