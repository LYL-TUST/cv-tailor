import { useState } from "react";
import { listVersions, getActiveVersion } from "../utils/resumeStore";
import { isEmptyResumeData } from "../utils/resumeContext";

/**
 * ResumePicker —— 工具页「本次基于哪份简历」选择器
 *
 * 让 ATS/模拟面试/求职信等页面显式声明匹配对象，消除「到底用哪份简历」的歧义。
 * 切换只影响本次使用（不写穿激活版本，与编辑器当前版本互不干扰）。
 *
 * props:
 * - version: 当前选中版本对象（受控）或 null → 组件内部默认取激活版本
 * - onChange(version): 用户切换后回调（version 含 data）
 * - label: 选择器标签文案（默认「用于本次匹配的简历」）
 */
export default function ResumePicker({ version, onChange, label = "用于本次分析的简历" }) {
  const [versions] = useState(() => listVersions()); // 组件挂载时快照，避免每次渲染重算迁移
  const [active] = useState(() => getActiveVersion());

  const current = version || active || null;

  if (!current || versions.length === 0) {
    return (
      <div className="notice notice-warn" style={{ margin: 0 }}>
        ⚠️ 还没有简历版本，请先在「编辑器」中创建或导入一份简历。
      </div>
    );
  }

  const handleChange = (e) => {
    const id = e.target.value;
    const target = versions.find((v) => v.id === id);
    if (target && onChange) onChange(target);
  };

  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const empty = isEmptyResumeData(current.data);

  return (
    <div className="resume-picker">
      <label className="resume-picker-label" htmlFor="resume-picker-select">
        📄 {label}
      </label>
      <div className="resume-picker-row">
        <select
          id="resume-picker-select"
          className="resume-picker-select"
          value={current.id}
          onChange={handleChange}
          disabled={versions.length <= 1}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name || "未命名简历"}
              {v.data && v.data.personalInfo?.title ? `（${v.data.personalInfo.title}）` : ""}
            </option>
          ))}
        </select>
        <span className="resume-picker-meta">
          {current.updatedAt ? `更新于 ${fmtDate(current.updatedAt)}` : ""}
          {current.id === active?.id ? " · 当前编辑版本" : " · 非编辑中版本"}
        </span>
      </div>
      {empty && (
        <p className="resume-picker-empty">⚠️ 该版本尚未填写内容（空简历），分析结果将无意义，建议先到编辑器完善。</p>
      )}
    </div>
  );
}
