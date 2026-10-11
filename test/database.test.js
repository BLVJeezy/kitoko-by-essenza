import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { openDb } from "../db.js";

test("database survives connection restart; failed transactions roll back", async () => {
  const dir = mkdtempSync("/tmp/kitoko-db-");
  let db;
  try {
    db = await openDb(dir + "/test.sqlite");
    await db
      .prepare("INSERT INTO admins VALUES(?,?,?)")
      .run("persistent@example.com", "salt", "hash");
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.prepare("DELETE FROM admins").run();
        throw Error("rollback");
      }),
    );
    db.close();
    db = await openDb(dir + "/test.sqlite");
    assert.equal(
      (await db.prepare("SELECT email FROM admins").get()).email,
      "persistent@example.com",
    );
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("Vercel refuses to use an ephemeral local database", () => {
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          "import {openDb} from './db.js'; await openDb();",
        ],
        {
          env: { ...process.env, VERCEL: "1", TURSO_DATABASE_URL: "" },
          stdio: "pipe",
        },
      ),
    (e) => e.stderr.toString().includes("TURSO_DATABASE_URL is required"),
  );
});
