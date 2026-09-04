/**
 * 模板主题定制 —— 全局 CSS 变量管理
 *
 * 原理：把 accent（主色调）/ font（字体族）作为 CSS 变量挂到 document.documentElement，
 * 模板样式（template-styles.css）全部引用 var(--rb-*)，改一处全局生效，
 * 编辑器预览、下载预览、导出 PDF 自然同步。
 *
 * 存储：localStorage `resumeTheme`（仅本地，与隐私承诺一致）。
 */

const THEME_KEY = "resumeTheme";

export const ACCENT_COLORS = [
  { id: "amber", name: "暖橙", accent: "#D99748" },
  { id: "blue", name: "商务蓝", accent: "#2563EB" },
  { id: "navy", name: "深海蓝", accent: "#2C3E50" },
  { id: "teal", name: "青碧", accent: "#0D9488" },
  { id: "green", name: "沉稳绿", accent: "#16A34A" },
  { id: "burgundy", name: "勃艮第红", accent: "#9F1239" },
  { id: "purple", name: "雅紫", accent: "#7C3AED" },
  { id: "slate", name: "石墨灰", accent: "#475569" },
];

export const FONT_OPTIONS = [
  { id: "sans", name: "无衬线（现代）", stack: "'Microsoft YaHei', 'PingFang SC', Arial, Helvetica, sans-serif" },
  { id: "serif", name: "衬线（经典）", stack: "Georgia, 'Times New Roman', 'Songti SC', SimSun, serif" },
  { id: "mixed", name: "黑体标题+衬线正文", stack: "'Microsoft YaHei', Arial, sans-serif" },
];

export const DEFAULT_THEME = {
  accent: "#D99748",
  font: FONT_OPTIONS[0].stack,
};

/** 将 hex 与白色按比例混合，生成浅色底（用于 Classy 模板分区标题底色） */
function mixWithWhite(hex, ratio = 0.82) {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const mix = (c) => Math.round(c + (255 - c) * ratio);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** 读取本地主题（异常时回退默认值） */
export function getTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return { ...DEFAULT_THEME };
    const parsed = JSON.parse(raw);
    return {
      accent: parsed.accent || DEFAULT_THEME.accent,
      font: parsed.font || DEFAULT_THEME.font,
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

/** 把当前主题写为全局 CSS 变量 */
export function applyTheme(theme = getTheme()) {
  const root = document.documentElement;
  root.style.setProperty("--rb-accent", theme.accent);
  root.style.setProperty("--rb-accent-soft", mixWithWhite(theme.accent));
  root.style.setProperty("--rb-font", theme.font);
}

/** 保存并立即应用主题 */
export function setTheme(partial) {
  const next = { ...getTheme(), ...partial };
  localStorage.setItem(THEME_KEY, JSON.stringify(next));
  applyTheme(next);
  return next;
}

/** 应用启动时调用一次，保证刷新后主题仍生效 */
export function initTheme() {
  applyTheme(getTheme());
}
