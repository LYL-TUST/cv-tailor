import { useState, useRef } from "react";
import { track } from "../../utils/analytics";

/**
 * EditablePhoto —— 简历证件照占位/上传(预留入口)
 *
 * 状态:
 *   - 空:虚线框 + 📷 添加照片(hover 高亮,点击弹出文件选择)
 *   - 有图:渲染 img cover;hover 浮出遮罩,可「更换 / 移除」
 *
 * 尺寸由父级 CSS 控制(默认 .editable-photo 96×128),模板上下文覆盖;
 * 存储:FileReader 转 dataURL(≤2MB),写回 resume.photo
 * 导出集成:未来在 PDF/DOCX 渲染时读取同一字段(P1.2 模块管理/导出统一处理)。
 */
export default function EditablePhoto({ value, onChange }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const handlePick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许连续选同一文件
    if (!file) return;

    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      alert("仅支持 PNG / JPG / WEBP 图片");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("图片不能超过 2MB,请压缩后再试");
      return;
    }

    const reader = new FileReader();
    setBusy(true);
    reader.onload = () => {
      onChange?.(reader.result); // dataURL
      setBusy(false);
      track("photo_upload", { bytes: file.size });
    };
    reader.onerror = () => {
      setBusy(false);
      alert("图片读取失败,请重试");
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = () => {
    onChange?.("");
    setMenuOpen(false);
  };

  const openPicker = () => fileRef.current?.click();
  const toggleMenu = (e) => {
    e.stopPropagation();
    setMenuOpen((v) => !v);
  };

  return (
    <div className={`editable-photo${value ? " has-photo" : ""}${busy ? " busy" : ""}`}>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handlePick}
        hidden
        aria-label="上传证件照"
      />

      {value ? (
        <>
          <img
            className="editable-photo-img"
            src={value}
            alt="证件照"
            onClick={toggleMenu}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleMenu(e); }
            }}
          />
          {menuOpen && (
            <div className="editable-photo-menu" ref={menuRef} onClick={(e) => e.stopPropagation()}>
              <button type="button" className="ep-menu-btn" onClick={() => { setMenuOpen(false); openPicker(); }}>
                📷 更换照片
              </button>
              <button type="button" className="ep-menu-btn ep-menu-danger" onClick={handleRemove}>
                🗑 移除照片
              </button>
            </div>
          )}
        </>
      ) : (
        <button
          type="button"
          className="editable-photo-empty"
          onClick={openPicker}
          disabled={busy}
          title="添加证件照(可选,PNG/JPG/WEBP,≤2MB)"
        >
          {busy ? (
            <span className="ep-spinner" aria-hidden="true" />
          ) : (
            <>
              <span className="ep-empty-ico" aria-hidden="true">📷</span>
              <span className="ep-empty-text">添加照片</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}