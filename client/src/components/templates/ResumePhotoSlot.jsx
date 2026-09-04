import EditablePhoto from "../editor/EditablePhoto";

/**
 * ResumePhotoSlot —— 模板内嵌证件照片位(预留入口,4 个模板共用)
 *
 * 渲染规则:
 *   - 编辑态(onUpdate 提供):无论有无照片都渲染槽位(空 = 虚线占位"添加照片")
 *   - 只读态(未提供 onUpdate,如 Download/预览):仅在 resume.photo 有值时渲染照片
 *
 * 照片位置由各模板 CSS 的 .resume-photo 类控制(见 template-styles.css / styles.css)。
 */
export default function ResumePhotoSlot({ photo, onUpdate, size = "normal" }) {
  const editable = typeof onUpdate === "function";
  if (!editable && !photo) return null; // 只读且无照片:不占位

  return (
    <div className={`resume-photo resume-photo-${size}`}>
      {editable ? (
        <EditablePhoto value={photo || ""} onChange={onUpdate} />
      ) : (
        <div className="resume-photo-static">
          <img src={photo} alt="证件照" />
        </div>
      )}
    </div>
  );
}