import { readFileSync } from "node:fs";
import { openDb } from "../db.js";
const file = process.argv[2];
if (!file)
  throw Error("Gebruik: node scripts/import-products.js /pad/catalogus.json");
const rows = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(rows) || !rows.length)
  throw Error("Verwacht een niet-lege lijst producten.");
for (const p of rows) {
  if (
    typeof p.name !== "string" ||
    !p.name.trim() ||
    typeof p.category !== "string" ||
    !Number.isSafeInteger(p.price) ||
    p.price < 0 ||
    !Number.isSafeInteger(p.stock) ||
    p.stock < 0
  )
    throw Error(
      "Elk product vereist name, category, price (eurocenten) en stock.",
    );
  if (
    p.image &&
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.image)
  )
    throw Error("Productfoto moet PNG/JPEG/WebP data-URL zijn.");
}
const db = await openDb();
try {
  await db.transaction(async (db) => {
    const insert = db.prepare(
      "INSERT INTO products(name,category,description,price,stock,size,color,active,image) VALUES(?,?,?,?,?,?,?,?,?)",
    );
    const update = db.prepare(
      "UPDATE products SET category=?,description=?,price=?,stock=?,color=?,image=? WHERE name=? AND size=?",
    );
    for (const p of rows) {
      const size = p.size || "",
        color = /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : "#d3c6af";
      if (
        await db
          .prepare("SELECT id FROM products WHERE name=? AND size=?")
          .get(p.name, size)
      )
        await update.run(
          p.category,
          p.description || "",
          p.price,
          p.stock,
          color,
          p.image || "",
          p.name,
          size,
        );
      else
        await insert.run(
          p.name,
          p.category,
          p.description || "",
          p.price,
          p.stock,
          size,
          color,
          1,
          p.image || "",
        );
    }
  });
  console.log(
    `${rows.length} producten geïmporteerd/bijgewerkt. Bestaande overige producten blijven behouden.`,
  );
} finally {
  db.close();
}
