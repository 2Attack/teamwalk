import { type NeonQueryFunction, neon, neonConfig } from '@neondatabase/serverless';
import { type NeonHttpDatabase, drizzle } from 'drizzle-orm/neon-http';

import * as schema from './schema';

export type Db = NeonHttpDatabase<typeof schema>;

let cachedSql: NeonQueryFunction<false, false> | null = null;
let cachedDb: Db | null = null;

function connect(): { sql: NeonQueryFunction<false, false>; db: Db } {
  if (cachedSql && cachedDb) return { sql: cachedSql, db: cachedDb };

  const url = process.env.DATABASE_URL;
  if (!url) {
    // Fail fast, но в момент запроса, а не импорта модуля: иначе `next build`
    // падал бы при сборе метаданных роутов на машине без строки подключения.
    throw new Error('DATABASE_URL is not set. See .env.example');
  }

  // Локальная разработка без облачной БД: Postgres в docker + HTTP-прокси Neon
  // на `db.localtest.me:4444`. В проде хост другой и ветка не срабатывает.
  if (url.includes('localtest.me')) {
    neonConfig.fetchEndpoint = (host) =>
      host.endsWith('localtest.me') ? `http://${host}:4444/sql` : `https://${host}/sql`;
  }

  /**
   * HTTP-драйвер Neon: в serverless нет долгоживущих соединений (п. 3.1 ТЗ),
   * поэтому пул `pg` здесь противопоказан.
   */
  cachedSql = neon(url);
  cachedDb = drizzle(cachedSql, { schema });
  return { sql: cachedSql, db: cachedDb };
}

/** Ленивый прокси: соединение поднимается на первом обращении. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const value = Reflect.get(connect().db as object, prop, receiver);
    return typeof value === 'function' ? value.bind(connect().db) : value;
  },
});

export const sqlClient: NeonQueryFunction<false, false> = new Proxy(
  (() => undefined) as unknown as NeonQueryFunction<false, false>,
  {
    apply(_target, _thisArg, args: unknown[]) {
      return (connect().sql as unknown as (...a: unknown[]) => unknown)(...args);
    },
    get(_target, prop) {
      const sql = connect().sql as unknown as Record<string | symbol, unknown>;
      const value = sql[prop];
      return typeof value === 'function' ? value.bind(sql) : value;
    },
  },
);

export { schema };
