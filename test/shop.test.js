import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
const dir = mkdtempSync(tmpdir() + "/kitoko-test-"),
  port = String(34000 + Math.floor(Math.random() * 10000));
const env = {
  ...process.env,
  VERCEL: "",
  TURSO_DATABASE_URL: "",
  TURSO_AUTH_TOKEN: "",
  DB_PATH: dir + "/test.sqlite",
  PORT: port,
  ADMIN_EMAIL: "test@example.com",
  ADMIN_PASSWORD: "test-only-password-long",
  LIVE_CHECKOUT: "false",
};
let child, cookie;
const request = async (path, data, auth = false) => {
  const r = await fetch("http://127.0.0.1:" + port + "/api/" + path, {
    method: data ? "POST" : "GET",
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(auth ? { cookie } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie"),
  };
};
before(async () => {
  execFileSync(process.execPath, ["scripts/admin.js"], { env });
  child = spawn(process.execPath, ["server.js"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    child.stdout.once("data", resolve);
    child.once("error", reject);
    child.once("exit", () => reject(Error("Startup failed")));
  });
});
after(async () => {
  if (child) {
    const exited = new Promise((r) => child.once("exit", r));
    child.kill();
    await exited;
  }
  rmSync(dir, { recursive: true, force: true });
});
test("catalog, authentication, product edits, pickup order and inventory transaction", async () => {
  assert.equal((await request("admin/orders")).status, 401);
  assert.equal(
    (await request("login", { email: env.ADMIN_EMAIL, password: "wrong" }))
      .status,
    401,
  );
  const login = await request("login", {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  });
  assert.equal(login.status, 200);
  cookie = login.cookie.split(";")[0];
  const products = (await request("products")).data;
  assert.equal(products.length, 4);
  const p = products[0];
  assert.equal(
    (await request("admin/products", { ...p, stock: 5 }, true)).status,
    200,
  );
  const customer = {
    name: "Test klant",
    email: "klant@example.com",
    pickup: "Tongeren",
  };
  assert.equal(
    (
      await request("orders", {
        customer: { ...customer, pickup: "Amsterdam" },
        items: [{ id: p.id, quantity: 1 }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("orders", {
        customer,
        items: [
          { id: p.id, quantity: 3 },
          { id: p.id, quantity: 3 },
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("products")).data.find((x) => x.id === p.id).stock,
    5,
  );
  const order = await request("orders", {
    customer,
    items: [{ id: p.id, quantity: 2 }],
    total: 1,
  });
  assert.equal(order.status, 201);
  assert.equal(order.data.total, p.price * 2);
  assert.equal(
    (await request("products")).data.find((x) => x.id === p.id).stock,
    3,
  );
  assert.equal(
    (
      await request(
        "admin/orders",
        { id: order.data.id, payment: "paid", shipping: "ready" },
        true,
      )
    ).status,
    200,
  );
  const list = (await request("admin/orders", null, true)).data;
  assert.equal(list[0].shipping, "ready");
  assert.equal(list[0].payment, "paid");
  assert.equal(list[0].customer.pickup, "Tongeren");
  assert.equal(
    (
      await request(
        "admin/orders",
        { id: order.data.id, payment: "unpaid", shipping: "cancelled" },
        true,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request("products")).data.find((x) => x.id === p.id).stock,
    5,
  );
  await request(
    "admin/orders",
    { id: order.data.id, payment: "unpaid", shipping: "cancelled" },
    true,
  );
  assert.equal(
    (await request("products")).data.find((x) => x.id === p.id).stock,
    5,
  );
  assert.equal(
    (
      await request(
        "admin/orders",
        { id: order.data.id, payment: "unpaid", shipping: "ready" },
        true,
      )
    ).status,
    400,
  );
  const concurrent = await Promise.all([
    request("orders", { customer, items: [{ id: p.id, quantity: 4 }] }),
    request("orders", { customer, items: [{ id: p.id, quantity: 4 }] }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 400]);
  assert.equal(
    (await request("products")).data.find((x) => x.id === p.id).stock,
    1,
  );
  await request("logout", {}, true);
  assert.equal((await request("admin/orders", null, true)).status, 401);
});
