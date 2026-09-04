/**
 * 可编辑文字节点 —— 在受控 React 组件内集成 contentEditable
 *
 * 用法:
 *   <EditableField value={resume.name} onChange={v => setName(v)} placeholder="姓名" />
 *   <EditableField value={resume.summary} onChange={...} multiline placeholder="..." />
 *
 * 关键设计:
 * 1. value 用 useEffect 在外部值与当前 textContent 不一致时同步(避免每次按键 React 重建打断光标)
 * 2. 用户实际编辑在 onBlur 时触发(单行/多行一致),保证结构稳定
 * 3. multiline 时回车插入 <br>、Shift+回车不打断;退格在前端时清掉 <br> 占位
 * 4. suppressContentEditableWarning 抑制 React 关于 contentEditable 的无害警告
 */
import { useEffect, useRef } from "react";

export default function EditableField({
  value,
  onChange,
  placeholder = "",
  multiline = false,
  className = "",
  style,
  as: As = "span",
  ariaLabel,
  ai = null, // { k: 'field'|'exp'|'bullet', f?, i?, bi? } —— 用于字段级 AI 悬浮工具条
}) {
  const ref = useRef(null);
  const lastCommittedRef = useRef(value ?? "");

  // 外部值变化时同步到 DOM(只在确实不一致时,避免打断用户正在打字)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = value ?? "";
    if (el.textContent !== next) {
      el.textContent = next;
      lastCommittedRef.current = next;
    }
  }, [value]);

  const commit = () => {
    const el = ref.current;
    if (!el) return;
    const next = el.textContent ?? "";
    if (next === lastCommittedRef.current) return;
    lastCommittedRef.current = next;
    onChange?.(next);
  };

  const handleKeyDown = (e) => {
    if (!multiline) {
      if (e.key === "Enter") {
        e.preventDefault();
        e.currentTarget.blur();
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // 插入 <br> + 零宽字符占位,保持光标不丢失
      document.execCommand?.("insertLineBreak");
      e.currentTarget.blur();
    }
  };

  const handlePaste = (e) => {
    // 强制纯文本粘贴,避免 HTML 结构污染
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand?.("insertText", false, text);
  };

  return (
    <As
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={multiline ? "true" : "false"}
      aria-label={ariaLabel || placeholder || "可编辑文本"}
      data-empty={(value ?? "") === "" ? "true" : "false"}
      data-placeholder={placeholder}
      data-ai={ai ? JSON.stringify(ai) : undefined}
      className={`editable-field ${className}`}
      style={style}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    />
  );
}