/**
 * Editor 顶部工具条 —— WPS 风
 *
 * 布局:
 *   [ 我的简历 ▾ ]  [ ↶ ↷ ]    [ 🤖 AI 一键优化 ] [ ✨ 简历美化 ] [ 📊 智能分析 ] [ 🎤 AI 面试官 ]    [ 下载简历 ]
 *
 * 简历下拉:多版本切换 + 新建/复制/重命名/删除
 * AI 工具组:点击触发对应 AI(feature 传入 onAI)
 * 下载按钮:跳转 /download
 */
import { useState, useRef, useEffect } from "react";

const AI_TOOLS = [
  { id: "optimize", icon: "🤖", label: "AI 一键优化" },
  { id: "beautify", icon: "✨", label: "简历美化" },
  { id: "analyze", icon: "📊", label: "智能分析" },
  { id: "interview", icon: "🎤", label: "AI 面试官", badge: "NEW" },
];

export default function EditorTopbar({
  versions,
  activeId,
  onSwitchVersion,
  onCreateVersion,
  onDuplicateVersion,
  onRenameVersion,
  onDeleteVersion,
  activeAI,
  onAISelect,
  onAI,
  onDownload,
  onToggleDrawer,
  drawerOpen,
  undoCount = 0,
  redoCount = 0,
  onUndo,
  onRedo,
}) {
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!versionMenuOpen) return;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setVersionMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [versionMenuOpen]);

  const activeVersion = versions.find((v) => v.id === activeId);

  return (
    <div className="editor-topbar">
      {/* 左侧:文档级菜单 + 简历下拉 */}
      <div className="tb-left">
        <div className="tb-version" ref={menuRef}>
          <button
            className="tb-version-btn"
            onClick={() => setVersionMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={versionMenuOpen}
          >
            <span className="tb-version-ico" aria-hidden="true">📄</span>
            <span className="tb-version-name">
              {activeVersion?.name || "未命名简历"}
            </span>
            <span className="tb-version-caret" aria-hidden="true">▾</span>
          </button>

          {versionMenuOpen && (
            <div className="tb-version-menu" role="menu">
              <div className="tb-version-menu-head">切换简历版本</div>
              <ul className="tb-version-list">
                {versions.length === 0 && (
                  <li className="tb-version-empty">暂无版本,先新建一个吧</li>
                )}
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className={`tb-version-item${v.id === activeId ? " active" : ""}`}
                    role="menuitem"
                    onClick={() => {
                      onSwitchVersion?.(v.id);
                      setVersionMenuOpen(false);
                    }}
                  >
                    <span className="tb-version-item-name">{v.name}</span>
                    {v.id === activeId && <span className="tb-version-item-mark">✓</span>}
                  </li>
                ))}
              </ul>
              <div className="tb-version-actions">
                <button className="tb-version-act" onClick={() => { onCreateVersion?.(); setVersionMenuOpen(false); }}>
                  ＋ 新建空白
                </button>
                <button className="tb-version-act" onClick={() => { onDuplicateVersion?.(); setVersionMenuOpen(false); }}>
                  ⧉ 复制当前
                </button>
                <button className="tb-version-act" onClick={() => { onRenameVersion?.(); setVersionMenuOpen(false); }}>
                  ✎ 重命名
                </button>
                <button
                  className="tb-version-act tb-version-act-danger"
                  onClick={() => { onDeleteVersion?.(); setVersionMenuOpen(false); }}
                  disabled={versions.length <= 1}
                >
                  🗑 删除
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="tb-history" role="group" aria-label="撤销与重做">
          <button
            className="tb-history-btn"
            onClick={onUndo}
            disabled={undoCount === 0}
            title="撤销 (Ctrl+Z)"
            aria-label="撤销"
          >
            ↶
          </button>
          <button
            className="tb-history-btn"
            onClick={onRedo}
            disabled={redoCount === 0}
            title="重做 (Ctrl+Y)"
            aria-label="重做"
          >
            ↷
          </button>
        </div>
      </div>

      {/* 中间:AI 工具组 */}
      <div className="tb-ai" role="tablist" aria-label="AI 工具">
        {AI_TOOLS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeAI === t.id}
            className={`tb-ai-btn${activeAI === t.id ? " active" : ""}`}
            onClick={() => {
              onAISelect?.(t.id);
              onAI?.(t.id);
            }}
            title={t.label}
          >
            <span className="tb-ai-ico" aria-hidden="true">{t.icon}</span>
            <span className="tb-ai-label">{t.label}</span>
            {t.badge && <span className="tb-ai-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* 右侧:抽屉 toggle + 下载 */}
      <div className="tb-right">
        <button
          className={`tb-drawer-toggle${drawerOpen ? " active" : ""}`}
          onClick={onToggleDrawer}
          aria-label={drawerOpen ? "收起简历美化" : "展开简历美化"}
          aria-pressed={drawerOpen}
          title="简历美化"
        >
          <span aria-hidden="true">🎨</span>
          <span className="tb-drawer-toggle-label">美化</span>
        </button>
        <button className="tb-download" onClick={onDownload}>
          <span aria-hidden="true">⤓</span>
          <span>下载简历</span>
        </button>
      </div>
    </div>
  );
}