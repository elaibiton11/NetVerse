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

