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

