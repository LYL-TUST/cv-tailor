import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  listAtsRecords, deleteAtsRecord, clearAtsRecords,
} from "../../utils/historyStore";
import { SectionTitle, cardBase, dangerBtn, fmtDate, scoreColor, AtsTrend, EmptyState } from "./meUi";

/** JD 匹配历史 —— 分数趋势 + 逐条回看(语义总评/缺词/补强建议) */
export default function MeAtsHistory() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const reload = () => setRecords(listAtsRecords());
  useEffect(() => { reload(); }, []);

  return (
    <div>
      <SectionTitle text="JD 匹配历史" badge={records.length} marginTop={0} />
      <div style={{ marginBottom: 12 }}>
        <AtsTrend records={records} />
      </div>
      {records.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="还没有匹配记录"
          desc="去「JD 匹配诊断」粘贴职位描述测一次，结果会自动保存在这里。"
        />
      ) : (
        <>
          {records.map((r) => (
            <div key={r.id} className="me-card" style={cardBase}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", cursor: "pointer" }} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                <span style={{ fontSize: "22px", fontWeight: "bold", color: scoreColor(r.score) }}>{r.score}</span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong style={{ fontSize: "14px" }}>{r.jdTitle || "未命名 JD"}</strong>
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>{fmtDate(r.ts)} {r.jdPreview ? `· ${r.jdPreview}…` : ""}</div>
                  {r.resumeName && <div style={{ fontSize: "12px", color: "#475569", marginTop: 2 }}>📄 基于简历：{r.resumeName}</div>}
                </div>
                <span style={{ fontSize: "12px", color: "#2563eb" }}>{expanded === r.id ? "收起 ▲" : "查看详情 ▼"}</span>
              </div>

              {expanded === r.id && (
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
                    <button style={dangerBtn} onClick={() => { deleteAtsRecord(r.id); reload(); }}>删除这条</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button style={dangerBtn} onClick={() => { if (window.confirm("清空全部 JD 匹配历史？")) { clearAtsRecords(); reload(); } }}>清空全部匹配历史</button>
        </>
      )}
    </div>
  );
}
