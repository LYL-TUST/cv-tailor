import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../security.js";

const router = Router();

/**
 * 加密云同步（vault）—— 端到端加密：
 * 前端用"同步密码"派生密钥加密整包数据后上传，服务器只存密文 blob，
 * 永不接触明文；恢复时下载密文在浏览器本地解密。
 */

/* 获取当前用户的云端密文（未备份过返回 blob: null） */
router.get("/", requireAuth, (req, res) => {
  const row = db.prepare("SELECT blob, updated_at FROM vault WHERE user_id = ?").get(req.userId);
  if (!row) return res.json({ blob: null, updatedAt: null });
  try {
    res.json({ blob: JSON.parse(row.blob), updatedAt: row.updated_at });
  } catch {
    res.json({ blob: null, updatedAt: null });
  }
});

/* 上传/覆盖密文（last-write-wins；服务端不校验内容合法性，只校验体积） */
router.put("/", requireAuth, (req, res) => {
  const { blob } = req.body || {};
  if (!blob || typeof blob !== "object") {
    return res.status(400).json({ error: "缺少加密数据" });
  }
  const text = JSON.stringify(blob);
  if (text.length > 5 * 1024 * 1024) {
    return res.status(413).json({ error: "备份数据超过 5MB，请精简历史记录后重试" });
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO vault (user_id, blob, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET blob = excluded.blob, updated_at = excluded.updated_at
  `).run(req.userId, text, now);

  res.json({ ok: true, updatedAt: now });
});

/* 删除云端备份 */
router.delete("/", requireAuth, (req, res) => {
  db.prepare("DELETE FROM vault WHERE user_id = ?").run(req.userId);
  res.json({ ok: true });
});

export default router;
