/**
 * 个人中心(二级路由)共享 UI —— 格式化 / 样式常量 / 小组件
 * 由 pages/me/ 下各面板组件复用,避免六处重复实现。
 */

export const fmtDate = (ts) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const scoreColor = (s) => (s >= 80 ? "#16a34a" : s >= 60 ? "#f59e0b" : "#ef4444");

/** 面试「资料包」模式 → 中文标签（历史回看用） */
export const interviewModeLabel = (mode) => {
  const map = {
    "title": "仅职位名",
    "title+jd": "JD 定向",
    "title+resume": "结合简历",
    "title+jd+resume": "全面定制",
  };
  return map[mode] || mode;
};

/** 收藏题类型 → 中文标签 */
export const favTypeLabel = (t) => (
  t === "resume-drill" ? "深挖" : t === "behavioral" ? "行为面" : t === "technical" ? "技术面" : "综合"
);

export const FAV_DIFF = {
  easy: { label: "简单", fg: "#15803d", bg: "#dcfce7" },
  medium: { label: "中等", fg: "#b45309", bg: "#fef3c7" },
  hard: { label: "困难", fg: "#b91c1c", bg: "#fee2e2" },
};

export const chipStyle = (fg, bg) => ({
  background: bg, color: fg, padding: "1px 8px", borderRadius: "11px", fontSize: "12px", display: "inline-block",
});

/* ===== 面板通用卡片 / 按钮 ===== */
/* 卡片视觉(背景/边框/圆角/阴影/hover)由 .me-card 类提供,此处只保留
 * 内联 padding 与间距,避免内联样式覆盖 hover 效果 */
export const cardBase = { padding: "14px 16px", marginBottom: "10px" };
export const ghostBtn = { fontSize: "12px", padding: "3px 10px", cursor: "pointer", background: "none", border: "1px solid #cbd5e1", borderRadius: "6px", color: "#475569" };
export const dangerBtn = { ...ghostBtn, color: "#dc2626", borderColor: "#fca5a5" };

/** 面板内小节标题(首个传 marginTop=0,紧贴 tab 条) */
export function SectionTitle({ text, badge, marginTop = 20 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: `${marginTop}px 0 12px` }}>
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

/** 统一空态:图标圆点 + 标题 + 描述 + 可选 CTA */
export function EmptyState({ icon = "📭", title, desc, cta }) {
  return (
    <div className="empty-state">
      <div className="empty-state-ico" aria-hidden="true">{icon}</div>
      <p className="empty-state-title">{title}</p>
      {desc && <p className="empty-state-desc">{desc}</p>}
      {cta && <div className="empty-state-cta">{cta}</div>}
    </div>
  );
}

/** JD 匹配分趋势(改简历 → 分数提升的可视化闭环) */
export function AtsTrend({ records }) {
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
