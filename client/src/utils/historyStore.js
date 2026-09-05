/**
 * 历史记录存储 —— ATS 匹配历史 + 模拟面试历史（localStorage，纯本地）
 *
 * 数据键：
 * - ats_history_v1:       [{ id, ts, jdTitle, jdPreview, score, categoryScores, missingKeywords, matchedKeywords, priorityActions, overallAssessment, verifySummary }]
 * - interview_history_v1: [{ id, ts, jobTitle, interviewType, records: [{ type, category, question, userAnswer, score, feedback, strengths, improvements, starCompliance, improvedAnswer, followUp, timeUp }] }]
 *
 * 设计原则（与隐私承诺一致）：
 * - 只存必要字段，不存完整 resumeData（体积与隐私双考虑）
 * - 单类上限 50 条，超出按 FIFO 淘汰，防止撑爆 localStorage
 *
 * 工作区草稿（JD 诊断/模拟面试的页面现场）由 draftStore.js 管理，
 * 备份导出/导入/清空在本文件与 draftStore 联动。
 */
import {
  getDraftEnvelope, mergeDraftEnvelope, clearAllDrafts,
} from "./draftStore";
import {
  listFavorites, writeFavorites, clearFavorites, FAVORITES_KEY,
} from "./favoritesStore";

const ATS_KEY = "ats_history_v1";
const INTERVIEW_KEY = "interview_history_v1";
const FAVORITES_LIMIT = 200;
const MAX_PER_TYPE = 50;

function uid() {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readList(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

/* ==================== ATS 历史 ==================== */

/** 保存一次 ATS 分析结果（自动去重：同一小时内同 JD 同分不重复存） */
export function addAtsRecord(input) {
  const list = readList(ATS_KEY);
  const score = Number(input.score) || 0;
  const hour = 60 * 60 * 1000;
  const recentDup = list.find(
    (r) => r.score === score && Date.now() - r.ts < hour && r.jdPreview === input.jdPreview
  );
  if (recentDup) return recentDup;

  const record = {
    id: uid(),
    ts: Date.now(),
    jdTitle: input.jdTitle || "",
    jdPreview: input.jdPreview || "",
    resumeId: input.resumeId || "",
    resumeName: input.resumeName || "",
    score,
    categoryScores: input.categoryScores || null,
    missingKeywords: input.missingKeywords || [],
    matchedKeywords: input.matchedKeywords || [],
    priorityActions: input.priorityActions || [],
    overallAssessment: input.overallAssessment || "",
    verifySummary: input.verifySummary || "",
  };
  writeList(ATS_KEY, [record, ...list].slice(0, MAX_PER_TYPE));
  return record;
}

export function listAtsRecords() {
  return readList(ATS_KEY);
}

export function deleteAtsRecord(id) {
  writeList(ATS_KEY, readList(ATS_KEY).filter((r) => r.id !== id));
}

export function clearAtsRecords() {
  localStorage.removeItem(ATS_KEY);
}

/* ==================== 面试历史 ==================== */

/** 保存一次面试会话（逐题作答 + AI 反馈一起入库）
 *  context: { mode, jdTitle, jdPreview, resumeId, resumeName } 面试官资料包快照
 */
export function saveInterviewSession({ jobTitle, interviewType, records, context, report }) {
  const list = readList(INTERVIEW_KEY);
  const ctx = context || {};
  const session = {
    id: uid(),
    ts: Date.now(),
    jobTitle: jobTitle || "未命名岗位",
    interviewType: interviewType || "mixed",
    mode: ctx.mode || "title",
    // 面试官风格档位(P4):standard|friendly|pressure(旧记录无此字段)
    style: ctx.style || "standard",
    jdTitle: ctx.jdTitle || "",
    jdPreview: ctx.jdPreview || "",
    resumeId: ctx.resumeId || "",
    resumeName: ctx.resumeName || "",
    questionCount: records?.length || 0,
    avgScore: computeAvgScore(records),
    // 整场复盘快照(stats=本地统计含追问命中率/角度分布,llm=AI 归纳;未生成时为 null,旧记录兼容)
    report: report && report.stats ? { stats: report.stats, llm: report.llm || null } : null,
    records: (records || []).map((r) => ({
      type: r.type || "",
      category: r.category || "",
      difficulty: r.difficulty || "",
      question: r.question || "",
      userAnswer: r.userAnswer || "",
      score: r.score ?? null,
      feedback: r.feedback || "",
      strengths: r.strengths || [],
      improvements: r.improvements || [],
      starCompliance: r.starCompliance,
      authenticityNote: r.authenticityNote || "",
      improvedAnswer: r.improvedAnswer || "",
      // P4 回答-简历矛盾点对照(按需触发后并入):{ verdict, summary, items[] }
      consistency: r.consistency && r.consistency.summary !== undefined
        ? {
            verdict: r.consistency.verdict || "minor",
            summary: r.consistency.summary || "",
            items: (Array.isArray(r.consistency.items) ? r.consistency.items : []).map((it) => ({
              kind: it.kind || "unclear",
              point: it.point || "",
              detail: it.detail || "",
              advice: it.advice || "",
            })),
          }
        : null,
      // P2 真人面试循环:面试官追问 + 补答 + 是否超时(旧记录无此字段,渲染端判空兼容)
      followUp: r.followUp && r.followUp.question
        ? { question: r.followUp.question || "", angle: r.followUp.angle || "", answer: r.followUp.answer || "" }
        : null,
      timeUp: Boolean(r.timeUp),
    })),
  };
  writeList(INTERVIEW_KEY, [session, ...list].slice(0, MAX_PER_TYPE));
  return session;
}

function computeAvgScore(records) {
  const scored = (records || []).filter((r) => typeof r.score === "number");
  if (scored.length === 0) return null;
  return Math.round((scored.reduce((s, r) => s + r.score, 0) / scored.length) * 10) / 10;
}

export function listInterviewSessions() {
  return readList(INTERVIEW_KEY);
}

export function deleteInterviewSession(id) {
  writeList(INTERVIEW_KEY, readList(INTERVIEW_KEY).filter((s) => s.id !== id));
}

export function clearInterviewSessions() {
  localStorage.removeItem(INTERVIEW_KEY);
}

/* ==================== 通用 ==================== */

/** 导出全部本地数据（用于备份/同步），包含版本简历与历史 */
export function exportAllData() {
  return {
    app: "ai-resume-builder",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      resume_versions_v1: JSON.parse(localStorage.getItem("resume_versions_v1") || "[]"),
      resume_active_v1: localStorage.getItem("resume_active_v1") || null,
      resumeTheme: JSON.parse(localStorage.getItem("resumeTheme") || "null"),
      ats_history_v1: readList(ATS_KEY),
      interview_history_v1: readList(INTERVIEW_KEY),
      favorites_v1: listFavorites(),
      draft_ats_v1: getDraftEnvelope("ats"),
      draft_interview_v1: getDraftEnvelope("interview"),
    },
  };
}

/** 导入备份数据（合并模式：现有数据保留，按版本 id 去重） */
export function importAllData(payload) {
  const d = payload?.data;
  if (!d) throw new Error("备份文件格式不正确");

  // 版本简历合并去重
  if (Array.isArray(d.resume_versions_v1) && d.resume_versions_v1.length > 0) {
    const existing = JSON.parse(localStorage.getItem("resume_versions_v1") || "[]");
    const byId = new Map(existing.map((v) => [v.id, v]));
    d.resume_versions_v1.forEach((v) => byId.set(v.id, v));
    const merged = Array.from(byId.values());
    localStorage.setItem("resume_versions_v1", JSON.stringify(merged));
    if (d.resume_active_v1 && byId.has(d.resume_active_v1)) {
      localStorage.setItem("resume_active_v1", d.resume_active_v1);
    }
    // 写穿 resumeData（旧页面读取）
    const active = merged.find((v) => v.id === localStorage.getItem("resume_active_v1")) || merged[0];
    if (active && active.data && !active.data.empty) {
      localStorage.setItem("resumeData", JSON.stringify(active.data));
    }
  }
  if (d.resumeTheme) localStorage.setItem("resumeTheme", JSON.stringify(d.resumeTheme));

  // 历史合并去重
  const mergeBy = (key, incoming) => {
    if (!Array.isArray(incoming)) return;
    const existing = readList(key);
    const byId = new Map(existing.map((r) => [r.id, r]));
    incoming.forEach((r) => byId.set(r.id, r));
    writeList(key, Array.from(byId.values()).slice(0, MAX_PER_TYPE));
  };
  mergeBy(ATS_KEY, d.ats_history_v1);
  mergeBy(INTERVIEW_KEY, d.interview_history_v1);

  // 收藏夹:按 id 合并去重,保留最近 200 条
  if (Array.isArray(d.favorites_v1) && d.favorites_v1.length > 0) {
    const existing = listFavorites();
    const byId = new Map(existing.map((f) => [f.id, f]));
    d.favorites_v1.forEach((f) => byId.set(f.id, f));
    writeFavorites(Array.from(byId.values()).slice(0, FAVORITES_LIMIT));
  }

  // 工作区草稿：按时间"较新覆盖"合并（见 draftStore）
  mergeDraftEnvelope("ats", d.draft_ats_v1);
  mergeDraftEnvelope("interview", d.draft_interview_v1);
  return true;
}

/** 清空全部数据（版本 + 历史 + 主题 + 工作区草稿）——个人中心隐私管控 */
export function clearAllLocalData() {
  localStorage.removeItem("resume_versions_v1");
  localStorage.removeItem("resume_active_v1");
  localStorage.removeItem("resumeData");
  localStorage.removeItem("resumeTheme");
  localStorage.removeItem(ATS_KEY);
  localStorage.removeItem(INTERVIEW_KEY);
  clearFavorites();
  clearAllDrafts();
}

export const ATS_HISTORY_KEY = ATS_KEY;
export const INTERVIEW_HISTORY_KEY = INTERVIEW_KEY;
