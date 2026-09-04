import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listVersions } from "../utils/resumeStore";
import { listAtsRecords, listInterviewSessions } from "../utils/historyStore";

/**
 * 工作台(首页)—— 欢迎区 + 快捷入口
 * 上:欢迎 hero,根据本地简历情况给出主操作(继续编辑 / 导入);
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
    label: "打磨与投递",
    accent: "#0d9488",
    items: [
      { to: "/ats", icon: "🎯", title: "JD 匹配诊断", desc: "对照目标岗位找差距，关键词+语义分析", hint: "对症下药" },
      { to: "/interview", icon: "🎤", title: "模拟面试", desc: "AI 按岗位出题并逐题反馈回答质量", hint: "临场不慌" },
      { to: "/download", icon: "📄", title: "导出投递", desc: "PDF / Word / 纯文本，所见即所得", hint: "去投递吧" },
    ],
  },
];

export default function Dashboard() {
  const [versionCount, setVersionCount] = useState(0);
  const [activeName, setActiveName] = useState("");
  const [atsCount, setAtsCount] = useState(0);
  const [interviewCount, setInterviewCount] = useState(0);

  useEffect(() => {
    const versions = listVersions();
    setVersionCount(versions.length);
    const active = versions.find((v) => v.active) || versions[0];
    setActiveName(active ? active.name : "");
    setAtsCount(listAtsRecords().length);
    setInterviewCount(listInterviewSessions().length);
  }, []);

  const hasResume = versionCount > 0;

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
            <span className="dash-stat-num">{atsCount}</span>
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