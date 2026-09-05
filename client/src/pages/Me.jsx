import { Outlet, NavLink } from "react-router-dom";
import PageHead from "../components/PageHead";

/**
 * 个人中心 —— 本地空间(二级路由布局)
 * 各板块拆分到 /me 下的子路由:
 *   /me/resumes    我的简历
 *   /me/ats        JD 匹配历史
 *   /me/interviews 模拟面试记录
 *   /me/radar      能力雷达画像(category×difficulty×score 聚合 + 弱项针对性再练)
 *   /me/favorites  收藏夹
 *   /me/backup     数据备份与恢复(含危险区)
 *   /me/sync       云同步(可选登录 · 端到端加密)
 * 面板实现在 pages/me/ 下;此处只负责页头、隐私条、板块导航与内容出口。
 * 隐私优先:所有数据只存本机;账号体系(可选登录云同步)只用于跨设备恢复。
 */

const TABS = [
  { to: "/me/resumes", label: "📄 我的简历" },
  { to: "/me/ats", label: "🎯 JD 匹配历史" },
  { to: "/me/interviews", label: "🎤 面试记录" },
  { to: "/me/radar", label: "📈 能力画像" },
  { to: "/me/favorites", label: "⭐ 收藏夹" },
  { to: "/me/backup", label: "🔐 数据备份" },
  { to: "/me/sync", label: "☁️ 云同步" },
];

export default function Me() {
  return (
    <section style={{ maxWidth: 980, margin: "0 auto", padding: "28px 24px" }}>
      <PageHead
        kicker="账户"
        title="个人中心"
        icon="👤"
        sub="无需登录 —— 你的简历与练习记录都保存在这台设备上，只有你能看到。"
      />

      <div style={{ padding: "10px 14px", background: "#ecfdf5", borderRadius: "8px", fontSize: "13px", color: "#065f46", marginBottom: "12px" }}>
        🔒 隐私说明：数据不上传服务器。本机数据可能因清除浏览器数据而丢失 —— 建议定期在「数据备份」页做加密备份。
      </div>

      <nav className="me-tabs" aria-label="个人中心板块">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => `me-tab${isActive ? " active" : ""}`}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />

      <p className="me-footer">
        简历智造 · 默认本地优先，登录仅用于端到端加密云同步（服务器只存密文）
      </p>
    </section>
  );
}
