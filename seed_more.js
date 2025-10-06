// node seed_more.js
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/streaming_catalog_min";

const samples = [
  {
    kind: "movie",
    name: "City Walk (Short)",
    description: "סיור עירוני קצר.",
    year: 2024,
    genres: ["Nature", "Drama"],
    posterPath: "/public/img/shorts/CsinoRoyal.JPG",
    videoPath: "/public/media/shorts/CsinoRoyal.mp4",
    createdAt: new Date()
  },
  {
    kind: "movie",
    name: "Surf Vibes (Short)",
    description: "גלים, חוף ומוזיקה.",
    year: 2024,
    genres: ["Action", "Nature"],
    posterPath: "/public/img/shorts/CsinoRoyal.JPG",
    videoPath: "/public/media/shorts/CsinoRoyal.mp4",
    createdAt: new Date()
  },
  {
    kind: "movie",
    name: "Street Comedy Bits",
    description: "קטעי הומור קצרים ברחוב.",
    year: 2024,
    genres: ["Comedy"],
    posterPath: "/public/img/shorts/CsinoRoyal.JPG",
    videoPath: "/public/media/shorts/CsinoRoyal.mp4",
    createdAt: new Date()
  },
  {
    kind: "movie",
    name: "Action Teaser",
    description: "טיזר אקשן קצר.",
    year: 2025,
    genres: ["Action"],
    posterPath: "/public/img/shorts/CsinoRoyal.JPG",
    videoPath: "/public/media/shorts/CsinoRoyal.mp4",
    createdAt: new Date()
  }
];

async function run() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  const Titles = db.collection("titles");
  await Titles.insertMany(samples);
  console.log("Inserted", samples.length, "titles");
  await client.close();
}

run().catch(e => { console.error(e); process.exit(1); });
