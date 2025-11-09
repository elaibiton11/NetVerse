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
