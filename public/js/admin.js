async function api(path, opts = {}) {
  const r = await fetch(path, {
    headers: { ...(opts.headers||{}) },
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

document.getElementById('frm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msg');
  msg.textContent = 'מעלה...';

  try {
    await ensureAdmin();

    const name = document.getElementById('name').value.trim();
    const kind = document.getElementById('kind').value.trim();
    const year = parseInt(document.getElementById('year').value || '0', 10) || null;
    const description = document.getElementById('description').value.trim();
    const genres = document.getElementById('genres').value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const posterFile = document.getElementById('poster').files[0];
    const videoFile  = document.getElementById('video').files[0];

    const posterFileId = await uploadToGridFS('image', posterFile);
    const videoFileId  = await uploadToGridFS('video', videoFile);

    // שמירת הכותר (השרת יהפוך fileId -> /img/<id>, /media/<id>)
    await api('/api/titles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind, name, description, year, genres,
        ...(posterFileId ? { posterFileId } : {}),
        ...(videoFileId  ? { videoFileId  } : {})
      })
    });

    msg.textContent = 'נשמר! חזרה לקטלוג...';
    setTimeout(() => location.href = '/app', 800);
  } catch (err) {
    msg.textContent = 'שגיאה: ' + err.message;
  }
});

ensureAdmin();
