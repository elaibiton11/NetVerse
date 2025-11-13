async function api(path, opts = {}) {
  const r = await fetch(path, {
    headers: { ...(opts.headers || {}) },
    ...opts
  });
  let payload = null;
  try { payload = await r.json(); } catch {}
  if (!r.ok) throw new Error(payload?.error || 'Error');
  return payload;
}
async function ensureAdmin() {
  const r = await fetch('/api/me');
  const { user } = await r.json();
  if (!user) { location.href = '/'; return null; }
  if (user.role !== 'admin') {
    alert('Admin only');
    location.href = '/app';
    return null;
  }
  return user;
}
async function uploadToGridFS(kind, file) {
  if (!file) return null;
  const contentType = file.type || (kind === 'image' ? 'image/jpeg' : 'video/mp4');
  const filename = encodeURIComponent(file.name || (kind + Date.now()));
  const buf = await file.arrayBuffer();
  const r = await fetch(`/api/upload/${kind}?filename=${filename}&contentType=${encodeURIComponent(contentType)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buf
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Upload failed');
  return data.fileId;
}
// אלמטים של סדרה
const kindEl = document.getElementById('kind');
const seriesIdEl = document.getElementById('seriesId');
const episodeIndexEl = document.getElementById('episodeIndex');
const seriesFields = document.getElementById('seriesFields');

// הצגת/הסתרת שדות של סדרה:
function updateSeriesFieldsVisibility() {
  const isSeries = (kindEl.value === 'series');
  seriesFields.classList.toggle('d-none', !isSeries);
}

// ברגע שבוחרים סדרה ולא סרט יאפשר לראות פרטים נוספים על הסדרה
kindEl.addEventListener('change', updateSeriesFieldsVisibility);
updateSeriesFieldsVisibility();
document.getElementById('frm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msg');
  msg.textContent = 'מעלה...';

  try {
    await ensureAdmin();

    const name = document.getElementById('name').value.trim();
    const kind = kindEl.value; 
    const year = parseInt(document.getElementById('year').value || '0', 10) || null;
    const description = document.getElementById('description').value.trim();
    const genres = document.getElementById('genres').value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const mainActorsRaw = document.getElementById('mainActors').value || '';
    let actors = [];
    if (mainActorsRaw.trim()) {
      actors = mainActorsRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);   
    }

    const seriesId = seriesIdEl.value.trim();
    const episodeIndexRaw = episodeIndexEl.value.trim();
    const episodeIndex = episodeIndexRaw ? parseInt(episodeIndexRaw, 10) : null;

    
    if (kind === 'series') {
      if (!seriesId) {
        msg.textContent = 'חובה למלא סדרה (seriesId).';
        return;
      }
      if (!episodeIndex || Number.isNaN(episodeIndex) || episodeIndex < 1) {
        msg.textContent = 'לסדרה חובה למלא "מספר פרק (episodeIndex)" גדול מ-0.';
        return;
      }
    }
    const posterFile = document.getElementById('poster').files[0];
    const videoFile  = document.getElementById('video').files[0];
    
    const posterFileId = await uploadToGridFS('image', posterFile);
    const videoFileId  = await uploadToGridFS('video', videoFile);
   
    const payload = {
      kind,
      name,
      description,
      year,
      genres,
      ...(posterFileId ? { posterFileId } : {}),
      ...(videoFileId  ? { videoFileId  } : {})
    };

    // רק בסדרה נמלא
    if (kind === 'series') {
      payload.seriesId = seriesId;
      payload.episodeIndex = episodeIndex;
    }

    if (actors.length) {
      payload.actors = actors; 
    }

    await api('/api/titles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    msg.textContent = 'נשמר! חזרה לקטלוג...';
    setTimeout(() => location.href = '/app', 800);
  } catch (err) {
    msg.textContent = 'שגיאה: ' + err.message;
  }
});

ensureAdmin();


