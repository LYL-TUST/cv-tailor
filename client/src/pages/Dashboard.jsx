import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listVersions, getActiveVersion } from "../utils/resumeStore";
import { listAtsRecords, listInterviewSessions } from "../utils/historyStore";
import { getEvents } from "../utils/analytics";

/**
 * 工作台(首页)—— 欢迎区 + 旅程进度流 + 快捷入口
 * 上:欢迎 hero,根据本地简历情况给出主操作(继续编辑 / 导入);
 * 中:五步进度流(导入 → 编辑 → 诊断 → 面试 → 导出),把产品主线叙事显性化;
 * 下:按旅程分组的快捷入口卡,一键直达各工具。
 */

const QUICK_GROUPS = [
  {
    label: "开始创作",
    accent: "#2563eb",
    items: [
      { to: "/import", icon: "📥", title: "导入简历", desc: "上传 PDF / Word，AI 自动提取内容", hint: "已有简历" },
      { to: "/editor", icon: "✏️", title: "简历编辑器", desc: "编写与 AI 优化，多版本按岗位留存", hint: "核心工作区" },
      { to: "/templates", icon: "🎨", title: "模板主题", desc: "ATS 友好模板，换色换字体实时预览", hint: "4 套模板" },
    ],
  },
  {
    label: "打磨与面试",
    accent: "#0d9488",
    items: [
      { to: "/ats", icon: "🎯", title: "JD 匹配诊断", desc: "对照目标岗位找差距，关键词+语义分析", hint: "对症下药" },
      { to: "/interview", icon: "🎤", title: "模拟面试", desc: "AI 按岗位出题并逐题反馈回答质量", hint: "临场不慌" },
    ],
  },
];

export default function Dashboard() {
  const [versionCount, setVersionCount] = useState(0);
  const [activeName, setActiveName] = useState("");
  const [activeReady, setActiveReady] = useState(false);
  const [atsRecords, setAtsRecords] = useState([]);
  const [interviewCount, setInterviewCount] = useState(0);
  const [pdfExports, setPdfExports] = useState(0);

  useEffect(() => {
    const versions = listVersions();
    setVersionCount(versions.length);
    const active = getActiveVersion() || versions.find((v) => v.active) || versions[0];
    setActiveName(active ? active.name : "");
    setActiveReady(!!(active && active.data && !active.data.empty));
    setAtsRecords(listAtsRecords());
    setInterviewCount(listInterviewSessions().length);
    setPdfExports(getEvents().filter((e) => e.e === "pdf_export" && e.p?.status === "success").length);
  }, []);

  const hasResume = versionCount > 0;

  // ===== 五步旅程进度流:把「导入 → 编辑 → 诊断 → 面试 → 导出」主线显性化 =====
  const lastAts = atsRecords[0] || null;
  const steps = [
    { to: "/import", icon: "📥", label: "导入", done: hasResume, sub: hasResume ? `${versionCount} 个版本` : "尚无简历" },
    { to: "/editor", icon: "✏️", label: "编辑", done: activeReady, sub: activeReady ? `「${activeName || "当前简历"}」` : "完善内容" },
    { to: "/ats", icon: "🎯", label: "诊断", done: atsRecords.length > 0, sub: lastAts ? `上次 ${lastAts.score ?? "?"} 分` : "未诊断" },
    { to: "/interview", icon: "🎤", label: "面试", done: interviewCount > 0, sub: interviewCount > 0 ? `练了 ${interviewCount} 场` : "未练习" },
    { to: "/editor", icon: "📄", label: "导出", done: pdfExports > 0, sub: pdfExports > 0 ? `PDF ×${pdfExports}` : "待导出" },
  ];
  // 第一个未完成的步骤 = 当前进行中
  const currentIdx = steps.findIndex((s) => !s.done);

  return (
    <div className="dash">
      {/* ===== 欢迎区 ===== */}
      <section className="dash-welcome">
        <div className="dash-welcome-copy">
          <div className="dash-eyebrow">
            <span className="dash-eyebrow-dot" />
            本地优先 · 数据不离开浏览器
          </div>

          <h1 className="dash-title">
            {hasResume ? (
              <>继续打磨你的简历<br /><span className="dash-grad">一份好的作品，值得慢慢雕琢。</span></>
            ) : (
              <>从零到一封能打的简历<br /><span className="dash-grad">AI 帮你写，事实由你把关。</span></>
            )}
          </h1>

          <p className="dash-sub">
            {hasResume
              ? `当前简历「${activeName}」共 ${versionCount} 个版本。可以继续编辑，或为另一个岗位另起一版。`
              : "上传已有的 PDF / Word 让 AI 自动提取，或从空白开始，让 AI 陪你写出经得起面试官追问的简历。"}
          </p>

          <div className="dash-ctas">
            {hasResume ? (
              <>
                <Link to="/editor" className="btn btn-primary btn-lg">✏️ 继续编辑</Link>
                <Link to="/import" className="btn btn-ghost btn-lg">📥 导入新简历</Link>
              </>
            ) : (
              <>
                <Link to="/import" className="btn btn-primary btn-lg">📥 导入我的简历</Link>
                <Link to="/editor" className="btn btn-ghost btn-lg">✏️ 从零开始</Link>
              </>
            )}
          </div>
        </div>

        {/* 数据统计卡 */}
        <div className="dash-welcome-side">
          <div className="dash-stat">
            <span className="dash-stat-num">{versionCount}</span>
            <span className="dash-stat-label">简历版本</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat-num">{atsRecords.length}</span>
            <span className="dash-stat-label">ATS 分析</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat-num">{interviewCount}</span>
            <span className="dash-stat-label">面试练习</span>
          </div>
          <div className="dash-stat dash-stat-privacy">
            <span className="dash-stat-icon">🔒</span>
            <span className="dash-stat-label">数据仅存本机<br />随时导出备份</span>
          </div>
        </div>
      </section>

      {/* ===== 旅程进度流 ===== */}
      <nav className="dash-steps" aria-label="求职准备进度">
        {steps.map((s, i) => (
          <Link
            key={s.label}
            to={s.to}
            className={[
              "dash-step",
              s.done ? " done" : "",
              i === currentIdx ? " current" : "",
            ].join("")}
            title={s.sub}
          >
            <span className="dash-step-node" aria-hidden="true">{s.done ? "✓" : s.icon}</span>
            <span className="dash-step-body">
              <b className="dash-step-label">{s.label}</b>
              <i className="dash-step-sub">{i === currentIdx ? "进行中 · " : ""}{s.sub}</i>
            </span>
            {i < steps.length - 1 && <span className="dash-step-link" aria-hidden="true" />}
          </Link>
        ))}
      </nav>

      {/* ===== 快捷入口 ===== */}
      {QUICK_GROUPS.map((g) => (
        <section key={g.label} className="dash-group">
          <header className="dash-group-head">
            <span className="dash-group-bar" style={{ background: g.accent }} />
            <h2 className="dash-group-title">{g.label}</h2>
          </header>

          <div className="dash-grid">
            {g.items.map((it) => (
              <Link key={it.to} to={it.to} className="quick-card">
                <span className="quick-icon" aria-hidden="true">{it.icon}</span>
                <div className="quick-body">
                  <div className="quick-title-row">
                    <span className="quick-title">{it.title}</span>
                    <span className="quick-go" aria-hidden="true">→</span>
                  </div>
                  <span className="quick-desc">{it.desc}</span>
                </div>
                <span className="quick-hint">{it.hint}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}