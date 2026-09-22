import "dotenv/config";
import cloudinary from "./cloudinary.js";

const publicId =
  "home/cortinas/base/WhatsApp_Image_2026-09-20_at_8.15.01_PM";

const url = cloudinary.url(publicId, {
  secure: true,
});

console.log(url);