import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Local development uses a file; Vercel must use a durable remote Turso database.
export async function openDb(
  path = process.env.DB_PATH || "data/kitoko.sqlite",
) {
  // An explicit file path is always local, so tests cannot touch a configured remote database.
  const remote = arguments.length ? undefined : process.env.TURSO_DATABASE_URL;
  if (process.env.VERCEL && !remote)
    throw new Error(
      "TURSO_DATABASE_URL is required on Vercel; ephemeral SQLite is not supported.",
    );
  if (remote && !/^(libsql|https):\/\//.test(remote))
    throw new Error("TURSO_DATABASE_URL must use libsql:// or https://.");
  if (!remote) mkdirSync(dirname(path), { recursive: true });
  const { createClient } = await import(
    remote ? "@libsql/client/web" : "@libsql/client"
  );
  const client = createClient({
    url: remote || pathToFileURL(resolve(path)).href,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  let tail = Promise.resolve();
  const lock = (fn) => {
    const next = tail.then(fn);
    tail = next.catch(() => {});
    return next;
  };
  function wrap(execute) {
    return {
      prepare(sql) {
        const query = (args) => execute({ sql, args });
        return {
          async all(...args) {
            return (await query(args)).rows.map((row) => ({ ...row }));
          },
          async get(...args) {
            const rows = (await query(args)).rows;
            return rows.length ? { ...rows[0] } : undefined;
          },
          async run(...args) {
            const r = await query(args);
            return {
              changes: r.rowsAffected,
              lastInsertRowid: r.lastInsertRowid,
            };
          },
        };
      },
    };
  }
  const db = {
    ...wrap((statement) => lock(() => client.execute(statement))),
    async transaction(fn) {
      return lock(async () => {
        const tx = await client.transaction("write");
        try {
          const result = await fn(wrap((statement) => tx.execute(statement)));
          await tx.commit();
          return result;
        } catch (error) {
          await tx.rollback();
          throw error;
        } finally {
          tx.close();
        }
      });
    },
    close() {
      client.close();
    },
  };
  await db.transaction(async (tx) => {
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),stock INTEGER NOT NULL CHECK(stock>=0),size TEXT NOT NULL,color TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,image TEXT NOT NULL DEFAULT '')`,
      `CREATE TABLE IF NOT EXISTS admins(email TEXT PRIMARY KEY,salt TEXT NOT NULL,hash TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,created TEXT NOT NULL,customer TEXT NOT NULL,items TEXT NOT NULL,total INTEGER NOT NULL,payment TEXT NOT NULL DEFAULT 'unpaid',shipping TEXT NOT NULL DEFAULT 'unfulfilled',tracking TEXT NOT NULL DEFAULT '',restocked INTEGER NOT NULL DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY,started INTEGER NOT NULL,attempts INTEGER NOT NULL)`,
    ])
      await tx.prepare(sql).run();
    if (
      !(await tx.prepare("PRAGMA table_info(products)").all()).some(
        (c) => c.name === "image",
      )
    )
      await tx
        .prepare(
          "ALTER TABLE products ADD COLUMN image TEXT NOT NULL DEFAULT ''",
        )
        .run();
    if (
      !(await tx.prepare("PRAGMA table_info(orders)").all()).some(
        (c) => c.name === "restocked",
      )
    )
      await tx
        .prepare(
          "ALTER TABLE orders ADD COLUMN restocked INTEGER NOT NULL DEFAULT 0",
        )
        .run();
  });
  return db;
}
