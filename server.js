// server.js (full)

import express from "express";
import { MongoClient, ObjectId, GridFSBucket } from "mongodb";
import crypto from "crypto";
import path from "path";
import url from "url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----- Config -----
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/streaming_catalog_min";
const APP_SECRET = (process.env.APP_SECRET || "DEV_SECRET").slice(0, 32);

// ----- App & Middlewares -----
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const pairs = header
    .split(/;\s*/)
    .filter(Boolean)
    .map((x) => x.split("="));
  const obj = {};
  for (const [k, v] of pairs)
    obj[decodeURIComponent(k)] = decodeURIComponent(v || "");
  return obj;
}

// ----- DB -----
const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db();

const Users = db.collection("users");
const Titles = db.collection("titles");
const Sessions = db.collection("sessions");
const WatchHistory = db.collection("watch_history");
const Likes = db.collection("likes");

const imageBucket = new GridFSBucket(db, { bucketName: "images" });
const videoBucket = new GridFSBucket(db, { bucketName: "videos" });

// Indexes
await Users.createIndex({ email: 1 }, { unique: true });
await Titles.createIndex({ name: "text" }); // חיפוש טקסטואלי בשם
await Titles.createIndex({ genres: 1 });
await Titles.createIndex({ seriesId: 1, episodeIndex: 1 }); // NEW: סדרות (פרקים)
await Sessions.createIndex({ token: 1 }, { unique: true });
await WatchHistory.createIndex(
  { userId: 1, profileId: 1, titleId: 1 },
  { unique: true }
);
await Likes.createIndex(
  { userId: 1, profileId: 1, titleId: 1 },
  { unique: true }
);

// ----- Helpers -----
function pbkdf2(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, 120000, 32, "sha256")
    .toString("hex");
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = pbkdf2(password, salt);
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, orig] = stored.split(":");
  const hash = pbkdf2(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(orig));
}
function signToken(str) {
  const mac = crypto.createHmac("sha256", APP_SECRET).update(str).digest("hex");
  return `${str}.${mac}`;
}
function verifyToken(signed) {
  const [str, mac] = signed.split(".");
  if (!str || !mac) return false;
  const expected = crypto
    .createHmac("sha256", APP_SECRET)
    .update(str)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}
function escapeRegex(s = "") {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ----- Auth middlewares -----
async function authOptional(req, res, next) {
  req.user = null;
  req.session = null;
  const cookies = parseCookies(req);
  const sid = cookies.sid;
  if (!sid || !verifyToken(sid)) return next();
  const sess = await Sessions.findOne({ token: sid });
  if (!sess) return next();
  const user = await Users.findOne(
    { _id: new ObjectId(sess.userId) },
    { projection: { password: 0 } }
  );
  if (!user) return next();
  req.user = user;
  req.session = sess; // כולל selectedProfileId אם נבחר
  next();
}
async function requireAuth(req, res, next) {
  await authOptional(req, res, async () => {});
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin")
    return res.status(403).json({ error: "Admin only" });
  next();
}

app.use(authOptional);

// ----- Auth API -----
app.post("/api/register", async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password)
      return res.status(400).json({ error: "Missing fields" });

    const passwordHash = hashPassword(password);
    const defaultProfile = {
      _id: new ObjectId().toString(),
      name: (fullName?.split(" ")[0] || "ראשי"),
      avatarColor: "#777777",
    };

    const user = {
      fullName,
      email: email.toLowerCase(),
      password: passwordHash,
      role: "user",
      profiles: [defaultProfile],
      createdAt: new Date(),
    };
    await Users.insertOne(user);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 11000)
      return res.status(409).json({ error: "Email already exists" });
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await Users.findOne({ email: (email || "").toLowerCase() });
  if (!user || !verifyPassword(password || "", user.password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const raw = crypto.randomBytes(24).toString("hex");
  const token = signToken(raw);
  await Sessions.insertOne({
    token,
    userId: user._id.toString(),
    createdAt: new Date(),
  });
  res.setHeader(
    "Set-Cookie",
    `sid=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`
  );
  res.json({ ok: true });
});

app.post("/api/logout", async (req, res) => {
  const sid = parseCookies(req).sid;
  if (sid) await Sessions.deleteOne({ token: sid });
  res.setHeader("Set-Cookie", "sid=; Max-Age=0; Path=/; SameSite=Lax");
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const user = req.user;
  if (!user) return res.json({ user: null });
  const selectedProfileId = req.session?.selectedProfileId || null;
  const selectedProfile =
    (user.profiles || []).find(
      (p) => String(p._id) === String(selectedProfileId)
    ) || null;
  res.json({
    user: {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    },
    selectedProfile,
  });
});

// ----- Profiles API -----
app.get("/api/profiles", requireAuth, async (req, res) => {
  const user = await Users.findOne(
    { _id: req.user._id },
    { projection: { password: 0 } }
  );
  res.json({
    profiles: user.profiles || [],
    selectedProfileId: req.session?.selectedProfileId || null,
  });
});

app.post("/api/profiles", requireAuth, async (req, res) => {
  const { name, avatarColor } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });

  const user = await Users.findOne({ _id: req.user._id });
  const profiles = user.profiles || [];
  if (profiles.length >= 5)
    return res.status(400).json({ error: "Max 5 profiles per user" });

  const profile = {
    _id: new ObjectId().toString(),
    name,
    avatarColor:
      avatarColor ||
      "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0"),
  };
  await Users.updateOne({ _id: user._id }, { $push: { profiles: profile } });
  res.json({ ok: true, profile });
});

app.post("/api/profiles/select", requireAuth, async (req, res) => {
  const { profileId } = req.body;
  if (!profileId) return res.status(400).json({ error: "profileId required" });

  const user = await Users.findOne(
    { _id: req.user._id },
    { projection: { profiles: 1 } }
  );
  const owns = (user.profiles || []).some(
    (p) => String(p._id) === String(profileId)
  );
  if (!owns) return res.status(404).json({ error: "Profile not found" });

  const sid = parseCookies(req).sid;
  await Sessions.updateOne(
    { token: sid },
    { $set: { selectedProfileId: String(profileId) } }
  );

  res.json({ ok: true });
});

app.delete("/api/profiles/:id", requireAuth, async (req, res) => {
  const profileId = String(req.params.id);

  const user = await Users.findOne(
    { _id: req.user._id },
    { projection: { profiles: 1 } }
  );
  const profiles = user?.profiles || [];
  const owns = profiles.some((p) => String(p._id) === profileId);
  if (!owns) return res.status(404).json({ error: "Profile not found" });

  if (profiles.length <= 1)
    return res.status(400).json({ error: "Cannot delete the last profile" });

  await Users.updateOne(
    { _id: req.user._id },
    { $pull: { profiles: { _id: profileId } } }
  );

  await Sessions.updateMany(
    { userId: req.user._id.toString(), selectedProfileId: profileId },
    { $unset: { selectedProfileId: "" } }
  );

  await WatchHistory.deleteMany({
    userId: req.user._id.toString(),
    profileId,
  });

  res.json({ ok: true });
});

// ----- Titles API -----

// GET /api/titles — עם סינונים: q, genre, watched
app.get("/api/titles", requireAuth, async (req, res) => {
  const { q, genre, watched } = req.query;

  const filter = {};
  // חיפוש טקסט על name (אם יש אינדקס)
  if (q) {
    // אם אין אינדקס טקסט בסביבה, אפשר לפולבק לרגקס קל:
    filter.$text = { $search: String(q) };
  }

  // סינון ז'אנר — לא רגיש לאותיות
  if (genre) {
    filter.genres = {
      $regex: `^${escapeRegex(String(genre))}$`,
      $options: "i",
    };
  }

  // בסיס טייטלים
  let baseQuery = Titles.find(filter).sort({ createdAt: -1 });

  // סינון נצפה/לא נצפה — *ברמת פרופיל נבחר* (ה”משתמש” של נטפליקס)
  if (watched === "yes" || watched === "no") {
    const profileId = req.session?.selectedProfileId;
    if (!profileId)
      return res.status(400).json({ error: "Select profile first" });

    const wh = await WatchHistory.find({
      userId: req.user._id.toString(),
      profileId: String(profileId),
    })
      .project({ titleId: 1 })
      .toArray();

    const watchedIds = wh
      .map((x) => {
        try {
          return new ObjectId(String(x.titleId));
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (watched === "yes") {
      baseQuery = Titles.find({ ...filter, _id: { $in: watchedIds } }).sort({
        createdAt: -1,
      });
    } else {
      // "no"
      baseQuery = Titles.find({ ...filter, _id: { $nin: watchedIds } }).sort({
        createdAt: -1,
      });
    }
  }

  const titles = await baseQuery.limit(100).toArray();
  res.json({ titles });
});

// GET /api/titles/:id
app.get("/api/titles/:id", requireAuth, async (req, res) => {
  try {
    const t = await Titles.findOne({ _id: new ObjectId(req.params.id) });
    if (!t) return res.status(404).json({ error: "Not found" });

    // NEW: חישוב פרק הבא לפי seriesId + episodeIndex
    let nextEpisodeId = null;
    if (t.seriesId && typeof t.episodeIndex === "number") {
      const next = await Titles.findOne(
        {
          seriesId: t.seriesId,
          episodeIndex: { $gt: t.episodeIndex },
        },
        { sort: { episodeIndex: 1, _id: 1 } }
      );
      if (next) nextEpisodeId = next._id.toString();
    }

    const title = {
      ...t,
      posterPath:
        t.posterPath ||
        (t.posterFileId
          ? `/img/${t.posterFileId}`
          : "/img/placeholder.jpg"),
      videoPath: t.videoPath || (t.videoFileId ? `/media/${t.videoFileId}` : null),
      nextEpisodeId, // NEW
    };
    res.json({ title });
  } catch {
    res.status(400).json({ error: "Bad id" });
  }
});

// Admin — יצירת טייטל (תומך ב-fileId או בנתיב רגיל)
app.post("/api/titles", requireAuth, requireAdmin, async (req, res) => {
  const {
    kind,
    name,
    description,
    year,
    genres,
    posterPath,
    videoPath,
    posterFileId,
    videoFileId,
    seriesId,     
    episodeIndex,
    actors
  } = req.body;

  if (!kind || !name) return res.status(400).json({ error: "Missing fields" });

  let posterPathFinal = posterPath || null;
  let videoPathFinal = videoPath || null;

  if (posterFileId && !posterPathFinal)
    posterPathFinal = `/img/${posterFileId}`;
  if (videoFileId && !videoPathFinal) videoPathFinal = `/media/${videoFileId}`;

  const doc = {
    kind,
    name,
    description: description || "",
    year: Number(year) || null,
    genres: Array.isArray(genres) ? genres : genres ? [genres] : [],
    posterPath: posterPathFinal || "/img/placeholder.jpg",
    videoPath: videoPathFinal || null,
    ...(posterFileId ? { posterFileId: String(posterFileId) } : {}),
    ...(videoFileId ? { videoFileId: String(videoFileId) } : {}),
    seriesId: seriesId ? String(seriesId) : null,
    episodeIndex:
      episodeIndex === undefined ||
      episodeIndex === null ||
      episodeIndex === ""
        ? null
        : Number(episodeIndex),
    actors: Array.isArray(actors) ? actors : [], 
    createdAt: new Date(),
  };

  const r = await Titles.insertOne(doc);
  res.json({ ok: true, id: r.insertedId });
});

app.put("/api/titles/:id", requireAuth, requireAdmin, async (req, res) => {
  const _id = new ObjectId(req.params.id);
  const update = { $set: { ...req.body, updatedAt: new Date() } };
  await Titles.updateOne({ _id }, update);
  res.json({ ok: true });
});

// ----- Watch history (per profile = per "user" in Netflix terms) -----
app.post("/api/watch", requireAuth, async (req, res) => {
  const { titleId, positionSec = 0, completed = false } = req.body;
  const profileId = req.session?.selectedProfileId;
  if (!titleId) return res.status(400).json({ error: "titleId required" });
  if (!profileId) return res.status(400).json({ error: "Select profile first" });

  const doc = {
    userId: req.user._id.toString(),
    profileId: String(profileId),
    titleId: String(titleId),
    positionSec: Math.max(0, Number(positionSec) || 0),
    completed: !!completed,
    updatedAt: new Date(),
  };

  await WatchHistory.updateOne(
    { userId: doc.userId, profileId: doc.profileId, titleId: doc.titleId },
    { $set: doc },
    { upsert: true }
  );

  res.json({ ok: true });
});

app.get("/api/watch", requireAuth, async (req, res) => {
  const profileId = req.session?.selectedProfileId;
  if (!profileId) return res.status(400).json({ error: "Select profile first" });

  const items = await WatchHistory.find({
    userId: req.user._id.toString(),
    profileId: String(profileId),
  })
    .sort({ updatedAt: -1 })
    .toArray();
  res.json({ items });
});

// נצפו לאחרונה
app.get("/api/recent", requireAuth, async (req, res) => {
  const profileId = req.session?.selectedProfileId;
  if (!profileId) return res.status(400).json({ error: "Select profile first" });

  const items = await WatchHistory.aggregate([
    { $match: { userId: req.user._id.toString(), profileId: String(profileId) } },
    { $sort: { updatedAt: -1 } },
    { $limit: 20 },
    {
      $addFields: {
        titleObjId: {
          $convert: { input: "$titleId", to: "objectId", onError: null, onNull: null },
        },
      },
    },
    { $lookup: { from: "titles", localField: "titleObjId", foreignField: "_id", as: "t" } },
    { $unwind: "$t" },
    {
      $project: {
        _id: 0,
        title: "$t",
        positionSec: 1,
        updatedAt: 1,
        completed: 1,
      },
    },
  ]).toArray();

  res.json({ items });
});
// סטטיסטיקה: צפיות יומיות לכל פרופיל
app.get("/api/stats/daily-views", async (req, res) => {
  try {
    // 1) מביאים את כל המשתמשים כדי לבנות map של profileId -> profileName
    const users = await Users.find({})
      .project({ profiles: 1 })
      .toArray();

    const profileNameById = new Map(); // profileId(string) -> name

    for (const u of users) {
      for (const p of u.profiles || []) {
        const pid = String(p._id || p.id || p.profileId || "").trim();
        if (!pid) continue;
        const name = p.name || `פרופיל ${pid.slice(-4)}`;
        profileNameById.set(pid, name);
      }
    }

    // 2) מביאים את כל ההיסטוריה מה-DB
    const docs = await WatchHistory.find({}).toArray();

    // 3) מאגדים לפי יום + profileId
    const map = new Map(); // key = "YYYY-MM-DD|profileId" -> { day, profileId, profileName, views }

    for (const doc of docs) {
      const date = doc.updatedAt || doc.createdAt;
      if (!date) continue;

      const day = new Date(date).toISOString().slice(0, 10); // YYYY-MM-DD
      const profileId = doc.profileId || "unknown";

      // אם אין profileId בכלל – אפשר לדלג (או להשאיר "פרופיל לא ידוע")
      if (profileId === "unknown") continue;

      const pidStr = String(profileId);
      const key = `${day}|${pidStr}`;

      if (!map.has(key)) {
        const profileName =
          profileNameById.get(pidStr) ||
          `פרופיל ${pidStr.slice(-4)}`;

        map.set(key, {
          day,
          profileId: pidStr,
          profileName,
          views: 0,
        });
      }

      map.get(key).views++;
    }

    const items = Array.from(map.values()).sort((a, b) => {
      if (a.day !== b.day) return a.day.localeCompare(b.day);
      return a.profileName.localeCompare(b.profileName, "he");
    });

    res.json({ items });
  } catch (err) {
    console.error("daily-views stats error", err);
    res.status(500).json({ error: "stats failed" });
  }
});


// סטטיסטיקה: פופולריות ז׳אנרים (לפי צפיות) - חישוב ב-JS מתוך ה-DB
app.get('/api/stats/genres', async (req, res) => {
  try {
    // מביאים את כל ההיסטוריה
    const docs = await WatchHistory.find({}).toArray();

    // אוספים את כל ה-titleId הייחודיים (אצלך הם strings)
    const titleIdStrings = Array.from(
      new Set(
        docs
          .map((d) => d.titleId)
          .filter((id) => typeof id === 'string' && id.trim() !== '')
      )
    );

    // ממירים ל-ObjectId (מדלגים על מזהים לא תקינים)
    const titleObjectIds = [];
    for (const idStr of titleIdStrings) {
      try {
        titleObjectIds.push(new ObjectId(idStr));
      } catch (e) {
        console.warn('invalid titleId in watch_history:', idStr);
      }
    }

    // מביאים את כל ה-titles המתאימים מה-DB
    const titles = await Titles.find({ _id: { $in: titleObjectIds } }).toArray();

    // בונים map: string(titleId) -> genres[]
    const titleGenres = new Map();
    for (const t of titles) {
      const idStr = String(t._id);
      const genres = Array.isArray(t.genres) ? t.genres : [];
      titleGenres.set(idStr, genres);
    }

    // סופרים צפיות לכל ז'אנר
    const genreCounts = new Map(); // genre -> views
    for (const doc of docs) {
      const idStr = doc.titleId;
      if (!idStr) continue;
      const genres = titleGenres.get(idStr);
      if (!genres || !genres.length) continue;

      for (const g of genres) {
        const key = String(g);
        genreCounts.set(key, (genreCounts.get(key) || 0) + 1);
      }
    }

    const items = Array.from(genreCounts.entries())
      .map(([genre, views]) => ({ genre, views }))
      .sort((a, b) => b.views - a.views);

    res.json({ items });
  } catch (err) {
    console.error('genre stats error', err);
    res.status(500).json({ error: 'stats failed' });
  }
});


// ----- Likes + Recommendations -----
app.get("/api/likes", requireAuth, async (req, res) => {
  const profileId = req.session?.selectedProfileId;
  if (!profileId) return res.status(400).json({ error: "Select profile first" });

  const rows = await Likes.find({
    userId: req.user._id.toString(),
    profileId: String(profileId),
  })
    .project({ _id: 0, titleId: 1 })
    .toArray();

  res.json({ likes: rows.map((r) => r.titleId) });
});

app.post("/api/likes", requireAuth, async (req, res) => {
  const { titleId, like } = req.body;
  const profileId = req.session?.selectedProfileId;
  if (!titleId) return res.status(400).json({ error: "titleId required" });
  if (!profileId) return res.status(400).json({ error: "Select profile first" });

  const doc = {
    userId: req.user._id.toString(),
    profileId: String(profileId),
    titleId: String(titleId),
    createdAt: new Date(),
  };

  if (like === false) {
    await Likes.deleteOne({
      userId: doc.userId,
      profileId: doc.profileId,
      titleId: doc.titleId,
    });
    return res.json({ ok: true, liked: false });
  }

  await Likes.updateOne(
    { userId: doc.userId, profileId: doc.profileId, titleId: doc.titleId },
    { $set: doc },
    { upsert: true }
  );
  res.json({ ok: true, liked: true });
});

// המלצות לפי הז׳אנרים של הלייקים (למעט מה שכבר אהבנו)
app.get("/api/recommendations", requireAuth, async (req, res) => {
  const profileId = req.session?.selectedProfileId;
  if (!profileId) return res.status(400).json({ error: "Select profile first" });

  const userId = req.user._id.toString();
  const liked = await Likes.find({ userId, profileId: String(profileId) }).toArray();

  if (liked.length === 0) {
    const titles = await Titles.find({}).sort({ createdAt: -1 }).limit(20).toArray();
    return res.json({ titles, basedOn: [] });
  }

  const likedObjIds = liked
    .map((l) => {
      try {
        return new ObjectId(l.titleId);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const likedTitles = await Titles.find({ _id: { $in: likedObjIds } })
    .project({ genres: 1 })
    .toArray();

  const counts = {};
  for (const t of likedTitles) {
    for (const g of t.genres || []) {
      const key = String(g).toLowerCase().trim();
      counts[key] = (counts[key] || 0) + 1;
    }
  }

  const topGenres = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g);

  const titles = await Titles.find({
    ...(topGenres.length
      ? {
          genres: {
            $in: topGenres.map(
              (g) => new RegExp(`^${escapeRegex(g)}$`, "i")
            ),
          },
        }
      : {}),
    _id: { $nin: likedObjIds },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  res.json({ titles, basedOn: topGenres });
});

// ----- Genres -----
app.get("/api/genres", requireAuth, async (req, res) => {
  const list = await Titles.distinct("genres");
  // נרמול: איחוד לפי אותיות קטנות, ושמירת אחד לכל ערך
  const map = new Map(); // key=lower, val=original
  for (const g of list) {
    if (!g) continue;
    const orig = String(g).trim();
    if (!orig) continue;
    const lower = orig.toLowerCase();
    if (!map.has(lower)) map.set(lower, orig);
  }
  const genres = Array.from(map.values()).sort((a, b) =>
    String(a).localeCompare(String(b), "he")
  );
  res.json({ genres });
});

// 10 החדשים בכל ז׳אנר — קייס־אינסנסטיב


// ----- Popular Now -----
app.get("/api/popular", requireAuth, async (req, res) => {
  const days = 30;
  const limit = 20;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const items = await WatchHistory.aggregate([
    { $match: { updatedAt: { $gte: since } } },
    { $group: { _id: "$titleId", views: { $sum: 1 } } },
    { $sort: { views: -1 } },
    { $limit: limit },
    {
      $addFields: {
        titleObjId: {
          $convert: {
            input: "$_id",
            to: "objectId",
            onError: null,
            onNull: null,
          },
        },
      },
    },
    {
      $lookup: {
        from: "titles",
        localField: "titleObjId",
        foreignField: "_id",
        as: "t",
      },
    },
    { $unwind: "$t" },
    { $project: { _id: 0, title: "$t", views: 1 } },
  ]).toArray();

  res.json({ items });
});

// ----- Upload to GridFS -----
app.post(
  "/api/upload/image",
  requireAuth,
  requireAdmin,
  express.raw({ type: "application/octet-stream", limit: "500mb" }),
  async (req, res) => {
    try {
      const filename = String(req.query.filename || "image");
      const contentType = String(req.query.contentType || "image/jpeg");
      const up = imageBucket.openUploadStream(filename, { contentType });
      up.on("error", () => res.status(500).json({ error: "Upload error" }));
      up.on("finish", () => res.json({ fileId: up.id.toString() }));
      up.end(req.body);
    } catch {
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

app.post(
  "/api/upload/video",
  requireAuth,
  requireAdmin,
  express.raw({ type: "application/octet-stream", limit: "2000mb" }),
  async (req, res) => {
    try {
      const filename = String(req.query.filename || "video");
      const contentType = String(req.query.contentType || "video/mp4");
      const up = videoBucket.openUploadStream(filename, { contentType });
      up.on("error", () => res.status(500).json({ error: "Upload error" }));
      up.on("finish", () => res.json({ fileId: up.id.toString() }));
      up.end(req.body);
    } catch {
      res.status(500).json({ error: "Upload failed" });
    }
  }
);
// הכי חדשים (ברירת מחדל: 20)
// ==== Newest (last X hours; default 1 hour) ====
// --- Newest (שעה אחרונה כברירת מחדל) ---
app.get("/api/newest", requireAuth, async (req, res) => {
  const hours = Math.max(1, parseInt(req.query.hours || "1", 10));
  const limit = Math.min(50, parseInt(req.query.limit || "20", 10));
  const cutoff = new Date(Date.now() - hours * 3600 * 1000);

  const titles = await Titles.find({ createdAt: { $gte: cutoff } })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray();

  res.json({ titles, cutoff });
});

// --- Genre shelves (מדפים לפי ז'אנר, מחריג חדש) ---
app.get("/api/genres/shelves", requireAuth, async (req, res) => {
  const minHours = Math.max(
    1,
    parseInt(req.query.minHours || "1", 10)
  ); // מחריג שעה אחרונה
  const perGenre = Math.min(20, parseInt(req.query.limit || "12", 10));
  const cutoff = new Date(Date.now() - minHours * 3600 * 1000);

  const rows = await Titles.aggregate([
    { $match: { createdAt: { $lt: cutoff }, genres: { $exists: true, $ne: [] } } },
    { $unwind: "$genres" },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $group: { _id: "$genres", titles: { $push: "$$ROOT" } },
    },
    {
      $project: {
        _id: 0,
        name: "$_id",
        titles: { $slice: ["$titles", perGenre] },
      },
    },
    { $sort: { name: 1 } },
  ]).toArray();

  res.json({ genres: rows, cutoff });
});
// מדפים לפי ז׳אנר (ex: כל ז׳אנר עד 12 פריטים, לא כולל "חדש" של השעה האחרונה)
app.get("/api/genres/rows", requireAuth, async (req, res) => {
  const perGenre = Math.min(24, parseInt(req.query.limit || "12", 10));
  const excludeHours = Math.max(
    0,
    parseInt(req.query.exclude_hours || "1", 10)
  );
  const cutoff = new Date(Date.now() - excludeHours * 3600 * 1000);

  // חשוב: אינדקסים טובים
  await Titles.createIndex({ createdAt: -1 }).catch(() => {});
  await Titles.createIndex({ genres: 1 }).catch(() => {});

  const rows = await Titles.aggregate([
    {
      $match: {
        createdAt: { $lt: cutoff },
        genres: { $exists: true, $ne: [] },
      },
    },
    { $unwind: "$genres" },

    // מאחדים Action ו-ACTION: נאגד לפי lowercase
    { $addFields: { _gLower: { $toLower: "$genres" } } },

    { $sort: { createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: "$_gLower",
        displayName: { $first: "$genres" }, // ניקח את הצורה הראשונה להצגה
        titles: { $push: "$$ROOT" },
      },
    },
    {
      $project: {
        _id: 0,
        name: "$displayName",
        titles: { $slice: ["$titles", perGenre] },
      },
    },
    { $sort: { name: 1 } },
  ]).toArray();

  res.json({ genres: rows, cutoff });
});

// ----- Serve from GridFS -----
app.get("/img/:id", async (req, res) => {
  try {
    const _id = new ObjectId(req.params.id);
    const files = await imageBucket.find({ _id }).toArray();
    if (!files.length) return res.status(404).end();
    const file = files[0];
    res.setHeader("Content-Type", file.contentType || "image/jpeg");
    res.setHeader("Accept-Ranges", "bytes");
    const stream = imageBucket.openDownloadStream(_id);
    stream.on("error", () => {
      if (!res.headersSent) res.status(404).end();
    });
    stream.pipe(res);
  } catch {
    res.status(404).end();
  }
});

// וידאו + Range בטוח (מונע start>end)
// === Serve video from GridFS (with robust Range handling) ===
app.get("/media/:id", async (req, res) => {
  try {
    const _id = new ObjectId(req.params.id);
    const files = await videoBucket.find({ _id }).toArray();
    if (!files.length) return res.status(404).end();

    const file = files[0];
    const size = Number(file.length || 0);
    const contentType = file.contentType || "video/mp4";
    res.setHeader("Accept-Ranges", "bytes");

    const range = req.headers.range;

    // אין קובץ (0 בתים)
    if (!size) {
      // אם התבקש Range – אין מה לספק
      if (range) {
        res.status(416).setHeader("Content-Range", "bytes */0").end();
        return;
      }
      res
        .status(200)
        .setHeader("Content-Type", contentType)
        .setHeader("Content-Length", "0")
        .end();
      return;
    }

    if (range) {
      // דוגמה: bytes=13271040-
      const m = /bytes=(\d+)-(\d+)?/.exec(range);
      let start = m ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : size - 1;

      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end >= size) end = size - 1;

      // אם הטווח לא חוקי – נחזיר 416 תקני
      if (start > end || start >= size) {
        res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
        return;
      }

      res
        .status(206)
        .setHeader("Content-Range", `bytes ${start}-${end}/${size}`)
        .setHeader("Content-Length", String(end - start + 1))
        .setHeader("Content-Type", contentType);

      const stream = videoBucket.openDownloadStream(_id, {
        start,
        end: end + 1,
      });
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    } else {
      // בלי Range – נחזיר את כל הקובץ
      res
        .status(200)
        .setHeader("Content-Type", contentType)
        .setHeader("Content-Length", String(size));
      const stream = videoBucket.openDownloadStream(_id);
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    }
  } catch {
    res.status(404).end();
  }
});

// ----- Pages routing -----
app.get("/", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "landing.html"));
});

app.get("/profiles", (req, res) => {
  if (!req.user) return res.redirect("/login.html");
  return res.sendFile(path.join(__dirname, "public", "profiles.html"));
});

app.get("/app", (req, res) => {
  if (!req.user) return res.redirect("/");
  if (!req.session?.selectedProfileId) return res.redirect("/profiles");
  return res.sendFile(path.join(__dirname, "public", "catalog.html"));
});

app.get("/landing.html", (req, res) => res.redirect("/"));
app.get("*", (req, res) => res.redirect("/"));

// ----- Start -----
app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});
