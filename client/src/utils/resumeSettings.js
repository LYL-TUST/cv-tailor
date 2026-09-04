/**
 * 简历设置 —— 模块管理 + 排版配置(文档级,存于版本 data.settings)
 *
 * CONTENT_MODULES:可隐藏/排序的内容模块
 * typography:     行距 / 字号 / 对齐 / 页边距(画布 CSS 变量 + DOCX 输出共用)
 * moduleVisible:  key → bool
 * moduleOrder:    单栏模板(classy/simple)主内容流渲染顺序;
 *                 双栏模板(professional/stylish)版式固定,忽略 order 仅响应 visible。
 */

export const CONTENT_MODULES = [
  { id: "summary",    label: "个人简介", icon: "📝" },
  { id: "experience", label: "工作经历", icon: "💼" },
  { id: "education",  label: "教育背景", icon: "🎓" },
  { id: "skills",     label: "专业技能", icon: "🧠" },
];

export const LINE_HEIGHTS = [
  { id: "compact", label: "紧凑", value: 1.25 },
  { id: "normal",  label: "标准", value: 1.4 },
  { id: "loose",   label: "宽松", value: 1.6 },
  { id: "veryLoose", label: "很宽松", value: 1.8 },
];

export const FONT_SIZES = [
  { id: "small",  label: "小",  value: 11 },
  { id: "normal", label: "中",  value: 13 },
  { id: "large",  label: "大",  value: 15 },
];

export const ALIGNS = [
  { id: "left",    label: "左对齐",   value: "left" },
  { id: "justify", label: "两端对齐", value: "justify" },
];

export const MARGINS = [
  { id: "narrow", label: "小边距", value: 24 },
  { id: "normal", label: "标准",   value: 38 },
  { id: "wide",   label: "大边距", value: 54 },
];

/** 画布字体尺寸映射(模板以固定字号为主,此值作用于容器基准字号) */
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

/** 是否单栏可排序模板 */
export const ORDER_SUPPORTED_TEMPLATES = new Set(["classy", "simple"]);