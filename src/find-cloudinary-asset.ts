import "dotenv/config";
import cloudinary from "./cloudinary.js";

const result = await cloudinary.api.resources({
  type: "upload",
  resource_type: "image",
  prefix: "home/cortinas/base/",
  max_results: 50,
});

console.log(
  JSON.stringify(
    result.resources.map((r: any) => ({
      public_id: r.public_id,
      asset_id: r.asset_id,
      format: r.format,
      folder: r.folder,
      secure_url: r.secure_url,
    })),
    null,
    2
  )
);