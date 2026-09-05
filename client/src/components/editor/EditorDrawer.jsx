/**
 * Editor 右侧抽屉 —— "简历美化"面板
 *
 * 三 tab:
 *   - 切换模板:2 列模板网格,当前模板蓝框高亮,点击应用
 *   - 排版设置:行距 / 字号 / 对齐 / 页边距(写 settings.typography,画布 + DOCX 同步)
 *   - 模块管理:按「栏」分组展示(单栏=正文一组,双栏=各栏一组),栏内拖拽排序 + 可见性开关
 *
 * zones:由父级传入当前模板的 TEMPLATE_ZONES 分区定义;拖拽只发生在同一栏内。
 */
import { useEffect, useState } from "react";
import {
  CONTENT_MODULES, LINE_HEIGHTS, FONT_SIZES, ALIGNS, MARGINS, zoneSeq, moveWithinZone,
} from "../../utils/resumeSettings";

const TABS = [
  { id: "templates", icon: "🎨", label: "切换模板" },
  { id: "layout", icon: "📐", label: "排版设置" },
  { id: "modules", icon: "🧱", label: "模块管理" },
];

/** 分段按钮组:主标签 + 数值副标签(排版数值一眼可预期) */
function SegGroup({ options, current, onPick, name }) {
  return (
    <div className="drawer-seg" role="group" aria-label={name}>
      {options.map((o) => (
        <button
          key={o.id}
          className={`drawer-seg-btn${current === o.value ? " active" : ""}`}
          onClick={() => onPick(o.value)}
          aria-pressed={current === o.value}
        >
          <span className="drawer-seg-txt">{o.label}</span>
          {o.num && <span className="drawer-seg-num">{o.num}</span>}
        </button>
      ))}
    </div>
  );
}

export default function EditorDrawer({
  open,
  onClose,
  templates,
  currentTemplateId,
  onSelectTemplate,
  settings,
  zones,
  onSettingsChange,
  requestedTab = null,
  tabRequestTick = 0,
  customSections = [],
  onAddCustom,
  onRenameCustom,
  onRemoveCustom,
}) {
  const [activeTab, setActiveTab] = useState("templates");
  // 拖拽过程状态(dragIdx 当前行 / overIdx 落点行)
  const [drag, setDrag] = useState({ zoneId: null, from: -1, over: -1 });

  // 外部请求切换 tab(如顶部「简历美化」→ 模板 tab)
  useEffect(() => {
    if (requestedTab && tabRequestTick > 0 && requestedTab !== activeTab) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab, tabRequestTick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings) return null;

  const { typography, moduleVisible, moduleOrder } = settings;
  const zoneList = zones && zones.length ? zones : null;

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

  /* ===== 模块排序(同一栏内拖拽 → 重建全局 moduleOrder) ===== */
  const moveInZone = (zoneId, from, to) => {
    if (!zoneList || from < 0 || to < 0 || from === to) return;
    const next = moveWithinZone(zoneList, moduleOrder, zoneId, from, to);
    if (next !== moduleOrder) onSettingsChange?.({ moduleOrder: next });
  };

  /* 某栏内当前显示顺序对应的模块元数据(内置 + 自定义混排) */
  const metaOf = (id) => {
    const m = CONTENT_MODULES.find((x) => x.id === id);
    if (m) return { ...m };
    if (typeof id === 'string' && id.startsWith('custom:')) {
      const s = customSections.find((c) => `custom:${c.id}` === id);
      if (s) return { id, icon: '📦', label: s.title || '未命名模块', custom: true };
    }
    return null;
  };
  const rowsOf = (zone) => zoneSeq(moduleOrder, zone).map(metaOf).filter(Boolean);

  const isSingleZone = !zoneList || zoneList.length <= 1;

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
              <SegGroup name="行距" options={LINE_HEIGHTS} current={typography.lineHeight} onPick={(v) => setTypo("lineHeight", v)} />
            </div>

            <div className="drawer-section">
              <div className="drawer-label">正文字号</div>
              <SegGroup name="字号" options={FONT_SIZES} current={typography.fontSize} onPick={(v) => setTypo("fontSize", v)} />
            </div>

            <div className="drawer-section">
              <div className="drawer-label">正文对齐</div>
              <SegGroup name="对齐" options={ALIGNS} current={typography.align} onPick={(v) => setTypo("align", v)} />
            </div>

            <div className="drawer-section">
              <div className="drawer-label">页边距</div>
              <SegGroup name="页边距" options={MARGINS} current={typography.margin} onPick={(v) => setTypo("margin", v)} />
            </div>
          </div>
        )}

        {activeTab === "modules" && (
          <div className="drawer-modules">
            <p className="drawer-section-hint">
              {isSingleZone
                ? "隐藏不需要的模块,或拖拽手柄调整顺序(实时反映到画布与导出)。"
                : "双栏版式按「栏」分组:在栏内拖拽可调整顺序,模块固定属于所在栏。"}
            </p>

            {(zoneList || [{ id: "flow", label: "", modules: CONTENT_MODULES.map((m) => m.id) }]).map((zone, zi) => {
              const rows = rowsOf(zone);
              if (rows.length === 0) return null;
              const canDrag = rows.length > 1;
              return (
                <div className="module-zone" key={zone.id}>
                  {!isSingleZone && (
                    <div className="module-zone-cap">
                      <span>{zone.label}</span>
                      <span className="module-zone-count">{rows.length} 个模块</span>
                    </div>
                  )}
                  <ul className="module-list">
                    {rows.map((m, i) => {
                      const visible = moduleVisible[m.id];
                      const isDragging = drag.zoneId === zone.id && drag.from === i;
                      const isOver = drag.zoneId === zone.id && drag.over === i && drag.from !== i;
                      return (
                        <li
                          key={m.id}
                          className={`module-item${!visible ? " hidden" : ""}${isDragging ? " dragging" : ""}${isOver ? " drag-over" : ""}`}
                          draggable={canDrag}
                          onDragStart={(e) => {
                            setDrag({ zoneId: zone.id, from: i, over: -1 });
                            e.dataTransfer.setData("text/plain", `${zone.id}:${i}`);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnter={(e) => {
                            if (!canDrag || drag.zoneId !== zone.id) return;
                            e.preventDefault();
                            if (drag.over !== i) setDrag((d) => ({ ...d, over: i }));
                          }}
                          onDragOver={(e) => {
                            if (!canDrag || drag.zoneId !== zone.id) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDragLeave={() => {
                            if (drag.over === i) setDrag((d) => ({ ...d, over: -1 }));
                          }}
                          onDrop={(e) => {
                            if (!canDrag) return;
                            e.preventDefault();
                            const [zid, rawFrom] = (e.dataTransfer.getData("text/plain") || "").split(":");
                            const from = Number(rawFrom);
                            if (zid === zone.id && Number.isInteger(from) && from !== i) {
                              moveInZone(zone.id, from, i);
                            }
                            setDrag({ zoneId: null, from: -1, over: -1 });
                          }}
                          onDragEnd={() => setDrag({ zoneId: null, from: -1, over: -1 })}
                        >
                          <span
                            className={`module-drag${canDrag ? " can-drag" : ""}`}
                            aria-hidden="true"
                            title={canDrag ? "拖拽排序" : "该栏仅一个模块,无需排序"}
                          >
                            {canDrag ? "⋮⋮" : "•"}
                          </span>
                          <span className="module-ico" aria-hidden="true">{m.icon}</span>
                          <span className="module-name">{m.label}</span>
                          {!visible && <span className="module-hidden-tag">已隐藏</span>}
                          {m.custom && (
                            <span className="module-custom-ops">
                              <button className="module-mini-btn" title="重命名模块标题" onClick={() => onRenameCustom?.(m.id.slice(7))}>✎</button>
                              <button className="module-mini-btn danger" title="删除模块" onClick={() => onRemoveCustom?.(m.id.slice(7))}>🗑</button>
                            </span>
                          )}
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
                </div>
              );
            })}

            {/* 自定义模块入口 */}
            <div className="module-add-bar">
              <button className="btn-ghost" style={{ fontSize: 13, padding: "6px 14px" }} onClick={() => onAddCustom?.()}>
                ＋ 添加自定义模块
              </button>
              <p className="drawer-section-hint">
                自定义模块会作为「📦」出现在上方模块列表中，可与内置模块一起拖拽编排顺序。
              </p>
            </div>

            {zoneList && zoneList.length > 1 && (
              <div className="module-hint">
                提示:双栏模板的顺序由全局模块偏好统一驱动;切到单栏模板时也会沿用同一套顺序。
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
