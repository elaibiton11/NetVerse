import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/streaming_catalog_min";
const client = new MongoClient(uri);
await client.connect();
const db = client.db();
const Titles = db.collection("titles");

await Titles.deleteMany({});
await Titles.insertMany([
  {
    kind: "movie",
    name: "Sample Movie",
    description: "Demo movie for the catalog",
    year: 2024,
    genres: ["Drama"],
    posterPath: "/img/poster1.jpg",
    videoPath: "/media/sample.mp4",
    createdAt: new Date()
  },
  {
    kind: "movie",
    name: "Ocean Vibes",
    description: "Relaxing ocean scenes",
    year: 2023,
    genres: ["Nature"],
    posterPath: "/img/poster2.jpg",
    videoPath: "/media/sample.mp4",
    createdAt: new Date()
  }
]);
console.log("Seeded sample titles");
await client.close();
