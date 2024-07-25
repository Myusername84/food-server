import { MongoClient } from "mongodb";
const client = new MongoClient(process.env.MONGODB_URI);

export default async function connect() {
  await client.connect();
  const db = client.db("foodApplication");

  return db;
}
