import type { FastifyInstance } from "fastify";
import crypto from "crypto";
import db from "./db.js";
import {
  processPendingImages,
  BASE_IMAGE_PUBLIC_ID,
} from "./worker.js";

const GENERATED_PREFIX = "cortinas/generadas/";
const BASE_FOLDER_PREFIX = "cortinas/base/";

function verifyCloudinarySignature(
  rawBody: string,
  timestamp: string,
  signature: string
): boolean {
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!apiSecret) {
    throw new Error("CLOUDINARY_API_SECRET no está configurado");
  }

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));

  // Rechazamos timestamps demasiado antiguos.
  if (!Number.isFinite(age) || age > 2 * 60 * 60) {
    return false;
  }

  const data = rawBody + timestamp + apiSecret;

  for (const algorithm of ["sha1", "sha256"] as const) {
    const expectedSignature = crypto
      .createHash(algorithm)
      .update(data)
      .digest("hex");

    if (expectedSignature.length !== signature.length) {
      continue;
    }

    if (
      crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature)
      )
    ) {
      return true;
    }
  }

  const sha1 = crypto.createHash("sha1").update(data).digest("hex");
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");

  console.log("❌ Firma de Cloudinary inválida");
  console.log(`   Timestamp recibido: ${timestamp}`);
  console.log(`   Firma recibida:     ${signature}`);
  console.log(`   Longitud rawBody:   ${rawBody.length}`);
  console.log(`   rawBody (primeros 200): ${JSON.stringify(rawBody.slice(0, 200))}`);
  console.log(`   Esperado sha1:      ${sha1}`);
  console.log(`   Esperado sha256:    ${sha256}`);

  return false;
}

export async function registerWebhook(app: FastifyInstance) {
  app.post(
    "/webhook/cloudinary",
    { config: { rawBody: true } },
    async (request, reply) => {
      const payload = request.body as any;
      const rawBody = (request as any).rawBody as string;

      const timestamp = request.headers["x-cld-timestamp"];
      const signature = request.headers["x-cld-signature"];

      if (
        typeof timestamp !== "string" ||
        typeof signature !== "string"
      ) {
      return reply.code(401).send({
        ok: false,
        error: "Missing Cloudinary signature",
      });
    }

      const valid = verifyCloudinarySignature(
        rawBody,
        timestamp,
      signature
    );

    if (!valid) {
      return reply.code(401).send({
        ok: false,
        error: "Invalid Cloudinary signature",
      });
    }

    console.log("\n📦 WEBHOOK CLOUDINARY VERIFICADO");
    console.log(JSON.stringify(payload, null, 2));

    const assetId = payload?.asset_id;
    const publicId = payload?.public_id;
    const secureUrl = payload?.secure_url;
    

    if (!assetId || !publicId || !secureUrl) {
      return reply.code(400).send({
        ok: false,
        error: "Missing asset information",
      });
    }

    if (
      publicId.startsWith(GENERATED_PREFIX) ||
      publicId.startsWith(BASE_FOLDER_PREFIX) ||
      publicId === BASE_IMAGE_PUBLIC_ID
    ) {
      console.log(
        "ℹ️ Asset base o generado ignorado:",
        publicId
      );

      return reply.send({
        ok: true,
        status: "skipped",
      });
    }

    const existing = db
      .prepare("SELECT id FROM images WHERE asset_id = ?")
      .get(assetId);

    if (existing) {
      console.log("ℹ️ Imagen ya registrada:", assetId);

      return reply.send({
        ok: true,
        status: "already_exists",
      });
    }

    db.prepare(`
      INSERT INTO images (
        asset_id,
        public_id,
        secure_url,
        status
      )
      VALUES (?, ?, ?, ?)
    `).run(
      assetId,
      publicId,
      secureUrl,
      "pending"
    );

    console.log("✅ NUEVA IMAGEN EN COLA");
    console.log(`   Public ID: ${publicId}`);
    console.log(`   Asset ID:  ${assetId}`);
    console.log(`   Status:    pending`);

    processPendingImages().catch((error) => {
      console.error("❌ Error procesando tras el webhook:", error);
    });

    return reply.code(201).send({
      ok: true,
      status: "queued",
      asset_id: assetId,
    });
  });
}