import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __db?: Db; __sql?: postgres.Sql };

function databaseUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

/** One shared client per process. `prepare: false` keeps it safe behind a pooler. */
export function sql(): postgres.Sql {
  globalForDb.__sql ??= postgres(databaseUrl(), {
    prepare: false,
    max: 5,
    idle_timeout: 20,
  });
  return globalForDb.__sql;
}

export function db(): Db {
  globalForDb.__db ??= drizzle(sql(), { schema });
  return globalForDb.__db;
}

export { schema };
