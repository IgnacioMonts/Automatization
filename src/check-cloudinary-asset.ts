import "dotenv/config";
import cloudinary from "./cloudinary.js";

const publicId = "WhatsApp_Image_2026-09-20_at_8.15.01_PM";

try {
  const result = await cloudinary.api.resource(publicId, {
    resource_type: "image",
    type: "upload",
  });

  console.log(
    JSON.stringify(
      {
        public_id: result.public_id,
        asset_id: result.asset_id,
        resource_type: result.resource_type,
        type: result.type,
        format: result.format,
        folder: result.folder,
        secure_url: result.secure_url,
        url: result.url,
      },
      null,
      2
    )
  );
} catch (error: any) {
  console.error("ERROR:");
  console.error(error?.error ?? error);
}