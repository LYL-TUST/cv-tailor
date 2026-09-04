/**
 * PageHead —— 内页统一页头
 * 用法:<PageHead kicker="开始创作" title="导入已有简历" sub="上传 PDF / Word，AI 自动提取并填入编辑器。" icon="📥" />
 * icon 可选;kicker 显示在顶栏之下的页面小徽章;sub 为一句说明。
 */
export default function PageHead({ kicker, title, sub, icon }) {
  return (
    <header className="page-head">
      {kicker && (
        <div className="page-head-kicker">
          <span className="page-head-dot" />
          {kicker}
        </div>
      )}
      <h1 className="page-head-title">
        {icon && <span className="page-head-ico" aria-hidden="true">{icon}</span>}
        {title}
      </h1>
      {sub && <p className="page-head-sub">{sub}</p>}
    </header>
  );
}