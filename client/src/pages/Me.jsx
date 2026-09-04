import PageHead from "../components/PageHead";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { track } from "../utils/analytics";
import {
  listVersions, switchTo, createVersion, duplicateVersion,
  renameVersion, deleteVersion,
} from "../utils/resumeStore";
import {
  listAtsRecords, deleteAtsRecord, clearAtsRecords,
  listInterviewSessions, deleteInterviewSession, clearInterviewSessions,
  exportAllData, importAllData, clearAllLocalData,
} from "../utils/historyStore";
import { encryptData, decryptData, downloadJsonFile } from "../utils/backup";
import { loginUser, registerUser, fetchVault, pushVault, deleteVault } from "../utils/api";
import { getSession, setSession, clearSession } from "../utils/auth";

/**
 * 个人中心 —— 无需登录的"本地空间"
 * 简历版本 / ATS 历史 / 面试记录 / 数据备份与恢复 / 隐私声明
 * 隐私优先：所有数据只存本机；账号体系(可选登录云同步)作为后续阶段
 */

const fmtDate = (ts) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const scoreColor = (s) => (s >= 80 ? "#16a34a" : s >= 60 ? "#f59e0b" : "#ef4444");

function AtsTrend({ records }) {
  const pts = [...records].sort((a, b) => a.ts - b.ts).slice(-12);
  if (pts.length < 2) {
    return <p style={{ fontSize: "13px", color: "#94a3b8" }}>至少完成 2 次诊断后显示分数趋势</p>;
  }
  const W = 480, H = 90, pad = 16;
  const min = Math.min(...pts.map((p) => p.score)), max = Math.max(...pts.map((p) => p.score));
  const range = Math.max(max - min, 10);
  const x = (i) => pad + (i * (W - pad * 2)) / (pts.length - 1);
  const y = (s) => H - pad - ((s - min) / range) * (H - pad * 2);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 480 }}>
        <polyline points={line.replace(/[ML]/g, (m) => `${m} `)} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={p.id}>
            <circle cx={x(i)} cy={y(p.score)} r="4" fill="#2563eb" />
            <text x={x(i)} y={y(p.score) - 8} textAnchor="middle" fontSize="11" fill="#475569">{p.score}</text>
          </g>
        ))}
      </svg>
      <p style={{ fontSize: "12px", color: "#94a3b8" }}>最近 {pts.length} 次 JD 匹配分趋势（改简历 → 分数提升的可视化闭环）</p>
    </div>
  );
}

function SectionTitle({ text, badge }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "32px 0 12px" }}>
      <span style={{ width: "6px", height: "18px", background: "#2563eb", borderRadius: "3px", display: "inline-block" }} />
      <h3 style={{ fontSize: "18px", margin: 0 }}>{text}</h3>
      {badge != null && (
        <span style={{ background: "#e2e8f0", color: "#475569", borderRadius: "12px", padding: "1px 10px", fontSize: "13px" }}>
          {badge}
        </span>
      )}
    </div>
  );
}

export default function Me() {
  const navigate = useNavigate();
  const [versions, setVersionsState] = useState([]);
  const [atsRecords, setAtsRecords] = useState([]);
  const [interviewSessions, setInterviewSessions] = useState([]);
  const [expandedAts, setExpandedAts] = useState(null);
  const [expandedSession, setExpandedSession] = useState(null);
  const [backupMsg, setBackupMsg] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  // 云同步（可选登录）状态
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

  const reloadAll = () => {
    setVersionsState(listVersions());
    setAtsRecords(listAtsRecords());
    setInterviewSessions(listInterviewSessions());
  };

  useEffect(() => { reloadAll(); }, []);

  /* ===== 简历版本 ===== */
  const openVersion = (id) => { switchTo(id); navigate("/editor"); };
  const handleNew = () => { createVersion("未命名简历"); reloadAll(); navigate("/editor"); };
  const handleDuplicate = (id) => { duplicateVersion(id); reloadAll(); };
  const handleRename = (v) => {
    const name = window.prompt("修改版本名称", v.name);
    if (name && name.trim()) { renameVersion(v.id, name.trim()); reloadAll(); }
  };
  const handleDeleteVersion = (v) => {
    if (versions.length <= 1) { alert("至少保留一个简历版本"); return; }
    if (!window.confirm(`删除版本「${v.name}」？此操作不可恢复。`)) return;
    deleteVersion(v.id); reloadAll();
  };

  /* ===== 数据备份 / 恢复 / 清空 ===== */
  const exportEncrypted = async () => {
    const pw = window.prompt("设置备份密码（必须记住！忘记密码将无法解密备份）", "");
    if (pw === null || !pw.trim()) return;
    try {
      const payload = await encryptData(exportAllData(), pw.trim());
      downloadJsonFile(`简历备份_${new Date().toISOString().slice(0, 10)}.json`, payload);
      setBackupMsg("✅ 已导出加密备份文件（密码即钥匙，请妥善保存）");
      track("backup_export", { encrypted: true });
    } catch (e) { setBackupMsg(`导出失败：${e.message}`); }
  };

  const exportPlain = () => {
    downloadJsonFile(`简历数据明文_${new Date().toISOString().slice(0, 10)}.json`, exportAllData());
    setBackupMsg("✅ 已导出明文 JSON（注意：包含简历内容，请勿分享）");
  };

  const doImport = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      // 支持两种格式：加密备份（需密码）与明文备份
      if (parsed.format === "arb-encrypted-v1") {
        const pw = window.prompt("输入该备份文件的加密密码", "");
        if (pw === null) return;
        const decrypted = await decryptData(parsed, pw.trim());
        importAllData(decrypted);
      } else {
        importAllData(parsed);
      }
      reloadAll();
      setBackupMsg("✅ 备份已导入（与现有数据合并）");
      track("backup_import", {});
    } catch (e) {
      setBackupMsg(`导入失败：${e.message}`);
    }
  };

  const clearAll = () => {
    if (!confirmClear) { setConfirmClear(true); setBackupMsg("⚠️ 再次点击「确认清空」将永久删除本机全部简历与历史（无法恢复）"); return; }
    clearAllLocalData();
    window.location.reload();
  };

  /* ===== 云同步（可选登录 · 端到端加密） ===== */
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
      reloadAll();
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

  /* ===== ATS 历史展开 ===== */
  const toggleAts = (id) => setExpandedAts(expandedAts === id ? null : id);
  const toggleSession = (id) => setExpandedSession(expandedSession === id ? null : id);

  const cardBase = { border: "1px solid #e2e8f0", borderRadius: "10px", background: "#fff", padding: "14px 16px", marginBottom: "10px" };
  const ghostBtn = { fontSize: "12px", padding: "3px 10px", cursor: "pointer", background: "none", border: "1px solid #cbd5e1", borderRadius: "6px", color: "#475569" };
  const dangerBtn = { ...ghostBtn, color: "#dc2626", borderColor: "#fca5a5" };

  return (
    <section style={{ maxWidth: 860, margin: "0 auto", padding: "24px" }}>
      <PageHead
        kicker="账户"
        title="个人中心"
        icon="👤"
        sub="无需登录 —— 你的简历与练习记录都保存在这台设备上，只有你能看到。"
      />

      <div style={{ padding: "10px 14px", background: "#ecfdf5", borderRadius: "8px", fontSize: "13px", color: "#065f46", marginBottom: "8px" }}>
        🔒 隐私说明：不建账号、数据不上传服务器。本机数据可能因清除浏览器数据而丢失 —— 建议定期做「加密备份」。
      </div>

      {/* ============ 我的简历版本 ============ */}
      <SectionTitle text="我的简历" badge={versions.length} />
      {versions.length === 0 && (
        <div className="empty-state">
          <p>还没有简历。导入已有简历或新建一份，开始你的第一份 AI 简历。</p>
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={handleNew}>＋ 新建简历</button>
        </div>
      )}
      {versions.map((v) => {
        const d = v.data || {};
        const expCount = d.experience?.length || 0;
        const skillCount = d.skills?.length || 0;
        return (
          <div key={v.id} style={cardBase}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <strong style={{ fontSize: "15px" }}>{v.name}</strong>
                <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                  {d.personalInfo?.name ? `${d.personalInfo.name} · ${d.personalInfo.title || "未填职位"} · ` : ""}
                  {expCount} 段经历 · {skillCount} 项技能 · 更新于 {fmtDate(v.updatedAt)}
                </div>
              </div>
              <button className="btn-primary" style={{ fontSize: "12px", padding: "5px 14px" }} onClick={() => openVersion(v.id)}>✏️ 打开编辑</button>
              <button style={ghostBtn} onClick={() => handleDuplicate(v.id)}>⧉ 复制</button>
              <button style={ghostBtn} onClick={() => handleRename(v)}>✎ 重命名</button>
              <button style={dangerBtn} onClick={() => handleDeleteVersion(v)}>🗑 删除</button>
            </div>
          </div>
        );
      })}
      {versions.length > 0 && (
        <button className="btn-ghost" style={{ marginTop: 4 }} onClick={handleNew}>＋ 新建一份（按不同公司/岗位）</button>
      )}

      {/* ============ JD 匹配历史 ============ */}
      <SectionTitle text="JD 匹配历史" badge={atsRecords.length} />
      <div style={{ marginBottom: 12 }}>
        <AtsTrend records={atsRecords} />
      </div>
      {atsRecords.length === 0 ? (
        <div className="empty-state"><p>还没有匹配记录。去「JD 匹配诊断」粘贴职位描述测一次，结果会自动保存在这里。</p></div>
      ) : (
        <>
          {atsRecords.map((r) => (
            <div key={r.id} style={cardBase}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", cursor: "pointer" }} onClick={() => toggleAts(r.id)}>
                <span style={{ fontSize: "22px", fontWeight: "bold", color: scoreColor(r.score) }}>{r.score}</span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong style={{ fontSize: "14px" }}>{r.jdTitle || "未命名 JD"}</strong>
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>{fmtDate(r.ts)} {r.jdPreview ? `· ${r.jdPreview}…` : ""}</div>
                </div>
                <span style={{ fontSize: "12px", color: "#2563eb" }}>{expandedAts === r.id ? "收起 ▲" : "查看详情 ▼"}</span>
              </div>

              {expandedAts === r.id && (
                <div style={{ marginTop: 12, borderTop: "1px dashed #e2e8f0", paddingTop: 12 }}>
                  {r.overallAssessment && (
                    <p style={{ fontSize: "13px", color: "#334155", background: "#f0f7ff", padding: "8px 12px", borderRadius: "8px" }}>
                      🧭 <strong>语义总评：</strong>{r.overallAssessment}
                    </p>
                  )}
                  {r.missingKeywords?.length > 0 && (
                    <p style={{ fontSize: "13px", margin: "6px 0" }}>
                      <strong>❌ 缺失关键词：</strong>
                      {r.missingKeywords.map((k, i) => <span key={i} style={{ background: "#fee2e2", color: "#b91c1c", padding: "1px 8px", borderRadius: "12px", marginLeft: 6, fontSize: "12px" }}>{k}</span>)}
                    </p>
                  )}
                  {r.priorityActions?.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <strong style={{ fontSize: "13px" }}>💡 补强建议（已通过真实性校验）：</strong>
                      <ol style={{ fontSize: "13px", margin: "6px 0 0 18px", lineHeight: 1.7 }}>
                        {r.priorityActions.map((a, i) => <li key={i}>{a}</li>)}
                      </ol>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "8px", marginTop: 12 }}>
                    <button className="btn-ghost" style={{ fontSize: "12px", padding: "4px 12px" }} onClick={() => navigate("/ats")}>🔄 重新诊断</button>
                    <button style={dangerBtn} onClick={() => { deleteAtsRecord(r.id); reloadAll(); }}>删除这条</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button style={dangerBtn} onClick={() => { if (window.confirm("清空全部 JD 匹配历史？")) { clearAtsRecords(); reloadAll(); } }}>清空全部匹配历史</button>
        </>
      )}

      {/* ============ 模拟面试记录 ============ */}
      <SectionTitle text="模拟面试记录" badge={interviewSessions.length} />
      {interviewSessions.length === 0 ? (
        <div className="empty-state"><p>还没有面试练习记录。完成一次练习后点击「保存本次练习」，这里即可回看。</p></div>
      ) : (
        <>
          {interviewSessions.map((s) => (
            <div key={s.id} style={cardBase}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", cursor: "pointer" }} onClick={() => toggleSession(s.id)}>
                <span style={{ fontSize: "22px", fontWeight: "bold", color: s.avgScore != null ? scoreColor(s.avgScore * 10) : "#94a3b8" }}>
                  {s.avgScore != null ? `${s.avgScore}/10` : "—"}
                </span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong style={{ fontSize: "14px" }}>{s.jobTitle}</strong>
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>{fmtDate(s.ts)} · {s.questionCount} 题</div>
                </div>
                <span style={{ fontSize: "12px", color: "#2563eb" }}>{expandedSession === s.id ? "收起 ▲" : "查看详情 ▼"}</span>
              </div>

              {expandedSession === s.id && (
                <div style={{ marginTop: 12, borderTop: "1px dashed #e2e8f0", paddingTop: 12, display: "flex", flexDirection: "column", gap: "10px" }}>
                  {s.records?.map((q, qi) => (
                    <div key={qi} style={{ background: "#f8fafc", borderRadius: "8px", padding: "10px 12px" }}>
                      <div style={{ fontSize: "14px", fontWeight: "600" }}>
                        <span style={{ color: "#475569" }}>Q{qi + 1}.</span> {q.question}
                        {q.score != null && <span style={{ float: "right", color: scoreColor(q.score * 10), fontWeight: "bold" }}>{q.score}/10</span>}
                      </div>
                      {q.userAnswer && (
                        <p style={{ fontSize: "13px", margin: "6px 0", color: "#334155" }}>
                          <strong>我的回答：</strong>{q.userAnswer}
                        </p>
                      )}
                      {q.feedback && (
                        <p style={{ fontSize: "12px", margin: "4px 0", color: "#065f46", background: "#f0fdf4", padding: "6px 10px", borderRadius: "6px" }}>
                          <strong>AI 反馈：</strong>{q.feedback}
                        </p>
                      )}
                      {q.improvements?.length > 0 && (
                        <p style={{ fontSize: "12px", margin: "4px 0", color: "#7c2d12" }}>💡 待改进：{q.improvements.join("；")}</p>
                      )}
                      {q.improvedAnswer && (
                        <p style={{ fontSize: "12px", margin: "4px 0", color: "#1d4ed8", fontStyle: "italic" }}>🌟 参考回答：{q.improvedAnswer}</p>
                      )}
                    </div>
                  ))}
                  <button style={dangerBtn} onClick={() => { deleteInterviewSession(s.id); reloadAll(); }}>删除本次记录</button>
                </div>
              )}
            </div>
          ))}
          <button style={dangerBtn} onClick={() => { if (window.confirm("清空全部面试记录？")) { clearInterviewSessions(); reloadAll(); } }}>清空全部面试记录</button>
        </>
      )}

      {/* ============ 数据备份与恢复 ============ */}
      <SectionTitle text="数据备份与恢复" />
      <div style={cardBase}>
        <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 12px" }}>
          数据只存在本机。清除浏览器数据会删除一切 —— 建议定期加密备份到你的网盘/U 盘，换设备或清理后可一键恢复。
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button className="btn-primary" style={{ fontSize: "13px" }} onClick={exportEncrypted}>🔐 导出加密备份</button>
          <button className="btn-ghost" style={{ fontSize: "13px" }} onClick={exportPlain}>导出明文 JSON</button>
          <label style={{ fontSize: "13px", display: "inline-flex", alignItems: "center" }}>
            <input
              type="file" accept=".json,application/json" style={{ display: "none" }}
              onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ""; }}
            />
            <span className="btn-ghost" style={{ fontSize: "13px", display: "inline-block", padding: "8px 16px", cursor: "pointer" }}>📥 导入备份</span>
          </label>
        </div>
        {backupMsg && <p style={{ fontSize: "13px", color: backupMsg.startsWith("⚠") || backupMsg.startsWith("导入失败") ? "#dc2626" : "#166534", marginTop: 10 }}>{backupMsg}</p>}
      </div>

      {/* ============ 云同步（可选登录 · 端到端加密） ============ */}
      <SectionTitle text="云同步（可选）" badge={authUser ? "已登录" : "未登录"} />
      <div style={cardBase}>
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

      {/* ============ 危险区 ============ */}
      <div style={{ ...cardBase, borderColor: "#fecaca", background: "#fff5f5" }}>
        <strong style={{ fontSize: "14px", color: "#dc2626" }}>危险区：清空本机全部数据</strong>
        <p style={{ fontSize: "12px", color: "#94a3b8", margin: "4px 0 10px" }}>删除所有简历版本、JD 匹配历史、面试记录与主题设置。此操作不可恢复。</p>
        <button style={dangerBtn} onClick={clearAll}>{confirmClear ? "⚠️ 确认清空" : "清空全部数据"}</button>
      </div>

      <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: 20, textAlign: "center" }}>
        简历智造 · 默认本地优先，登录仅用于端到端加密云同步（服务器只存密文）
      </p>
    </section>
  );
}
