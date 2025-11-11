async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r;
}

// הרשמה
const reg = document.getElementById('regForm');
if (reg) {
  reg.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(reg).entries());
    const r = await post('/api/register', body);
    if (r.ok) {
      // אחרי הרשמה—נעבור למסך כניסה (אפשר גם ישר ל-/profiles אם תרצה)
      location.href = '/login.html';
    } else {
      alert((await r.json()).error || 'שגיאה');
    }
  });
}

// התחברות
const login = document.getElementById('loginForm');
if (login) {
  login.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(login).entries());
    const r = await post('/api/login', body);
    if (r.ok) {
      // חשוב: לא ל-/ — כי / זה Landing!
      location.href = '/profiles';
    } else {
      alert((await r.json()).error || 'שגיאה');
    }
  });
}
