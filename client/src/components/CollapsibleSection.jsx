import { useState } from "react";

/**
 * 通用可折叠模块(用于结果区/面板分区)
 * 标题行 = 图标 + 标题 + 摘要徽标 + 旋转箭头,整行可点展开/收起;
 * 样式复用 .ats-sec 系列(见 styles.css)。
 */
export default function CollapsibleSection({ icon, title, meta, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`ats-sec${open ? " open" : ""}`}>
      <button
        type="button"
        className="ats-sec-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="ats-sec-title">{icon} {title}</span>
        {meta != null && meta !== "" && <span className="ats-sec-meta">{meta}</span>}
        <span className="ats-sec-arrow" aria-hidden="true">▸</span>
      </button>
      {open && <div className="ats-sec-body">{children}</div>}
    </div>
  );
}
