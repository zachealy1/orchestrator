import Database from "@tauri-apps/plugin-sql";

const DATABASE_URL = "sqlite:app.db";

export class FrontendDatabase {
  private connection: Promise<Database> | null = null;

  get() {
    this.connection ??= Database.load(DATABASE_URL);
    return this.connection;
  }

  async selectOne<T>(query: string, bindValues: unknown[] = []) {
    const database = await this.get();
    const rows = await database.select<T[]>(query, bindValues);
    return rows[0] ?? null;
  }

  dispose() {
    const connection = this.connection;
    this.connection = null;
    if (connection) {
      void connection.then((database) => database.close()).catch(() => undefined);
    }
  }
}
