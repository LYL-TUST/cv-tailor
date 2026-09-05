/**
 * 收藏夹存储 —— 面试题「再练银行」(localStorage, 纯本地)
 *
 * 数据键:arb_favorites_v1: [{ id, ts, question, type, category, difficulty,
 *                            answerFramework, fromExperience, drillHint,
 *                            referenceTips, sourceJobTitle, note }]
 *
 * 设计原则(与隐私承诺一致):
 * - 只存单题快照,不存完整简历数据;题目原文与参考思路属于练习素材,非 PII
 * - 上限 200 条,FIFO 淘汰,防止撑爆 localStorage
 * - 判重:同一题目原文(trim 后)视为同一道,重复收藏自动去重
 * - 备份导出/导入/清空在 historyStore.js 与 draftStore 联动,本文件只做单键 CRUD
 */
const KEY = "arb_favorites_v1";
const MAX = 200;

function uid() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readList() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeList(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** 难度归一化:未知值一律返回空串(题卡不渲染徽标,避免脏数据) */
function normalizeDifficulty(d) {
  const v = String(d || "").toLowerCase();
  return ["easy", "medium", "hard"].includes(v) ? v : "";
}

/* ==================== CRUD ==================== */

export function listFavorites() {
  return readList();
}

export function countFavorites() {
  return readList().length;
}

export function isFavorite(question) {
  const q = String(question || "").trim();
  if (!q) return false;
  return readList().some((f) => String(f.question || "").trim() === q);
}

/**
 * 新增收藏;同题原文已存在则返回 { added:false, item: 已存在项 }(不重复入夹)
 */
export function addFavorite(input) {
  const question = String(input?.question || "").trim();
  if (!question) return { added: false, item: null };
  const list = readList();
  const dup = list.find((f) => String(f.question || "").trim() === question);
  if (dup) return { added: false, item: dup };

  const item = {
    id: uid(),
    ts: Date.now(),
    question,
    type: input.type || "",
    category: input.category || "",
    difficulty: normalizeDifficulty(input.difficulty),
    answerFramework: input.answerFramework || "",
    fromExperience: input.fromExperience || "",
    drillHint: input.drillHint || "",
    referenceTips: input.referenceTips || null,
    sourceJobTitle: input.sourceJobTitle || "",
    note: input.note || "",
  };
  writeList([item, ...list].slice(0, MAX));
  return { added: true, item };
}

export function removeFavorite(question) {
  const q = String(question || "").trim();
  writeList(readList().filter((f) => String(f.question || "").trim() !== q));
}

export function removeFavoriteById(id) {
  writeList(readList().filter((f) => f.id !== id));
}

export function clearFavorites() {
  localStorage.removeItem(KEY);
}

/** 备份导入用:整表覆盖写(由 historyStore 的合并逻辑调用) */
export function writeFavorites(list) {
  writeList(Array.isArray(list) ? list : []);
}

export const FAVORITES_KEY = KEY;
export const FAVORITES_MAX = MAX;
