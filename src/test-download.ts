import "dotenv/config";
import fs from "fs/promises";
import cloudinary from "./cloudinary.js";

const publicId = "WhatsApp_Image_2026-09-20_at_8.15.01_PM";

const url = cloudinary.url(publicId, {
  secure: true,
});

console.log("URL:", url);

const response = await fetch(url);

console.log("HTTP:", response.status);

if (!response.ok) {
  throw new Error(`Error descargando imagen: HTTP ${response.status}`);
}

const buffer = Buffer.from(await response.arrayBuffer());

await fs.writeFile("./data/base-test.jpg", buffer);

console.log("✅ Base descargada: data/base-test.jpg");