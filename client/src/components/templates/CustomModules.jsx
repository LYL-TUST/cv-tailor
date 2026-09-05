import EditableField from '../editor/EditableField';

/**
 * 自定义模块(文本块型)单块渲染 —— 由模板按栏内顺序任意位置渲染。
 * 键约定:settings.moduleOrder / moduleVisible 使用 `custom:<id>`。
 * title 为模块标题,body 为多行正文;编辑态直接在画布上改。
 */
export function CustomSectionBlock({ section, onUpdateCustom }) {
  const renderEd = (field, value, placeholder, multiline) => onUpdateCustom
    ? (
      <EditableField
        value={value || ''}
        onChange={(v) => onUpdateCustom(section.id, field, v)}
        placeholder={placeholder}
        multiline={multiline}
      />
    )
    : (value || placeholder);

  return (
    <section className="resume-custom-module">
      <h4>{renderEd('title', section.title, '模块标题', false)}</h4>
      <p className="editable-block">{renderEd('body', section.body, '在此输入模块内容…', true)}</p>
    </section>
  );
}

/** 模板内把自定义 section 注入渲染映射(供 blocks[id] 按序取用) */
export function injectCustomBlocks(blocks, sections, onUpdateCustom) {
  const b = blocks;
  (sections || []).forEach((s) => {
    b[`custom:${s.id}`] = (s.title || s.body || onUpdateCustom)
      ? <CustomSectionBlock key={`custom:${s.id}`} section={s} onUpdateCustom={onUpdateCustom} />
      : null;
  });
  return b;
}
