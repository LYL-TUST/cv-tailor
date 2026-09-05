import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

/**
 * Layout —— 应用壳:左侧分组导航 + 顶栏 + 内容区
 * 参考主流求职工具(Teal / Rezi / Notion 系)的固定侧栏模式。
 * 结构(按用户旅程编排:做事 → 磨 → 看):
 *   工作台(置顶独立入口,总览/旅程进度)
 *   创作   — 导入简历 / 简历编辑器 / 模板主题
 *   对标 JD — JD 诊断 / 模拟面试(围绕目标岗位打磨)
 *   复盘   — 个人中心(能力画像+数据看板并入,数据备份/云同步)
 * 移动端:侧栏收起为抽屉,由顶栏汉堡按钮唤出。
 */

const NAV_GROUPS = [
  {
    label: null, // 不渲染分组标题,置顶的独立总览入口
    items: [{ to: "/dashboard", icon: "🏠", label: "工作台" }],
  },
  {
    label: "创作",
    items: [
      { to: "/import", icon: "📥", label: "导入简历" },
      { to: "/editor", icon: "✏️", label: "简历编辑器" },
      { to: "/templates", icon: "🎨", label: "模板主题" },
    ],
  },
  {
    label: "对标 JD",
    items: [
      { to: "/ats", icon: "🎯", label: "JD 诊断" },
      { to: "/interview", icon: "🎤", label: "模拟面试" },
    ],
  },
  {
    label: "复盘",
    items: [
      { to: "/me", icon: "👤", label: "个人中心" },
    ],
  },
];

/** 顶栏显示的当前分组名;无分组(工作台)显示入口自身名 */
function groupNameOf(pathname) {
  for (const g of NAV_GROUPS) {
    if (g.items.some((i) => pathname.startsWith(i.to))) {
      return g.label || g.items.find((i) => pathname.startsWith(i.to)).label;
    }
  }
  return "";
}

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // 路由变化时自动关闭移动端抽屉
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="app-shell">
      {/* ===== 侧边栏 ===== */}
      <aside className={`sidebar${open ? " sidebar-open" : ""}`}>
        <NavLink to="/dashboard" className="sb-brand">
          <img src="/logo.png" alt="简历智造" />
          <span className="sb-brand-name">简历智造</span>
        </NavLink>

        <nav className="sb-nav">
          {NAV_GROUPS.map((g) => (
            <div key={g.label ?? g.items[0].to} className={g.label ? undefined : "sb-top"}>
              {g.label && <div className="sb-group">{g.label}</div>}
              {g.items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  className={({ isActive }) => `sb-link${isActive ? " active" : ""}`}
                >
                  <span className="sb-ico" aria-hidden="true">{i.icon}</span>
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sb-foot">
          🔒 本地优先 · 登录可选(端到端加密)<br />
          © {new Date().getFullYear()} 简历智造
        </div>
      </aside>

      {/* 移动端抽屉遮罩 */}
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      {/* ===== 主区 ===== */}
      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="menu-btn"
            onClick={() => setOpen(true)}
            aria-label="打开导航"
          >
            ☰
          </button>

          <span className="tb-group">
            <b>{groupNameOf(location.pathname)}</b>
          </span>

          <span className="tb-spacer" />

          <span className="tb-badge">🔒 数据仅存本机</span>
        </header>

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}