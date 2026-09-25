import Fastify from "fastify";
import "dotenv/config";
import db from "./db.js";
import { registerWebhook } from "./webhook.js";
import { startWorker } from "./worker.js";

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

app.get("/health", async () => {
  return {
    ok: true,
    uptime: process.uptime(),
    pending: (db
      .prepare(`
        SELECT COUNT(*) AS n
        FROM images
        WHERE status = 'pending'
      `)
      .get() as { n: number }).n,
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

startWorker();

const port = Number(process.env.PORT ?? 3000);

await app.listen({
  port,
  host: "0.0.0.0",
});

console.log(`🚀 Servidor iniciado en http://localhost:${port}`);