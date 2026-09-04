import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "app.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

/**
 * 用户表：id / email / 密码哈希(scrypt) / 昵称
 * vault 表：每个用户一行 E2E 加密密文 blob（服务器永远只存密文，不解密）
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    pass_salt  TEXT NOT NULL,
    pass_hash  TEXT NOT NULL,
    nickname   TEXT DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vault (
    user_id    TEXT PRIMARY KEY REFERENCES users(id),
    blob       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

export { DB_PATH };
