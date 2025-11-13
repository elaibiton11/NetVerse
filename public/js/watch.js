 const dbg = null;
  const log = (msg) => { if (dbg) console.log('[watch]', msg); };

  const qs = new URLSearchParams(location.search);
  const titleId = qs.get('id') || '';
  const v = document.getElementById('player');

  log('watch.js LOADED v5');
  log('titleId=' + titleId);
  log('has <video id="player"> = ' + !!v);

  if (!titleId) {
  alert('חסר מזהה כותרת');
  location.href = '/app';
}
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
      const video = window.videoEl || v;
      const pos = Math.floor(Number(video?.currentTime || 0)) || 0;
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
 function showSeekToast(text) {
  const toast = document.getElementById('seekToast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 450);
}

// קפיצה בפועל
function seekBy(delta) {
  const video = window.videoEl || v;
  if (!video) return;
  try {
    const cur = Number(video.currentTime || 0);
    const dur = Number.isFinite(video.duration) ? video.duration : cur + Math.abs(delta);
    video.currentTime = Math.max(0, Math.min(dur, cur + delta));
    showSeekToast(delta < 0 ? '⏪ ‎10-' : '10+ ⏩');
  } catch {}
}

// חדש: מסך סיום צפייה
function tryShowEndScreen() {
  const video = window.videoEl || v;
  const endScreen = document.getElementById('endScreen');
  const btnNext   = document.getElementById('btnEndNext');
  const btnReplay = document.getElementById('btnEndReplay');

  if (!video || !endScreen || !btnReplay) return;

  // כפתור צפייה מההתחלה – תמיד קיים
  btnReplay.onclick = () => {
    endScreen.classList.add('d-none');
    try {
      video.currentTime = 0;
      video.play();
    } catch (e) {}
  };

  const nextId = window.nextEpisodeId || null;

  if (nextId && btnNext) {
    btnNext.classList.remove('d-none');
    btnNext.onclick = () => {
      // מתחילים את הפרק הבא מההתחלה (לא מ־resume)
      const href = `/watch.html?id=${encodeURIComponent(nextId)}`;
      location.href = href;
    };
  } else if (btnNext) {
    btnNext.classList.add('d-none');
  }

  endScreen.classList.remove('d-none');
}


// מקשי חצים שמאל/ימין
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft')  seekBy(-10);
  if (e.key === 'ArrowRight') seekBy(+10);
});

// אתחולים
  (async () => {
    if (!await ensureProfile()) return;

    // שליחה מיידית עם כניסה לדף
    await postProgress('t+0s', false);

    if (!v) return;

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
  v.addEventListener('pause', () => postProgress('pause', false));

  // כאן השינוי: בנוסף לשמירת "completed" אני גם מציגה את מסך הסיום
  v.addEventListener('ended', () => {
    postProgress('ended', true);
    tryShowEndScreen();
  });
    // גיבוי: יציאה/הסתרת טאב
    window.addEventListener('pagehide',     () => postProgress('pagehide',     false));
    window.addEventListener('beforeunload', () => postProgress('beforeunload', false));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) postProgress('hidden', false);
    });
  })();




