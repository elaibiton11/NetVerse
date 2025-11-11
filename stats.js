async function getMeStats() {
  const r = await fetch("/api/me", {
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await r.json();
  const nav = document.getElementById("authLinks");
  if (!data.user) {
    // אם אין משתמש – חזרה למסך הבית/לוגין
    window.location.href = "/";
    return null;
  }
  const prof = data.selectedProfile
    ? `👤 ${data.selectedProfile.name}`
    : "בחר/י פרופיל";

  nav.innerHTML =
    '<li class="nav-item"><a class="nav-link" href="/profiles">' +
    prof +
    '</a></li>' +
    '<li class="nav-item"><a class="nav-link" href="/stats.html">סטטיסטיקות</a></li>' +
    '<li class="nav-item"><a class="nav-link" href="/admin.html">אדמין</a></li>' +
    '<li class="nav-item"><a class="nav-link" href="#" id="logout">יציאה</a></li>';

  document.getElementById("logout").onclick = async () => {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    window.location.href = "/";
  };

  if (!data.selectedProfile) {
    window.location.href = "/profiles";
    return null;
  }

  return data.user;
}

// --- גרף עמודות: צפיות יומיות לכל פרופיל ---
async function renderDailyViewsChart() {
  const ctx = document.getElementById("dailyViewsChart");
  if (!ctx) return;

  const r = await fetch("/api/stats/daily-views", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!r.ok) return;
  const { items } = await r.json(); // [{ day, profileId, profileName, views }, ...]

  if (!items || !items.length) return;

  // רשימת ימים ייחודיים 
  const daysSet = new Set(items.map((it) => it.day));
  const days = Array.from(daysSet).sort(); // YYYY-MM-DD לפי סדר

  // רשימת פרופילים ייחודיים
  const profileMap = new Map();
  for (const it of items) {
    const key = String(it.profileId || "unknown");
    if (!profileMap.has(key)) {
      profileMap.set(key, it.profileName || "ללא שם");
    }
  }

  // נתונים לכל פרופיל
  const datasets = [];
  const palette = [
    "#ff6384",
    "#36a2eb",
    "#ffcd56",
    "#4bc0c0",
    "#9966ff",
    "#ff9f40",
    "#8bc34a",
    "#e91e63",
  ];

  let colorIndex = 0;
  for (const [profileId, profileName] of profileMap.entries()) {
    const data = days.map((day) => {
      const row = items.find((it) => it.day === day && String(it.profileId || "unknown") === profileId);
      return row ? row.views : 0;
    });
    const color = palette[colorIndex % palette.length];
    colorIndex++;

    datasets.push({
      label: profileName,
      data,
      backgroundColor: color,
      stack: "views",
    });
  }

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: days,
      datasets,
    },

