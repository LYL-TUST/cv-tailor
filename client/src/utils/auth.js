/**
 * 登录态管理 —— 账号为"可选增值"（云同步），与隐私优先不冲突
 * 登录 token 仅存 localStorage（本机），不上报任何数据
 */

const AUTH_KEY = "arb_auth_v1";

export function getSession() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession({ token, user }) {
  const session = { token, user: { email: user?.email || "", nickname: user?.nickname || "" }, loginAt: Date.now() };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return session;
}

export function updateUser(user) {
  const s = getSession();
  if (s) { s.user = { email: user?.email || s.user?.email, nickname: user?.nickname || s.user?.nickname }; localStorage.setItem(AUTH_KEY, JSON.stringify(s)); }
}

export function clearSession() {
  localStorage.removeItem(AUTH_KEY);
}

export const isLoggedIn = () => !!getSession()?.token;
