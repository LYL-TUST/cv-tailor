/**
 * 收藏夹存储 —— 面试题「再练银行」(localStorage, 纯本地)
 *
 * 数据键:
 * - arb_favorites_v1: [{ id, ts, question, type, category, difficulty,
 *                       answerFramework, fromExperience, drillHint,
 *                       referenceTips, sourceJobTitle, note, folder }]
 *   folder = 收藏夹名字符串;"" = 默认收藏夹(隐式,不可删除)
 * - arb_fav_folders_v1: [{ id, name, ts }] 用户自建收藏夹(仅存自定义夹)
 *
 * 设计原则(与隐私承诺一致):
 * - 只存单题快照,不存完整简历数据;题目原文与参考思路属于练习素材,非 PII
 * - 上限 200 条/20 个收藏夹,FIFO 淘汰,防止撑爆 localStorage
 * - 判重:同一题目原文(trim 后)视为同一道,重复收藏自动去重
 * - 备份导出/导入/清空在 historyStore.js 与 draftStore 联动,本文件做单键 CRUD
 */
const KEY = "arb_favorites_v1";
const FOLDER_KEY = "arb_fav_folders_v1";
const MAX = 200;
const MAX_FOLDERS = 20;
const FOLDER_NAME_MAX = 16;

/** 默认收藏夹名(隐式存在,不出现在 folders 列表,不可删除/重命名) */
export const DEFAULT_FOLDER = "默认收藏夹";

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

function readFolders() {
  try {
    const raw = localStorage.getItem(FOLDER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeFolders(list) {
  localStorage.setItem(FOLDER_KEY, JSON.stringify(list));
}

/** 收藏夹名规整:trim + 限长 + 去重保护(调用方判空) */
function normalizeFolderName(name) {
  return String(name || "").trim().slice(0, FOLDER_NAME_MAX);
}

/** 某条收藏归属的收藏夹名(旧数据无 folder 字段 → 默认收藏夹) */
export function folderOf(fav) {
  const f = String(fav?.folder || "").trim();
  return f || DEFAULT_FOLDER;
}

/** 难度归一化:未知值一律返回空串(题卡不渲染徽标,避免脏数据) */
function normalizeDifficulty(d) {
  const v = String(d || "").toLowerCase();
  return ["easy", "medium", "hard"].includes(v) ? v : "";
}

/* ==================== 收藏夹 CRUD ==================== */

export function listFolders() {
  return readFolders();
}

/** 全部收藏夹名(默认夹恒在,排最前) */
export function listFolderNames() {
  return [DEFAULT_FOLDER, ...readFolders().map((f) => f.name)];
}

/** 各收藏夹的题目数量 { [folderName]: count } */
export function countByFolder() {
  const map = { [DEFAULT_FOLDER]: 0 };
  readFolders().forEach((f) => { map[f.name] = 0; });
  readList().forEach((f) => {
    const name = folderOf(f);
    map[name] = (map[name] || 0) + 1;
  });
  return map;
}

/**
 * 新建收藏夹;重名返回 { added:false, error:"重名" }
 */
export function addFolder(name) {
  const clean = normalizeFolderName(name);
  if (!clean) return { added: false, error: "empty" };
  const folders = readFolders();
  if (clean === DEFAULT_FOLDER || folders.some((f) => f.name === clean)) {
    return { added: false, error: "dup" };
  }
  if (folders.length >= MAX_FOLDERS) {
    return { added: false, error: "max" };
  }
  const folder = { id: uid(), name: clean, ts: Date.now() };
  writeFolders([...folders, folder]);
  return { added: true, folder };
}

/** 重命名自定义收藏夹;同步更新收藏条目上的 folder 字段 */
export function renameFolder(id, newName) {
  const clean = normalizeFolderName(newName);
  if (!clean) return { ok: false, error: "empty" };
  const folders = readFolders();
  const target = folders.find((f) => f.id === id);
  if (!target) return { ok: false, error: "notfound" };
  if (clean === DEFAULT_FOLDER || folders.some((f) => f.id !== id && f.name === clean)) {
    return { ok: false, error: "dup" };
  }
  const old = target.name;
  target.name = clean;
  writeFolders(folders);
  writeList(readList().map((f) => (folderOf(f) === old ? { ...f, folder: clean } : f)));
  return { ok: true, folder: target };
}

/** 删除自定义收藏夹;其中的题目移回默认收藏夹(数据安全:不连带删题) */
export function deleteFolder(id) {
  const folders = readFolders();
  const target = folders.find((f) => f.id === id);
  if (!target) return { ok: false };
  writeFolders(folders.filter((f) => f.id !== id));
  writeList(readList().map((f) => (folderOf(f) === target.name ? { ...f, folder: "" } : f)));
  return { ok: true, moved: true };
}

/** 把单条收藏移动到指定收藏夹(名字;"" = 默认) */
export function moveFavoriteToFolder(id, folderName) {
  const clean = normalizeFolderName(folderName);
  writeList(readList().map((f) => (f.id === id ? { ...f, folder: clean } : f)));
}

/* ==================== 题目 CRUD ==================== */

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
 * input.folder: 目标收藏夹名("" / 缺省 = 默认收藏夹)
 */
export function addFavorite(input) {
  const question = String(input?.question || "").trim();
  if (!question) return { added: false, item: null };
  const list = readList();
  const dup = list.find((f) => String(f.question || "").trim() === question);
  if (dup) return { added: false, item: dup };

  const folder = folderOf({ folder: input?.folder });
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
    folder: folder === DEFAULT_FOLDER ? "" : folder,
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

/** 清空全部收藏题目(保留收藏夹结构) */
export function clearFavorites() {
  localStorage.removeItem(KEY);
}

/** 清空收藏题目 + 自定义收藏夹表(个人中心「清空全部数据」用) */
export function clearAllFavoritesAndFolders() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(FOLDER_KEY);
}

/** 备份导入用:整表覆盖写(由 historyStore 的合并逻辑调用) */
export function writeFavorites(list) {
  writeList(Array.isArray(list) ? list : []);
}

/** 备份导入用:收藏夹表覆盖写(由 historyStore 调用) */
export function writeFoldersRaw(list) {
  writeFolders(Array.isArray(list) ? list.slice(0, MAX_FOLDERS) : []);
}

export const FAVORITES_KEY = KEY;
export const FOLDERS_KEY = FOLDER_KEY;
export const FAVORITES_MAX = MAX;
