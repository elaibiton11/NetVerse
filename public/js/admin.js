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
// ברגע שבוחרים סדרה ולא סרט יאפשר לראות פרטים נוספים על הסדרה
kindEl.addEventListener('change', updateSeriesFieldsVisibility);
updateSeriesFieldsVisibility();

