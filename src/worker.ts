import "dotenv/config";
import fs from "fs/promises";
import os from "os";
import path from "path";

import db from "./db.js";
import cloudinary from "./cloudinary.js";
import { generateCurtainImage } from "./image-generator.js";

export const BASE_IMAGE_PUBLIC_ID =
  "WhatsApp_Image_2026-09-20_at_8.15.01_PM";

const MAX_ATTEMPTS = 5;
const RETRY_BASE_DELAY_SECONDS = 30;
const RETRY_MAX_DELAY_SECONDS = 3600;
const PROCESSING_TIMEOUT_MINUTES = 15;

let running = false;

async function downloadCloudinaryImage(
  publicId: string,
  destination: string
): Promise<void> {
  const url = cloudinary.url(publicId, {
    secure: true,
  });

  console.log(`⬇️ Descargando: ${publicId}`);

  const response = await fetch(url);

  if (!response.ok) {
    const error = new Error(
      `No se pudo descargar ${publicId}: HTTP ${response.status}`
    ) as Error & { status?: number };

    error.status = response.status;

    throw error;
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  await fs.writeFile(destination, buffer);
}

function retryDelaySeconds(newAttempt: number): number {
  return Math.min(
    RETRY_BASE_DELAY_SECONDS * 2 ** (newAttempt - 1),
    RETRY_MAX_DELAY_SECONDS
  );
}

function isTransientError(error: unknown): boolean {
  const status = (error as any)?.status;

  if (status === 429) {
    return true;
  }

  if (typeof status === "number" && status >= 500) {
    return true;
  }

  if (status === undefined) {
    return true;
  }

  return false;
}

async function processImage(image: any): Promise<void> {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "cortinas-")
  );

  const basePath = path.join(tempDir, "base.png");
  const curtainPath = path.join(tempDir, "curtain.png");
  const outputPath = path.join(tempDir, "result.png");

  try {
    db.prepare(`
      UPDATE images
      SET
        status = 'processing',
        attempts = attempts + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(image.id);

    console.log(`\n🖼️ Procesando imagen #${image.id}`);
    console.log(`   Cortina: ${image.public_id}`);

    await downloadCloudinaryImage(
      BASE_IMAGE_PUBLIC_ID,
      basePath
    );

    await downloadCloudinaryImage(
      image.public_id,
      curtainPath
    );

    console.log("🤖 Enviando imágenes a OpenAI...");

    const result = await generateCurtainImage(
      basePath,
      curtainPath
    );

    await fs.writeFile(outputPath, result);

    console.log("☁️ Subiendo resultado a Cloudinary...");

    const originalName =
      image.public_id.split("/").pop() ?? "resultado";
    const outputStem = originalName.replace(/\.[^/.]+$/, "");

    const uploadResult = await cloudinary.uploader.upload(
      outputPath,
      {
        folder: "cortinas/generadas",
        public_id: outputStem,
        resource_type: "image",
        overwrite: true,
      }
    );

    db.prepare(`
      UPDATE images
      SET
        status = 'completed',
        output_public_id = ?,
        output_secure_url = ?,
        error = NULL,
        next_retry_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      uploadResult.public_id,
      uploadResult.secure_url,
      image.id
    );

    console.log("✅ PROCESAMIENTO COMPLETADO");
    console.log(`   Resultado: ${uploadResult.secure_url}`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    const nextAttempt = image.attempts + 1;
    const transient = isTransientError(error);
    const canRetry = transient && nextAttempt < MAX_ATTEMPTS;
    const delaySeconds = retryDelaySeconds(nextAttempt);

    console.error("❌ ERROR:", message);
    console.error(
      `   Intento ${nextAttempt}/${MAX_ATTEMPTS}` +
        (canRetry
          ? ` → reintento en ${delaySeconds}s`
          : " → sin reintento")
    );

    db.prepare(`
      UPDATE images
      SET
        status = 'failed',
        error = ?,
        next_retry_at = ${
          canRetry
            ? `datetime('now', '+${delaySeconds} seconds')`
            : "NULL"
        },
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(message, image.id);
  } finally {
    await fs.rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
}

export async function processPendingImages(): Promise<void> {
  if (running) {
    console.log(
      "⏳ Worker ya está procesando, se omite esta ejecución"
    );
    return;
  }

  running = true;

  try {
    const recovered = db
      .prepare(`
        UPDATE images
        SET
          status = 'pending',
          error = 'Recuperada tras reinicio',
          updated_at = CURRENT_TIMESTAMP
        WHERE status = 'processing'
          AND datetime(updated_at) < datetime('now', ?)
      `)
      .run(`-${PROCESSING_TIMEOUT_MINUTES} minutes`);

    if (recovered.changes > 0) {
      console.log(
        `♻️ ${recovered.changes} imagen(es) atascada(s) en 'processing' recuperadas`
      );
    }

    const images = db
      .prepare(`
        SELECT *
        FROM images
        WHERE status = 'pending'
           OR (status = 'failed'
               AND attempts < ?
               AND (next_retry_at IS NULL
                    OR datetime(next_retry_at) <= datetime('now')))
        ORDER BY id ASC
      `)
      .all(MAX_ATTEMPTS);

    if (images.length === 0) {
      console.log("📭 No hay imágenes pendientes");
      return;
    }

    console.log(`📋 ${images.length} imagen(es) pendientes`);

    for (const image of images) {
      await processImage(image);
    }
  } finally {
    running = false;
  }
}

export function startWorker(intervalMs = 5000): void {
  console.log("🚀 Worker de procesamiento iniciado");

  const run = () => {
    processPendingImages().catch((error) => {
      console.error("❌ Error fatal del worker:", error);
    });
  };

  run();
  setInterval(run, intervalMs);
}