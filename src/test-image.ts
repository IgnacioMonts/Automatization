import "dotenv/config";
import { generateCurtainImage } from "./image-generator.js";
import fs from "fs/promises";

const result = await generateCurtainImage(
  "./data/WhatsApp_Image_2026-09-20_at_8.15.01_PM.jpg",
  "./data/WhatsApp_Image_2026-09-20_at_5.04.09_PM.jpg"
);

await fs.writeFile("./data/test-result.png", result);

console.log("✅ Imagen generada: data/test-result.png");