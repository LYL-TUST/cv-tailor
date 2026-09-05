import { useState, useEffect } from "react";
import {
  loginUser, registerUser, fetchVault, pushVault, deleteVault,
} from "../../utils/api";
import { encryptData, decryptData } from "../../utils/backup";
import { exportAllData, importAllData } from "../../utils/historyStore";
import { getSession, setSession, clearSession } from "../../utils/auth";
import { track } from "../../utils/analytics";
import { SectionTitle, cardBase, ghostBtn } from "./meUi";

/**
 * 云同步（可选登录 · 端到端加密）
 * 登录只在"跨设备恢复"时必要;简历默认仍在本地。密码即钥匙,服务器只存密文。
 */
export default function MeSync() {
  const [authUser, setAuthUser] = useState(null);
  const [authMode, setAuthMode] = useState("login"); // login | register
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMsg, setCloudMsg] = useState("");

  useEffect(() => {
    const s = getSession();
    if (s?.token) setAuthUser(s.user || { email: "" });
  }, []);

  const submitAuth = async () => {
    if (!authEmail.trim() || authPassword.length < 6) {
      setCloudMsg("请填写邮箱与至少 6 位密码");
      return;
    }
    setCloudBusy(true);
    setCloudMsg("");
    try {
      const result = authMode === "register"
        ? await registerUser({ email: authEmail.trim(), password: authPassword, nickname: "" })
        : await loginUser({ email: authEmail.trim(), password: authPassword });
      setSession(result);
      setAuthUser(result.user);
      setAuthPassword("");
      setCloudMsg(authMode === "register" ? "✅ 注册成功。登录只用于跨设备云同步，本地功能不受影响。" : "✅ 登录成功，现在可以把数据加密备份到云端。");
      track("cloud_login", { mode: authMode });
    } catch (e) {
      setCloudMsg(`⚠️ ${e.message}`);
    } finally {
      setCloudBusy(false);
    }
  };

  const logout = () => {
    clearSession();
    setAuthUser(null);
    setCloudMsg("已退出登录（本地数据不受影响）");
  };

  /** 本机数据 → AES-GCM 加密 → 上传（服务器只见密文） */
  const pushToCloud = async () => {
    const session = getSession();
    if (!session?.token) return;
    const pw = window.prompt("设置同步加密密码（建议与账号密码不同；服务器永远看不到它，忘记则无法解密云端备份）", "");
    if (pw === null) return;
    if (!pw.trim()) { setCloudMsg("⚠️ 未输入加密密码"); return; }
    setCloudBusy(true);
    setCloudMsg("");
    try {
      const blob = await encryptData(exportAllData(), pw.trim());
      const res = await pushVault(session.token, blob);
      setCloudMsg(`✅ 已加密上传到云端（${res.updatedAt ? new Date(res.updatedAt).toLocaleString() : ""}）。换设备登录同一账号后可用同一密码恢复。`);
      track("cloud_push", {});
    } catch (e) {
      setCloudMsg(`⚠️ 上传失败：${e.message}`);
    } finally {
      setCloudBusy(false);
    }
  };

  /** 云端密文 → 本机解密 → 合并导入 */
  const pullFromCloud = async () => {
    const session = getSession();
    if (!session?.token) return;
    const pw = window.prompt("输入上传时的同步加密密码", "");
    if (pw === null) return;
    setCloudBusy(true);
    setCloudMsg("");
    try {
      const { blob } = await fetchVault(session.token);
      if (!blob) { setCloudMsg("⚠️ 云端还没有备份数据，请先执行一次上传。"); return; }
      const decrypted = await decryptData(blob, pw.trim());
      importAllData(decrypted);
      setCloudMsg("✅ 已从云端恢复并与本机数据合并。");
      track("cloud_pull", {});
    } catch (e) {
      setCloudMsg(`⚠️ 恢复失败：${e.message}`);
    } finally {
      setCloudBusy(false);
    }
  };

  const removeCloudBackup = async () => {
    const session = getSession();
    if (!session?.token) return;
    if (!window.confirm("删除云端备份？本机数据不受影响。此操作不可恢复。")) return;
    try {
      await deleteVault(session.token);
      setCloudMsg("🗑 已删除云端备份");
    } catch (e) {
      setCloudMsg(`⚠️ ${e.message}`);
    }
  };

  return (
    <div>
      <SectionTitle text="云同步（可选）" badge={authUser ? "已登录" : "未登录"} marginTop={0} />
      <div className="me-card" style={cardBase}>
        <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 12px" }}>
          登录后可把加密备份放到云端，换设备/清缓存后用同一账号恢复。
          <strong> 端到端加密</strong>：数据在上传前用你的"同步密码"加密，服务器只存密文、永远看不到内容。
          不登录也能完整使用全部功能。
        </p>

        {!authUser ? (
          <div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
              <input
                type="email" placeholder="邮箱" value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", flex: "1 1 200px", fontSize: "14px" }}
              />
              <input
                type="password" placeholder="密码（至少 6 位）" value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitAuth()}
                style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", flex: "1 1 200px", fontSize: "14px" }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn-primary" style={{ fontSize: "13px" }} disabled={cloudBusy} onClick={submitAuth}>
                {authMode === "register" ? "注册并登录" : "登录"}
              </button>
              <button style={ghostBtn} onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
                切换到{authMode === "login" ? "注册" : "登录"}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: "13px", margin: "0 0 10px" }}>
              👤 {authUser.email} · 账号仅用于云同步
            </p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="btn-primary" style={{ fontSize: "13px" }} disabled={cloudBusy} onClick={pushToCloud}>☁️ 加密上传本机数据</button>
              <button className="btn-ghost" style={{ fontSize: "13px" }} disabled={cloudBusy} onClick={pullFromCloud}>📥 从云端恢复</button>
              <button style={ghostBtn} onClick={removeCloudBackup}>🗑 删除云端备份</button>
              <button style={ghostBtn} onClick={logout}>退出登录</button>
            </div>
          </div>
        )}
        {cloudMsg && (
          <p style={{ fontSize: "13px", color: cloudMsg.startsWith("⚠") ? "#dc2626" : "#166534", marginTop: 10 }}>
            {cloudMsg}
          </p>
        )}
      </div>
    </div>
  );
}
