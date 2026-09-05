import { useState, useEffect } from "react";
import {
  listInterviewSessions, deleteInterviewSession, clearInterviewSessions,
} from "../../utils/historyStore";
import { SectionTitle, cardBase, dangerBtn, fmtDate, scoreColor, interviewModeLabel, chipStyle, EmptyState } from "./meUi";

/** 面试官风格档位 → 展示标签(P4) */
const STYLE_CHIP = {
  standard: { label: "🏢 大厂标准", fg: "#1e40af", bg: "#dbeafe" },
  friendly: { label: "🤝 温和引导", fg: "#15803d", bg: "#dcfce7" },
  pressure: { label: "🔥 压力追问", fg: "#b91c1c", bg: "#fee2e2" },
};
/** 回答-简历对照结论 → 展示(P4) */
const CONS_LABEL = {
  consistent: "✅ 简历对照:一致",
  minor: "🟡 简历对照:小疑点",
  concern: "🔴 简历对照:需认真对待",
};

/** 模拟面试记录 —— 场次回看(逐题回答/AI 反馈/真实性核查/参考回答) */
export default function MeInterviewHistory() {
  const [sessions, setSessions] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const reload = () => setSessions(listInterviewSessions());
  useEffect(() => { reload(); }, []);

  return (
    <div>
      <SectionTitle text="模拟面试记录" badge={sessions.length} marginTop={0} />
      {sessions.length === 0 ? (
        <EmptyState
          icon="🎤"
          title="还没有面试练习记录"
          desc="完成一次练习后点击「保存本次练习」，这里即可回看。"
        />
      ) : (
        <>
          {sessions.map((s) => (
            <div key={s.id} className="me-card" style={cardBase}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", cursor: "pointer" }} onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                <span style={{ fontSize: "22px", fontWeight: "bold", color: s.avgScore != null ? scoreColor(s.avgScore * 10) : "#94a3b8" }}>
                  {s.avgScore != null ? `${s.avgScore}/10` : "—"}
                </span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong style={{ fontSize: "14px" }}>{s.jobTitle}</strong>
                  <div style={{ fontSize: "12px", color: "#94a3b8", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>
                      {fmtDate(s.ts)} · {s.questionCount} 题
                      {s.mode && ` · ${interviewModeLabel(s.mode)}`}
                      {s.resumeName ? ` · 📄 ${s.resumeName}` : ""}
                    </span>
                    {s.style && STYLE_CHIP[s.style] && <span style={chipStyle(STYLE_CHIP[s.style].fg, STYLE_CHIP[s.style].bg)}>{STYLE_CHIP[s.style].label}</span>}
                  </div>
                </div>
                <span style={{ fontSize: "12px", color: "#2563eb" }}>{expanded === s.id ? "收起 ▲" : "查看详情 ▼"}</span>
              </div>

              {expanded === s.id && (
                <div style={{ marginTop: 12, borderTop: "1px dashed #e2e8f0", paddingTop: 12, display: "flex", flexDirection: "column", gap: "10px" }}>
                  {s.report?.stats && (
                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", fontSize: "12px", color: "#1e40af" }}>
                        <span><strong>{s.report.stats.avg ?? "—"}</strong> 平均分</span>
                        <span><strong>{s.report.stats.timedOut}</strong> 超时</span>
                        <span><strong>{s.report.stats.followUpCount > 0 ? `${s.report.stats.followUpResponded}/${s.report.stats.followUpCount}` : "—"}</strong> 追问回应</span>
                        <span><strong>{s.report.stats.weakQuestions?.length ?? 0}</strong> 建议再练</span>
                      </div>
                      {(s.report.stats.angleCounts || []).length > 0 && (
                        <p style={{ fontSize: "12px", margin: "6px 0 0", color: "#5b21b6" }}>
                          🗣 高频追问角度:{s.report.stats.angleCounts.map((a) => `${a.angle}×${a.count}`).join("、")}
                        </p>
                      )}
                      {s.report.llm?.commonWeaknesses?.length > 0 && (
                        <p style={{ fontSize: "12px", margin: "6px 0 0", color: "#7c2d12" }}>
                          ⚠️ 共性弱点:{s.report.llm.commonWeaknesses.join("；")}
                        </p>
                      )}
                    </div>
                  )}
                  {s.records?.map((q, qi) => (
                    <div key={qi} style={{ background: "#f8fafc", borderRadius: "8px", padding: "10px 12px" }}>
                      <div style={{ fontSize: "14px", fontWeight: "600" }}>
                        <span style={{ color: "#475569" }}>Q{qi + 1}.</span> {q.question}
                        {q.score != null && <span style={{ float: "right", color: scoreColor(q.score * 10), fontWeight: "bold" }}>{q.score}/10</span>}
                      </div>
                      {q.userAnswer && (
                        <p style={{ fontSize: "13px", margin: "6px 0", color: "#334155" }}>
                          <strong>我的回答：</strong>{q.userAnswer}
                          {q.timeUp && <span style={{ marginLeft: 8, fontSize: "11px", padding: "1px 8px", borderRadius: 999, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}>⏰ 超时</span>}
                        </p>
                      )}
                      {q.followUp?.question && (
                        <div style={{ margin: "6px 0", padding: "8px 10px", background: "#f5f3ff", borderLeft: "3px solid #8b5cf6", borderRadius: "6px" }}>
                          <p style={{ fontSize: "13px", margin: 0, color: "#4c1d95", fontWeight: 600 }}>
                            🗣 面试官追问{q.followUp.angle ? `（${q.followUp.angle}）` : ""}：{q.followUp.question}
                          </p>
                          {q.followUp.answer ? (
                            <p style={{ fontSize: "13px", margin: "4px 0 0", color: "#334155" }}><strong>我的补答：</strong>{q.followUp.answer}</p>
                          ) : (
                            <p style={{ fontSize: "12px", margin: "4px 0 0", color: "#94a3b8" }}>（未回应追问）</p>
                          )}
                        </div>
                      )}
                      {q.feedback && (
                        <p style={{ fontSize: "12px", margin: "4px 0", color: "#065f46", background: "#f0fdf4", padding: "6px 10px", borderRadius: "6px" }}>
                          <strong>AI 反馈：</strong>{q.feedback}
                        </p>
                      )}
                      {q.authenticityNote && (
                        <p style={{ fontSize: "12px", margin: "4px 0", color: "#3730a3", background: "#eef2ff", padding: "6px 10px", borderRadius: "6px" }}>
                          🧾 真实性核查：{q.authenticityNote}
                        </p>
                      )}
                      {q.consistency && (
                        <div style={{ fontSize: "12px", margin: "4px 0", background: "#fffbeb", border: "1px solid #fde68a", padding: "6px 10px", borderRadius: "6px" }}>
                          <strong>{CONS_LABEL[q.consistency.verdict] || CONS_LABEL.minor}</strong>
                          {q.consistency.summary ? `:${q.consistency.summary}` : ""}
                          {(q.consistency.items || []).length > 0 && (
                            <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "#57534e" }}>
                              {q.consistency.items.map((it, ii) => (
                                <li key={ii}>{it.point}{it.advice ? `(${it.advice})` : ""}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      {q.improvements?.length > 0 && (
                        <p style={{ fontSize: "12px", margin: "4px 0", color: "#7c2d12" }}>💡 待改进：{q.improvements.join("；")}</p>
                      )}
                      {q.improvedAnswer && (
                        <p style={{ fontSize: "12px", margin: "4px 0", color: "#1d4ed8", fontStyle: "italic" }}>🌟 参考回答：{q.improvedAnswer}</p>
                      )}
                    </div>
                  ))}
                  <button style={dangerBtn} onClick={() => { deleteInterviewSession(s.id); reload(); }}>删除本次记录</button>
                </div>
              )}
            </div>
          ))}
          <button style={dangerBtn} onClick={() => { if (window.confirm("清空全部面试记录？")) { clearInterviewSessions(); reload(); } }}>清空全部面试记录</button>
        </>
      )}
    </div>
  );
}
