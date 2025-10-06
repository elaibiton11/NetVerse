// migrate_profiles.js
import { MongoClient, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/streaming_catalog_min";

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  const Users = db.collection("users");
  const WatchHistory = db.collection("watch_history");
    const Likes = db.collection("likes");
  
  let updatedUsers = 0;
  let fixedProfiles = 0;
  let cappedProfiles = 0;
  let updatedHistory = 0;

  // 1) ודא שלכל משתמש יש profiles תקין (0<length<=5)
  const cursor = Users.find({});
  while (await cursor.hasNext()) {
    const user = await cursor.next();
    const profiles = Array.isArray(user.profiles) ? user.profiles : [];
    let mutated = false;

    // אם אין פרופילים — צור ברירת מחדל
    if (profiles.length === 0) {
      const def = {
        _id: new ObjectId().toString(),
        name: (user.fullName?.split(" ")[0] || "ראשי"),
        avatarColor: "#777777",
      };
      profiles.push(def);
      mutated = true;
      fixedProfiles++;
    }

    // אם יש יותר מ-5 — חתוך ל-5 הראשונים
    if (profiles.length > 5) {
      profiles.splice(5);
      mutated = true;
      cappedProfiles++;
    }

    if (mutated) {
      await Users.updateOne({ _id: user._id }, { $set: { profiles } });
      updatedUsers++;
    }

    // 2) השלם profileId ברשומות watch_history שחסרות אותו
    const primaryProfileId = String(profiles[0]._id);
    const res = await WatchHistory.updateMany(
      { userId: String(user._id), $or: [{ profileId: { $exists: false } }, { profileId: "" }, { profileId: null }] },
      { $set: { profileId: primaryProfileId } }
    );
    updatedHistory += res.modifiedCount;
  }

  // 3) אינדקס ייחודי נכון ל-watch_history: (userId, profileId, titleId)
  // נסה להפיל אינדקסים ישנים אם קיימים, ואז ליצור אינדקס נכון
  try {
    const idxs = await WatchHistory.indexes();
    for (const idx of idxs) {
      // אינדקס ישן אפשרי: { userId: 1, titleId: 1 }
      const key = JSON.stringify(idx.key);
      if (key === JSON.stringify({ userId: 1, titleId: 1 })) {
        await WatchHistory.dropIndex(idx.name);
      }
    }
  } catch (e) {
    // לא קריטי
  }
  await WatchHistory.createIndex({ userId: 1, profileId: 1, titleId: 1 }, { unique: true });
  await Likes.createIndex({ userId: 1, profileId: 1, titleId: 1 }, { unique: true });


  console.log("Migration done:");
  console.log({ updatedUsers, fixedProfiles, cappedProfiles, updatedHistory });

  await client.close();
  process.exit(0);
})();
