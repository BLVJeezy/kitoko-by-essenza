import { demoProducts } from "../demo-products.js";

// The initial deployment can show the design without pretending writes persist.
// Once Turso is connected, all requests use the real durable backend.
export default async function handler(req, res) {
  if (process.env.VERCEL && !process.env.TURSO_DATABASE_URL) {
    const path = new URL(req.url, "https://kitoko.invalid").pathname;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "GET" && path === "/api/config")
      return res.end(
        JSON.stringify({
          demo: true,
          checkoutAvailable: false,
          pickupLocations: ["Tongeren", "Maasmechelen"],
        }),
      );
    if (req.method === "GET" && path === "/api/products")
      return res.end(JSON.stringify(demoProducts));
    res.statusCode = 503;
    return res.end(
      JSON.stringify({
        error:
          "Dit is een demonstratie. Bestellen en beheer zijn nog niet beschikbaar.",
      }),
    );
  }
  const { default: app } = await import("../app.js");
  return app(req, res);
}
