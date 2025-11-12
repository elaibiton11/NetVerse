(function () {
  const dbg = null;
  const log = (msg) => { console.log('[watch]', msg); };

  log('watch.js LOADED v5');

  const qs = new URLSearchParams(location.search);
  const titleId = qs.get('id') || '';
  const v = document.getElementById('player');

  log('titleId=' + titleId);
  log('has <video id="player"> = ' + !!v);

  if (!titleId) { alert('חסר מזהה כותרת'); location.href = '/app'; return; }
})();
// אימות פרופיל
  async function ensureProfile() {
    try {
      const r = await fetch('/api/me', { credentials: 'same-origin' });
      const data = await r.json();
      log('me: user=' + !!data.user + ' profile=' + !!data.selectedProfile);
      if (!data.user)            { location.href = '/';        return false; }
      if (!data.selectedProfile) { location.href = '/profiles'; return false; }
      return true;
    } catch (e) {
      log('me failed: ' + e.message);
      return false;
    }
  }
// התקדמות צפייה
  async function postProgress(tag, completed = false) {
    try {
      const pos = Math.floor(Number(v?.currentTime || 0)) || 0;
      const body = { titleId, positionSec: completed ? 0 : pos, completed };

      const r = await fetch('/api/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify(body)
      });

      const text = await r.text().catch(() => '');
      log(`${tag}: POST /api/watch => ${r.status} ${text}`);
    } catch (e) {
      log(`${tag}: POST failed: ${e.message}`);
    }
  }
// 10 שניות קדימה או אחורה
  function setupSeekButtons() {
    const backBtn = document.getElementById('back-10');
    const fwdBtn  = document.getElementById('forward-10');
    if (!v || !backBtn || !fwdBtn) return;

    backBtn.addEventListener('click', () => {
      v.currentTime = Math.max(0, v.currentTime - 10);
      log('⏪ קפיצה 10 שניות אחורה');
    });

    fwdBtn.addEventListener('click', () => {
      const target = v.currentTime + 10;
      v.currentTime = Math.min(v.duration || target, target);
      log('⏩ קפיצה 10 שניות קדימה');
    });
  }
// אתחולים
  (async () => {
    if (!await ensureProfile()) return;

    // שליחה מיידית עם כניסה לדף
    await postProgress('t+0s', false);

    if (!v) return;

    setupSeekButtons();

    // שליחה על תחילת ניגון
    v.addEventListener('playing', () => postProgress('playing', false), { once: true });

    // שליחה כל 5 שניות בזמן ניגון
    let lastSentAt = -5;
    v.addEventListener('timeupdate', () => {
      if (v.currentTime - lastSentAt >= 5) {
        lastSentAt = v.currentTime;
        postProgress('tick', false);
      }
    });

    // שליחה על pause ועל סיום
    v.addEventListener('pause',  () => postProgress('pause',  false));
    v.addEventListener('ended',  () => postProgress('ended',  true));

    // גיבוי: יציאה/הסתרת טאב
    window.addEventListener('pagehide',     () => postProgress('pagehide',     false));
    window.addEventListener('beforeunload', () => postProgress('beforeunload', false));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) postProgress('hidden', false);
    });
  })();




