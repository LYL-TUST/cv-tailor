import { Router } from "express";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { db } from "../db.js";
import { hashPassword, verifyPassword, signToken, requireAuth } from "../security.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 登录/注册限流：防止撞库与批量注册
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true });

const publicUser = (row) => ({ id: row.id, email: row.email, nickname: row.nickname || "" });

/* 注册：账号仅用于跨设备同步（不设登录门槛，核心功能本地免费完整可用） */
router.post("/register", authLimiter, (req, res) => {
  const { email, password, nickname } = req.body || {};
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: "邮箱格式不正确" });
  if (!password || String(password).length < 6) return res.status(400).json({ error: "密码至少 6 位" });

  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(cleanEmail);
  if (exists) return res.status(409).json({ error: "该邮箱已注册，请直接登录" });

  const { salt, hash } = hashPassword(String(password));
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO users (id, email, pass_salt, pass_hash, nickname, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, cleanEmail, salt, hash, String(nickname || "").slice(0, 30), now);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  res.json({ token: signToken(id), user: publicUser(user) });
});

/* 登录 */
router.post("/login", authLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || "").trim().toLowerCase();

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail);
  if (!user || !verifyPassword(String(password || ""), user.pass_salt, user.pass_hash)) {
    return res.status(401).json({ error: "邮箱或密码错误" });
  }
  res.json({ token: signToken(user.id), user: publicUser(user) });
});

/* 当前登录用户信息 */
router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, email, nickname, created_at FROM users WHERE id = ?").get(req.userId);
  if (!user) return res.status(404).json({ error: "用户不存在" });
  res.json({ user: publicUser(user) });
});

export default router;
