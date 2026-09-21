import Fastify from "fastify";
import "dotenv/config";
import db from "./db.js";
import { registerWebhook } from "./webhook.js";

const app = Fastify({
  logger: true,
});

await app.register(import("fastify-raw-body"), {
  field: "rawBody",
  global: false,
  encoding: "utf8",
  runFirst: true,
});

app.get("/", async () => {
  return {
    ok: true,
    service: "cortinas-ai",
  };
});

app.get("/images", async () => {
  return db
    .prepare(`
      SELECT *
      FROM images
      ORDER BY id DESC
    `)
    .all();
});

await registerWebhook(app);

const port = Number(process.env.PORT ?? 3000);

await app.listen({
  port,
  host: "0.0.0.0",
});

console.log(`🚀 Servidor iniciado en http://localhost:${port}`);