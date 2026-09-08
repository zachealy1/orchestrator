import Database from "@tauri-apps/plugin-sql";

const DATABASE_URL = "sqlite:app.db";

export class FrontendDatabase {
  private connection: Promise<Database> | null = null;
  private pendingWrites = new Set<Promise<unknown>>();

  get() {
    this.connection ??= Database.load(DATABASE_URL).then((database) => {
      const execute = database.execute.bind(database);
      database.execute = (...args) => {
        const write = execute(...args);
        this.pendingWrites.add(write);
        void write.then(() => this.pendingWrites.delete(write), () => this.pendingWrites.delete(write));
        return write;
      };
      return database;
    });
    return this.connection;
  }

  async selectOne<T>(query: string, bindValues: unknown[] = []) {
    const database = await this.get();
    const rows = await database.select<T[]>(query, bindValues);
    return rows[0] ?? null;
  }

  async flush() {
    while (this.pendingWrites.size > 0) await Promise.all([...this.pendingWrites]);
  }

  dispose() {
    const connection = this.connection;
    this.connection = null;
    if (connection) {
      void connection.then((database) => database.close()).catch(() => undefined);
    }
  }
}
