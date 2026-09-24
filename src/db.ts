import Database from "better-sqlite3";

const db = new Database("data/cortinas.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    asset_id TEXT UNIQUE NOT NULL,
    public_id TEXT NOT NULL,
    secure_url TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    output_public_id TEXT,
    output_secure_url TEXT,

    error TEXT,
    next_retry_at TEXT,

    attempts INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

try {
  db.prepare("SELECT next_retry_at FROM images LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE images ADD COLUMN next_retry_at TEXT");
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_images_status ON images(status);
`);

export default db;