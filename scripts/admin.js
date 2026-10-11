import { randomBytes, scryptSync } from "node:crypto";
import { openDb } from "../db.js";
const email = process.env.ADMIN_EMAIL,
  password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12)
  throw Error(
    "Stel ADMIN_EMAIL en ADMIN_PASSWORD (minimaal 12 tekens) veilig in via omgevingsvariabelen.",
  );
const salt = randomBytes(16).toString("hex");
const db = await openDb();
await db
  .prepare("INSERT OR REPLACE INTO admins VALUES(?,?,?)")
  .run(
    email.toLowerCase(),
    salt,
    scryptSync(password, salt, 64).toString("hex"),
  );
await db.prepare("DELETE FROM sessions WHERE email=?").run(email.toLowerCase());
db.close();
console.log("Beheeraccount opgeslagen; bestaande sessies ingetrokken.");
