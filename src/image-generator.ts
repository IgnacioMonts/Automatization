import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const BASE_IMAGE_PUBLIC_ID =
  "dedaabae-9cc4-4c38-a848-1ca17f242b45";

const PROMPT = `
Quiero que modifiques la cortina de la imagen base utilizando
el diseño de cortina proporcionado como imagen de referencia.

Mantén exactamente la habitación, muebles, paredes, ventanas,
iluminación, perspectiva, cámara y composición de la imagen base.

Únicamente modifica la cortina.

La nueva cortina debe conservar fielmente el diseño, colores,
textura y patrón de la imagen de referencia, adaptándolos
naturalmente a la forma, pliegues, caída y perspectiva de la
cortina existente.

No agregues objetos.
No elimines objetos.
No cambies la habitación.
No cambies la iluminación general.
No cambies la posición de la cámara.

El resultado debe parecer una fotografía real de la misma
habitación, pero con la cortina correspondiente al diseño
proporcionado.
`;

export async function generateCurtainImage(
  baseImagePath: string,
  curtainImagePath: string
): Promise<Buffer> {
  const baseImage = await fs.readFile(baseImagePath);
  const curtainImage = await fs.readFile(curtainImagePath);

  const qualityEnv = process.env.OPENAI_IMAGE_QUALITY;
  const quality = (["low", "medium", "high", "auto"] as const)
    .find((q) => q === qualityEnv);

  const response = await openai.images.edit(
    {
      model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
      image: [
        new File([baseImage], path.basename(baseImagePath), {
          type: "image/png",
        }),
        new File([curtainImage], path.basename(curtainImagePath), {
          type: "image/png",
        }),
      ],
      prompt: PROMPT,
      ...(quality ? { quality } : {}),
    },
    { timeout: 120000, maxRetries: 2 }
  );

  const imageBase64 = response.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error("OpenAI no devolvió una imagen");
  }

  return Buffer.from(imageBase64, "base64");
}
// re deploy railway