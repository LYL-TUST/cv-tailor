/**
 * 页面工作区草稿存储 —— 「本地优先」承诺的最后一环
 *
 * 背景：JD 诊断 / 模拟面试这类 AI 工作区页面，输入与 AI 结果过去只存在 React
 * 内存里，切换路由组件卸载即全部丢失。此模块提供统一的
 * 「防抖自动保存 + 挂载静默恢复」，全部落在 localStorage：
 * - 不依赖登录、不依赖后端（后端只是可选的加密云同步）
 * - 用户离开页面再回来，看到的是离开时的现场
 *
 * 数据键（每类工作区一个）：
 * - ats:       arb_draft_ats_v1        { v, ts, payload: { resumeId, resumeName, jobDesc, analysis, semantic, verification } }
 * - interview: arb_draft_interview_v1  { v, ts, payload: { ...整场练习现场 } }
 *
 * 体积防线：单个草稿超过安全上限时放弃写入（打印警告），避免撑爆 localStorage。
 * 备份体系：exportAllData / importAllData / clearAllLocalData 已同步接入（见 historyStore.js）。
 */

export const DRAFT_KINDS = {
  ats: "ats",
  interview: "interview",
};

const DRAFT_KEYS = {
  [DRAFT_KINDS.ats]: "arb_draft_ats_v1",
  [DRAFT_KINDS.interview]: "arb_draft_interview_v1",
};

const SCHEMA_V = 1;
const MAX_BYTES = 3.5 * 1024 * 1024; // localStorage 常见上限 5MB，留出版本库等余量

export function draftKeyOf(kind) {
  return DRAFT_KEYS[kind] || null;
}

/** 读取某类草稿的 payload；不存在/损坏返回 null */
export function loadDraft(kind) {
  const key = DRAFT_KEYS[kind];
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed.payload ?? null;
  } catch {
    return null;
  }
}

/** 是否存在草稿 */
export function hasDraft(kind) {
  const key = DRAFT_KEYS[kind];
  try {
    return !!key && localStorage.getItem(key) != null;
  } catch {
    return false;
  }
}

/** 保存某类草稿（payload 为 null/undefined 时等价于清除） */
export function saveDraft(kind, payload) {
  const key = DRAFT_KEYS[kind];
  if (!key) return false;
  if (payload == null) {
    clearDraft(kind);
    return true;
  }
  try {
    const json = JSON.stringify({ v: SCHEMA_V, ts: Date.now(), payload });
    if (json.length > MAX_BYTES) {
      console.warn(`[draftStore] 草稿(${kind})过大 ${(json.length / 1024).toFixed(0)}KB，放弃自动保存（不影响其它数据）`);
      return false;
    }
    localStorage.setItem(key, json);
    return true;
  } catch (err) {
    console.warn(`[draftStore] 保存草稿(${kind})失败:`, err);
    return false;
  }
}

/** 清除某类草稿 */
export function clearDraft(kind) {
  const key = DRAFT_KEYS[kind];
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}

/** 清空全部工作区草稿（个人中心「清空全部数据」联动） */
export function clearAllDrafts() {
  Object.values(DRAFT_KEYS).forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch { /* ignore */ }
  });
}

/**
 * 取某类草稿的「壳」（含 ts），供备份导入做"较新覆盖"合并
 */
export function getDraftEnvelope(kind) {
  const key = DRAFT_KEYS[kind];
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** 导入备份时合并一条草稿：仅当本地没有或备份更新时采用 */
export function mergeDraftEnvelope(kind, envelope) {
  const key = DRAFT_KEYS[kind];
  if (!key || !envelope || typeof envelope !== "object" || envelope.payload == null) return;
  try {
    const local = getDraftEnvelope(kind);
    if (local && (Number(local.ts) || 0) >= (Number(envelope.ts) || 0)) return; // 本地更新，保留本地
    localStorage.setItem(key, JSON.stringify({ v: SCHEMA_V, ts: envelope.ts || Date.now(), payload: envelope.payload }));
  } catch { /* ignore */ }
}
