// public/js/profiles.js

async function api(path, opts = {}) {
  // נבנה headers רק אם יש body
  const hasBody = !!opts.body;
  const headers = hasBody
    ? { 'Content-Type': 'application/json', ...(opts.headers || {}) }
    : { ...(opts.headers || {}) };

  const r = await fetch(path, {
    credentials: 'same-origin', // שולח קוקיז של אותו דומיין
    ...opts,
    headers
  });

  // ננסה לפרש תשובה
  const ct = r.headers.get('content-type') || '';
  let payload = null;
  try {
    if (ct.includes('application/json')) payload = await r.json();
    else {
      const txt = await r.text();
      payload = txt ? { error: txt } : null;
    }
  } catch (_) {
    payload = null;
  }

  if (!r.ok) {
    if (r.status === 401) {
      // לא מחובר -> לוגין
      location.href = '/login.html';
      throw new Error('Unauthorized');
    }
    throw new Error(payload?.error || `HTTP ${r.status}`);
  }
  return payload;
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return (parts[0]?.[0] || 'U').toUpperCase();
}

function tileProfile(p, canDelete) {
  return `
    <div class="tile" data-id="${p._id}" role="button" tabindex="0" aria-label="בחר ${p.name}">
      <div class="tile-box">
        <div class="avatar" style="background:${p.avatarColor}">${initials(p.name)}</div>
      </div>
      <div class="tile-name">${p.name}</div>
      ${
        canDelete
          ? `<button class="tile-delete" data-del="${p._id}" title="מחיקה" aria-label="מחיקת ${p.name}">
               <svg viewBox="0 0 24 24" aria-hidden="true">
                 <path d="M9 3h6a1 1 0 0 1 1 1v1h4v2h-1v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7H4V5h4V4a1 1 0 0 1 1-1Zm1 2h4V5h-4ZM8 7v12h8V7H8Zm2 2h2v8h-2V9Z"/>
               </svg>
             </button>`
          : ''
      }
    </div>
  `;
}

function tileAdd() {
  return `
    <button class="tile tile-add" id="addTile" aria-label="הוספת פרופיל">
      <div class="tile-box">
        <div class="plus">＋</div>
      </div>
      <div class="tile-name">הוספת פרופיל</div>
    </button>
  `;
}

let addModal;

async function load() {
  try {
    const { profiles } = await api('/api/profiles');
    const grid = document.getElementById('profilesGrid');

    const canDelete = profiles.length > 1;
    grid.innerHTML =
      profiles.map(p => tileProfile(p, canDelete)).join('') +
      (profiles.length < 5 ? tileAdd() : '');

    // מחיקה
    grid.querySelectorAll('.tile-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-del');
        if (!confirm('למחוק את הפרופיל הזה? אי אפשר לבטל.')) return;
        try {
          await api('/api/profiles/' + encodeURIComponent(id), { method: 'DELETE' });
          load();
        } catch (err) {
          alert(err.message);
        }
      });
    });

    // בחירה
    grid.querySelectorAll('.tile[data-id]').forEach(tile => {
      const choose = async () => {
        const id = tile.getAttribute('data-id');
        try {
          await api('/api/profiles/select', {
            method: 'POST',
            body: JSON.stringify({ profileId: id })
          });
          location.href = '/app';
        } catch (err) {
          alert(err.message);
        }
      };
      tile.addEventListener('click', (e) => {
        if (e.target.closest('.tile-delete')) return;
        choose();
      });
      tile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!e.target.closest('.tile-delete')) choose();
        }
      });
    });

    // מודל הוספה
    const addBtn = document.getElementById('addTile');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (!addModal) {
          const el = document.getElementById('addProfileModal');
          addModal = window.bootstrap ? new bootstrap.Modal(el) : null;
        }
        const input = document.getElementById('profileName');
        if (input) input.value = '';
        addModal && addModal.show();
        setTimeout(() => input && input.focus(), 120);
      });
    }

    // שמירת פרופיל חדש
    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
      const onSave = async () => {
        const input = document.getElementById('profileName');
        const name = (input?.value || '').trim();
        if (!name) { alert('יש להזין שם פרופיל'); return; }
        try {
          await api('/api/profiles', { method: 'POST', body: JSON.stringify({ name }) });
          addModal && addModal.hide();
          load();
        } catch (err) {
          alert(err.message);
        }
      };
      saveBtn.onclick = onSave;

      const nameInput = document.getElementById('profileName');
      if (nameInput) {
        nameInput.onkeydown = (e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSave(); }
        };
      }
    }

  } catch (e) {
    // לא מחובר -> לוגין
    location.href = '/login.html';
  }
}

load();
