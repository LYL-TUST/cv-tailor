/**
 * 简历设置 —— 模块管理 + 排版配置(文档级,存于版本 data.settings)
 *
 * CONTENT_MODULES:可隐藏/排序的内容模块
 * typography:     行距 / 字号 / 对齐 / 页边距(画布 CSS + DOCX 输出共用)
 * moduleVisible:  key → bool
 * moduleOrder:    全部模块的全局顺序。
 *                 单栏模板(classy/simple)正文按此顺序流动;
 *                 双栏模板(professional/stylish)按 TEMPLATE_ZONES 把各模块归入对应栏,
 *                 每栏内部按 moduleOrder 的相对顺序渲染(列内拖拽排序)。
 *                 全局顺序恒等于「各栏顺序按视觉栏序拼接」,模板间保持一致。
 *
 * 页边距数值:画布用 px(24/38/54),DOCX 用 twips 与之厘米等价
 * (24px≈0.6cm→360twips / 38px≈1.0cm→570 / 54px≈1.4cm→810)。
 */
export const CONTENT_MODULES = [
  { id: "summary",    label: "个人简介", icon: "📝" },
  { id: "experience", label: "工作经历", icon: "💼" },
  { id: "education",  label: "教育背景", icon: "🎓" },
  { id: "skills",     label: "专业技能", icon: "🧠" },
];

export const LINE_HEIGHTS = [
  { id: "compact",   label: "紧凑",   num: "1.25", value: 1.25 },
  { id: "normal",    label: "标准",   num: "1.4",  value: 1.4 },
  { id: "loose",     label: "宽松",   num: "1.6",  value: 1.6 },
  { id: "veryLoose", label: "很宽松", num: "1.8",  value: 1.8 },
];

export const FONT_SIZES = [
  { id: "small",  label: "小", num: "11", value: 11 },
  { id: "normal", label: "中", num: "13", value: 13 },
  { id: "large",  label: "大", num: "15", value: 15 },
];

export const ALIGNS = [
  { id: "left",    label: "左对齐",   value: "left" },
  { id: "justify", label: "两端对齐", value: "justify" },
];

export const MARGINS = [
  { id: "narrow", label: "窄",    num: "0.6cm", value: 24, twips: 360 },
  { id: "normal", label: "标准",  num: "1.0cm", value: 38, twips: 570 },
  { id: "wide",   label: "宽",    num: "1.4cm", value: 54, twips: 810 },
];

/** 画布字体尺寸映射(备用,画布当前直接用 fontSize px) */
export const CANVAS_FONT_MAP = {
  11: 11.5,
  13: 13.5,
  15: 15.5,
};

export const defaultSettings = () => ({
  typography: {
    lineHeight: 1.4,
    fontSize: 13,
    align: "left",
    margin: 38,
  },
  moduleVisible: {
    summary: true,
    experience: true,
    education: true,
    skills: true,
  },
  moduleOrder: ["summary", "experience", "education", "skills"],
});

/** 从任意 data 读取 settings(带默认值合并),兼容旧数据 */
export function readSettings(data) {
  const base = defaultSettings();
  const s = data?.settings || {};
  return {
    typography: { ...base.typography, ...(s.typography || {}) },
    moduleVisible: { ...base.moduleVisible, ...(s.moduleVisible || {}) },
    moduleOrder: (s.moduleOrder && s.moduleOrder.length === CONTENT_MODULES.length)
      ? s.moduleOrder
      : base.moduleOrder,
  };
}

/* ============ 模板分区(栏)模型 ============ */

/**
 * 每个模板把内容模块分配到视觉「栏」:
 *   - classy / simple   单栏,全部模块在「正文」中流动
 *   - professional      侧栏(summary)+ 主栏(experience/education/skills)
 *   - stylish           左栏(education/skills)+ 右栏(summary/experience)
 * modules 是模板允许出现在该栏的模块集合(栏内顺序由 moduleOrder 相对顺序决定)。
 */
export const TEMPLATE_ZONES = {
  classy: [
    { id: "flow", label: "正文内容", modules: CONTENT_MODULES.map((m) => m.id) },
  ],
  simple: [
    { id: "flow", label: "正文内容", modules: CONTENT_MODULES.map((m) => m.id) },
  ],
  professional: [
    { id: "sidebar", label: "侧栏", modules: ["summary"] },
    { id: "main", label: "主栏", modules: ["experience", "education", "skills"] },
  ],
  stylish: [
    { id: "left", label: "左栏", modules: ["education", "skills"] },
    { id: "right", label: "右栏", modules: ["summary", "experience"] },
  ],
};

/** 模板所属栏定义(未知模板按单栏处理) */
export function zonesFor(templateId) {
  return TEMPLATE_ZONES[templateId] || TEMPLATE_ZONES.classy;
}

/** 某个栏内、按全局 moduleOrder 相对顺序排列的模块 id 序列 */
export function zoneSeq(order, zone) {
  return zone.modules.filter((id) => order.includes(id));
}

/**
 * 在某个栏内把模块从 fromIdx 移到 toIdx(索引相对该栏内当前顺序)。
 * 全局顺序恒等于「各栏顺序按视觉栏序拼接」,因此移动后重建全局 order。
 */
export function moveWithinZone(zones, order, zoneId, fromIdx, toIdx) {
  const zone = zones.find((z) => z.id === zoneId);
  if (!zone) return order;
  const cur = zoneSeq(order, zone);
  if (fromIdx < 0 || fromIdx >= cur.length || toIdx < 0 || toIdx >= cur.length) return order;
  const next = [...cur];
  const [item] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, item);

  const out = [];
  for (const z of zones) {
    const use = z.id === zoneId ? next : zoneSeq(order, z);
    out.push(...use);
  }
  // 兜底:任何遗漏的 id 保持原相对位置附加
  for (const id of order) if (!out.includes(id)) out.push(id);
  return out;
}
