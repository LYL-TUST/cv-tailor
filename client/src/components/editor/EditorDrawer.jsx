/**
 * Editor 右侧抽屉 —— "简历美化"面板
 *
 * 三 tab:
 *   - 切换模板:2 列模板网格,当前模板蓝框高亮,点击应用
 *   - 排版设置:行距 / 字号 / 对齐 / 页边距(写 settings.typography,画布 + DOCX 同步)
 *   - 模块管理:隐藏/显示内容模块 + 拖拽排序(单栏模板 classy/simple 支持排序)
 */
import { useState } from "react";
import {
  CONTENT_MODULES, LINE_HEIGHTS, FONT_SIZES, ALIGNS, MARGINS,
} from "../../utils/resumeSettings";

const TABS = [
  { id: "templates", icon: "🎨", label: "切换模板" },
  { id: "layout", icon: "📐", label: "排版设置" },
  { id: "modules", icon: "🧱", label: "模块管理" },
];

export default function EditorDrawer({
  open,
  onClose,
  templates,
  currentTemplateId,
  onSelectTemplate,
  settings,
  orderSupported = false,
  onSettingsChange,
}) {
  const [activeTab, setActiveTab] = useState("templates");

  if (!settings) return null;

  const { typography, moduleVisible, moduleOrder } = settings;

  /* ===== 排版 ===== */
  const setTypo = (key, value) => {
    onSettingsChange?.({
      typography: { ...typography, [key]: value },
    });
  };

  /* ===== 模块可见性 ===== */
  const toggleModule = (id) => {
    onSettingsChange?.({
      moduleVisible: { ...moduleVisible, [id]: !moduleVisible[id] },
    });
  };

  /* ===== 模块排序(单栏模板) ===== */
  const moveModule = (from, to) => {
    if (to < 0 || to >= moduleOrder.length) return;
    const next = [...moduleOrder];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onSettingsChange?.({ moduleOrder: next });
  };

  // 渲染用的模块列表:单栏用用户 order,双栏用默认顺序(仅可见性生效)
  const displayModules = CONTENT_MODULES
    .filter((m) => moduleOrder.includes(m.id))
    .sort((a, b) => moduleOrder.indexOf(a.id) - moduleOrder.indexOf(b.id));

  return (
    <aside className={`editor-drawer${open ? " open" : ""}`} aria-label="简历美化">
      <div className="drawer-head">
        <div className="drawer-title">
          <span className="drawer-title-ico" aria-hidden="true">🎨</span>
          <span>简历美化</span>
        </div>
        <button className="drawer-close" onClick={onClose} aria-label="关闭简历美化">×</button>
      </div>

      <div className="drawer-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={`drawer-tab${activeTab === t.id ? " active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span className="drawer-tab-ico" aria-hidden="true">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="drawer-body">
        {activeTab === "templates" && (
          <div className="drawer-templates">
            {templates.map((t) => {
              const isActive = t.id === currentTemplateId;
              return (
                <button
                  key={t.id}
                  className={`drawer-template${isActive ? " active" : ""}`}
                  onClick={() => onSelectTemplate?.(t.id)}
                  aria-pressed={isActive}
                  title={t.description}
                >
                  <div className="drawer-template-thumb">
                    <img src={t.previewImage} alt={t.name} loading="lazy" />
                    {isActive && <span className="drawer-template-mark">✓ 当前</span>}
                  </div>
                  <div className="drawer-template-meta">
                    <div className="drawer-template-name">{t.name}</div>
                    <div className="drawer-template-desc">{t.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {activeTab === "layout" && (
          <div className="drawer-layout">
            <p className="drawer-section-hint">排版设置同步作用于画布预览与 PDF / Word 导出。</p>

            <div className="drawer-section">
              <div className="drawer-label">行距</div>
              <div className="drawer-seg">
                {LINE_HEIGHTS.map((o) => (
                  <button
                    key={o.id}
                    className={`drawer-seg-btn${typography.lineHeight === o.value ? " active" : ""}`}
                    onClick={() => setTypo("lineHeight", o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="drawer-section">
              <div className="drawer-label">正文字号</div>
              <div className="drawer-seg">
                {FONT_SIZES.map((o) => (
                  <button
                    key={o.id}
                    className={`drawer-seg-btn${typography.fontSize === o.value ? " active" : ""}`}
                    onClick={() => setTypo("fontSize", o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="drawer-section">
              <div className="drawer-label">正文对齐</div>
              <div className="drawer-seg">
                {ALIGNS.map((o) => (
                  <button
                    key={o.id}
                    className={`drawer-seg-btn${typography.align === o.value ? " active" : ""}`}
                    onClick={() => setTypo("align", o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="drawer-section">
              <div className="drawer-label">页边距</div>
              <div className="drawer-seg">
                {MARGINS.map((o) => (
                  <button
                    key={o.id}
                    className={`drawer-seg-btn${typography.margin === o.value ? " active" : ""}`}
                    onClick={() => setTypo("margin", o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "modules" && (
          <div className="drawer-modules">
            <p className="drawer-section-hint">
              {orderSupported
                ? "隐藏不需要的模块,或拖拽手柄调整顺序(实时反映到画布与导出)。"
                : "可隐藏不需要的模块;当前双栏版式固定顺序,切换单栏模板后即可拖拽排序。"}
            </p>

            <ul className="module-list">
              {displayModules.map((m, i) => {
                const visible = moduleVisible[m.id];
                return (
                  <li
                    key={m.id}
                    className={`module-item${!visible ? " hidden" : ""}`}
                    draggable={orderSupported}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(i));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (!orderSupported) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      if (!orderSupported) return;
                      e.preventDefault();
                      const from = Number(e.dataTransfer.getData("text/plain"));
                      if (Number.isInteger(from) && from !== i) moveModule(from, i);
                    }}
                  >
                    <span className="module-drag" aria-hidden="true" title={orderSupported ? "拖拽排序" : undefined}>
                      {orderSupported ? "⋮⋮" : "•"}
                    </span>
                    <span className="module-ico" aria-hidden="true">{m.icon}</span>
                    <span className="module-name">{m.label}</span>
                    {!visible && <span className="module-hidden-tag">已隐藏</span>}
                    <button
                      className={`module-toggle${visible ? " on" : ""}`}
                      onClick={() => toggleModule(m.id)}
                      role="switch"
                      aria-checked={visible}
                      aria-label={`${visible ? "隐藏" : "显示"}${m.label}`}
                    >
                      <span className="module-toggle-knob" />
                    </button>
                  </li>
                );
              })}
            </ul>

            {orderSupported && displayModules.length > 0 && (
              <div className="module-hint">
                提示:拖拽即可换序;隐藏的模块不会出现在画布与导出文档中。
              </div>
            )}
          </div>
        )}
      </div>

      <div className="drawer-foot">
        🔒 数据默认仅存本机 · 不登录完整可用
      </div>
    </aside>
  );
}