import { demoRows } from "./demo-products.js";
import { readFile } from "node:fs/promises";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { openDb } from "./db.js";
const db = await openDb();
const demo = process.env.LIVE_CHECKOUT !== "true";
await db.transaction(async (db) => {
  if (!(await db.prepare("SELECT count(*) n FROM products").get()).n && demo) {
    const put = db.prepare(
      "INSERT INTO products(name,category,description,price,stock,size,color) VALUES(?,?,?,?,?,?,?)",
    );
    for (const p of demoRows) await put.run(...p);
  }
});
const hash = (t) => createHash("sha256").update(t).digest("hex");
const fail = (message, status = 400) =>
  Object.assign(new Error(message), {
    status,
  });
async function body(req) {
  // Vercel may parse the payload before invoking a Node function.
  if (req.body !== undefined) {
    const raw = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > 3000000) throw fail("Aanvraag te groot", 413);
    try {
      return JSON.parse(raw);
    } catch {
      throw fail("Ongeldige JSON");
    }
  }
  let s = "";
  for await (const c of req) {
    s += c;
    if (s.length > 3000000) throw fail("Aanvraag te groot", 413);
  }
  try {
    return JSON.parse(s || "{}");
  } catch {
    throw fail("Ongeldige JSON");
  }
}
async function admin(req) {
  const token = req.headers.cookie?.match(/(?:^|; )session=([^;]+)/)?.[1];
  if (
    !token ||
    !(await db
      .prepare("SELECT email FROM sessions WHERE token=? AND expires>?")
      .get(hash(token), Date.now()))
  )
    throw fail("Log eerst in", 401);
}
export default async function handler(req, res) {
  const send = (data, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
    });
    res.end(JSON.stringify(data));
  };
  try {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const path = new URL(req.url, "http://localhost").pathname;
    if (path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method)) {
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        throw fail("Ongeldige herkomst", 403);
      if (!req.headers["content-type"]?.startsWith("application/json"))
        throw fail("JSON vereist", 415);
    }
    if (path === "/api/config")
      return send({
        demo,
        checkoutAvailable: demo,
        pickupLocations: ["Tongeren", "Maasmechelen"],
      });
    if (path === "/api/products" && req.method === "GET")
      return send(
        await db.prepare("SELECT * FROM products WHERE active=1").all(),
      );
    if (path === "/api/login" && req.method === "POST") {
      const b = await body(req);
      const now = Date.now();
      const key = hash(String(b.email).toLowerCase());
      const attemptCount = await db.transaction(async (db) => {
        await db
          .prepare("DELETE FROM login_attempts WHERE started<?")
          .run(now - 900000);
        await db
          .prepare(
            "INSERT INTO login_attempts(key,started,attempts) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1",
          )
          .run(key, now);
        return (
          await db
            .prepare("SELECT attempts FROM login_attempts WHERE key=?")
            .get(key)
        ).attempts;
      });
      if (attemptCount > 10)
        throw fail("Te veel pogingen. Probeer later opnieuw.", 429);
      const user = await db
        .prepare("SELECT * FROM admins WHERE email=?")
        .get(String(b.email).toLowerCase());
      const actual = scryptSync(String(b.password), user?.salt || "dummy", 64);
      if (!user || !timingSafeEqual(actual, Buffer.from(user.hash, "hex")))
        throw fail("Onjuiste inloggegevens", 401);
      const token = randomBytes(32).toString("hex");
      await db
        .prepare("INSERT INTO sessions VALUES(?,?,?)")
        .run(hash(token), user.email, now + 28800000);
      res.setHeader(
        "Set-Cookie",
        `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
      );
      return send({
        ok: true,
      });
    }
    if (path === "/api/logout" && req.method === "POST") {
      const token = req.headers.cookie?.match(/(?:^|; )session=([^;]+)/)?.[1];
      if (token)
        await db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
      res.setHeader(
        "Set-Cookie",
        "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      );
      return send({
        ok: true,
      });
    }
    if (path.startsWith("/api/admin/")) await admin(req);
    if (path === "/api/admin/products" && req.method === "GET")
      return send(await db.prepare("SELECT * FROM products").all());
    if (path === "/api/admin/products" && req.method === "POST") {
      const b = await body(req);
      if (
        !b.name?.trim() ||
        !b.category?.trim() ||
        !Number.isSafeInteger(b.price) ||
        b.price < 0 ||
        !Number.isSafeInteger(b.stock) ||
        b.stock < 0 ||
        !/^#[0-9a-f]{6}$/i.test(b.color || "")
      )
        throw fail("Controleer naam, categorie, prijs, voorraad en kleur.");
      const image = String(b.image || "");
      if (
        image &&
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)
      )
        throw fail("Gebruik een PNG-, JPEG- of WebP-foto.");
      const values = [
        b.name.slice(0, 120),
        b.category.slice(0, 80),
        String(b.description || "").slice(0, 5000),
        b.price,
        b.stock,
        String(b.size || "").slice(0, 80),
        b.color,
        b.active ? 1 : 0,
        image,
      ];
      if (b.id) {
        const r = await db
          .prepare(
            "UPDATE products SET name=?,category=?,description=?,price=?,stock=?,size=?,color=?,active=?,image=? WHERE id=?",
          )
          .run(...values, b.id);
        if (!r.changes) throw fail("Product niet gevonden", 404);
      } else
        await db
          .prepare(
            "INSERT INTO products(name,category,description,price,stock,size,color,active,image) VALUES(?,?,?,?,?,?,?,?,?)",
          )
          .run(...values);
      return send({
        ok: true,
      });
    }
    if (path === "/api/orders" && req.method === "POST") {
      if (!demo) throw fail("Live afrekenen is nog niet geconfigureerd.", 503);
      const b = await body(req);
      if (
        !b.customer ||
        !["name", "email", "pickup"].every(
          (k) =>
            typeof b.customer[k] === "string" &&
            b.customer[k].trim() &&
            b.customer[k].length < 250,
        ) ||
        !/^\S+@\S+\.\S+$/.test(b.customer.email) ||
        !["Tongeren", "Maasmechelen"].includes(b.customer.pickup)
      )
        throw fail("Vul je contactgegevens en afhaalplaats correct in.");
      if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50)
        throw fail("Je winkelwagen is leeg of te groot.");
      const quantities = new Map();
      for (const i of b.items) {
        if (
          !Number.isSafeInteger(i.id) ||
          !Number.isSafeInteger(i.quantity) ||
          i.quantity < 1 ||
          i.quantity > 99
        )
          throw fail("Ongeldig aantal");
        quantities.set(i.id, (quantities.get(i.id) || 0) + i.quantity);
      }
      const result = await db.transaction(async (db) => {
        let total = 0;
        const items = [];
        for (const [id, quantity] of quantities) {
          const p = await db
            .prepare("SELECT * FROM products WHERE id=? AND active=1")
            .get(id);
          if (!p || p.stock < quantity)
            throw fail("Onvoldoende voorraad. Vernieuw je winkelwagen.");
          total += p.price * quantity;
          items.push({
            id,
            name: p.name,
            quantity,
            price: p.price,
          });
          await db
            .prepare("UPDATE products SET stock=stock-? WHERE id=?")
            .run(quantity, id);
        }
        const id = randomUUID();
        await db
          .prepare(
            "INSERT INTO orders(id,created,customer,items,total) VALUES(?,?,?,?,?)",
          )
          .run(
            id,
            new Date().toISOString(),
            JSON.stringify(b.customer),
            JSON.stringify(items),
            total,
          );
        return {
          id,
          total,
          demo: true,
        };
      });
      return send(result, 201);
    }
    if (path === "/api/admin/orders" && req.method === "GET")
      return send(
        (
          await db.prepare("SELECT * FROM orders ORDER BY created DESC").all()
        ).map((o) => ({
          ...o,
          customer: JSON.parse(o.customer),
          items: JSON.parse(o.items),
        })),
      );
    if (path === "/api/admin/orders" && req.method === "POST") {
      const b = await body(req);
      if (
        !["unpaid", "paid", "refunded"].includes(b.payment) ||
        !["unfulfilled", "ready", "collected", "cancelled"].includes(b.shipping)
      )
        throw fail("Ongeldige status");
      await db.transaction(async (db) => {
        const order = await db
          .prepare("SELECT * FROM orders WHERE id=?")
          .get(b.id);
        if (!order) throw fail("Bestelling niet gevonden", 404);
        if (order.shipping === "cancelled" && b.shipping !== "cancelled")
          throw fail("Een geannuleerde bestelling kan niet heropend worden.");
        let restocked = order.restocked;
        if (b.shipping === "cancelled" && !restocked) {
          if (order.shipping === "collected")
            throw fail(
              "Een afgehaalde bestelling kan niet geannuleerd worden.",
            );
          for (const item of JSON.parse(order.items))
            await db
              .prepare("UPDATE products SET stock=stock+? WHERE id=?")
              .run(item.quantity, item.id);
          restocked = 1;
        }
        await db
          .prepare(
            "UPDATE orders SET payment=?,shipping=?,tracking=?,restocked=? WHERE id=?",
          )
          .run(
            b.payment,
            b.shipping,
            String(b.tracking || "").slice(0, 300),
            restocked,
            b.id,
          );
      });
      return send({
        ok: true,
      });
    }
    if (path.startsWith("/api/")) throw fail("Niet gevonden", 404);
    const files = {
      "/": "index.html",
      "/admin": "admin.html",
      "/app.js": "app.js",
      "/admin.js": "admin.js",
      "/style.css": "style.css",
    };
    const file = files[path];
    if (!file) throw fail("Niet gevonden", 404);
    const content = await readFile(new URL(`public/${file}`, import.meta.url));
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html; charset=utf-8",
    );
    res.end(content);
  } catch (e) {
    if (!e.status) console.error(e);
    send(
      {
        error: e.status ? e.message : "Er ging iets mis",
      },
      e.status || 500,
    );
  }
}
