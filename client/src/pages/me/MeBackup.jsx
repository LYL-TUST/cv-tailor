import { useState } from "react";
import {
  exportAllData, importAllData, clearAllLocalData,
} from "../../utils/historyStore";
import { encryptData, decryptData, downloadJsonFile } from "../../utils/backup";
import { track } from "../../utils/analytics";
import { SectionTitle, cardBase, dangerBtn } from "./meUi";

/** 数据备份与恢复 + 危险区 —— 导出/导入备份;清空本机全部数据(不可恢复) */
export default function MeBackup() {
  const [backupMsg, setBackupMsg] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

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

  return (
    <div>
      <SectionTitle text="数据备份与恢复" marginTop={0} />
      <div className="me-card" style={cardBase}>
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

      <SectionTitle text="危险区" />
      <div className="me-card" style={{ ...cardBase, borderColor: "#fecaca", background: "#fff5f5" }}>
        <strong style={{ fontSize: "14px", color: "#dc2626" }}>清空本机全部数据</strong>
        <p style={{ fontSize: "12px", color: "#94a3b8", margin: "4px 0 10px" }}>删除所有简历版本、JD 匹配历史、面试记录、收藏夹与主题设置。此操作不可恢复。</p>
        <button style={dangerBtn} onClick={clearAll}>{confirmClear ? "⚠️ 确认清空" : "清空全部数据"}</button>
      </div>
    </div>
  );
}
