import crypto from "node:crypto";

const SECRET = process.env.JWT_SECRET || "dev_secret_change_in_production";

/* ============ 密码哈希（scrypt，无需外部依赖） ============ */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const hash = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

/* ============ 会话令牌（HMAC-SHA256，无状态） ============ */

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

export function signToken(userId) {
  const payload = b64url(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** 校验令牌，返回 userId；无效返回 null */
export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expect = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.uid || !data.exp || data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

/** Express 鉴权中间件：通过则 req.userId = 用户 id */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: "登录已过期，请重新登录" });
  }
  req.userId = userId;
  next();
}
