import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  listVersions, switchTo, createVersion, duplicateVersion,
  renameVersion, deleteVersion,
} from "../../utils/resumeStore";
import { SectionTitle, cardBase, ghostBtn, dangerBtn, fmtDate, EmptyState } from "./meUi";

/** 我的简历 —— 多版本管理(打开编辑 / 复制 / 重命名 / 删除 / 新建) */
export default function MeResumes() {
  const navigate = useNavigate();
  const [versions, setVersions] = useState([]);

  const reload = () => setVersions(listVersions());
  useEffect(() => { reload(); }, []);

  const openVersion = (id) => { switchTo(id); navigate("/editor"); };
  const handleNew = () => { createVersion("未命名简历"); navigate("/editor"); };
  const handleDuplicate = (id) => { duplicateVersion(id); reload(); };
  const handleRename = (v) => {
    const name = window.prompt("修改版本名称", v.name);
    if (name && name.trim()) { renameVersion(v.id, name.trim()); reload(); }
  };
  const handleDelete = (v) => {
    if (versions.length <= 1) { alert("至少保留一个简历版本"); return; }
    if (!window.confirm(`删除版本「${v.name}」？此操作不可恢复。`)) return;
    deleteVersion(v.id); reload();
  };

  return (
    <div>
      <SectionTitle text="我的简历" badge={versions.length} marginTop={0} />
      {versions.length === 0 ? (
        <EmptyState
          icon="📄"
          title="还没有简历"
          desc="导入已有简历或新建一份，开始你的第一份 AI 简历。"
          cta={<button className="btn-primary" onClick={handleNew}>＋ 新建简历</button>}
        />
      ) : (
        versions.map((v) => {
          const d = v.data || {};
          const expCount = d.experience?.length || 0;
          const skillCount = d.skills?.length || 0;
          return (
            <div key={v.id} className="me-card" style={cardBase}>
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
                <button style={dangerBtn} onClick={() => handleDelete(v)}>🗑 删除</button>
              </div>
            </div>
          );
        })
      )}
      {versions.length > 0 && (
        <button className="btn-ghost" style={{ marginTop: 4 }} onClick={handleNew}>＋ 新建一份（按不同公司/岗位）</button>
      )}
    </div>
  );
}
