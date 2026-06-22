import Database from "@tauri-apps/plugin-sql";

const DATABASE_URL = "sqlite:app.db";

export type Note = {
  id: number;
  body: string;
  created_at: string;
};

let database: Promise<Database> | null = null;

function getDatabase() {
  database ??= Database.load(DATABASE_URL);
  return database;
}

export async function listNotes() {
  const db = await getDatabase();
  return db.select<Note[]>(
    "SELECT id, body, created_at FROM notes ORDER BY id DESC LIMIT 20",
  );
}

export async function addNote(body: string) {
  const db = await getDatabase();
  await db.execute("INSERT INTO notes (body) VALUES ($1)", [body]);
  return listNotes();
}
