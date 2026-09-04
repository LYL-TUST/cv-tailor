/**
 * 历史记录存储 —— ATS 匹配历史 + 模拟面试历史（localStorage，纯本地）
 *
 * 数据键：
 * - ats_history_v1:       [{ id, ts, jdTitle, jdPreview, score, categoryScores, missingKeywords, matchedKeywords, priorityActions, overallAssessment, verifySummary }]
 * - interview_history_v1: [{ id, ts, jobTitle, interviewType, records: [{ type, category, question, userAnswer, score, feedback, strengths, improvements, starCompliance, improvedAnswer }] }]
 *
 * 设计原则（与隐私承诺一致）：
 * - 只存必要字段，不存完整 resumeData（体积与隐私双考虑）
 * - 单类上限 50 条，超出按 FIFO 淘汰，防止撑爆 localStorage
 */

const ATS_KEY = "ats_history_v1";
const INTERVIEW_KEY = "interview_history_v1";
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

/** 保存一次面试会话（逐题作答 + AI 反馈一起入库） */
export function saveInterviewSession({ jobTitle, interviewType, records }) {
  const list = readList(INTERVIEW_KEY);
  const session = {
    id: uid(),
    ts: Date.now(),
    jobTitle: jobTitle || "未命名岗位",
    interviewType: interviewType || "mixed",
    questionCount: records?.length || 0,
    avgScore: computeAvgScore(records),
    records: (records || []).map((r) => ({
      type: r.type || "",
      category: r.category || "",
      question: r.question || "",
      userAnswer: r.userAnswer || "",
      score: r.score ?? null,
      feedback: r.feedback || "",
      strengths: r.strengths || [],
      improvements: r.improvements || [],
      starCompliance: r.starCompliance,
      improvedAnswer: r.improvedAnswer || "",
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
  return true;
}

/** 清空全部数据（版本 + 历史 + 主题）——个人中心隐私管控 */
export function clearAllLocalData() {
  localStorage.removeItem("resume_versions_v1");
  localStorage.removeItem("resume_active_v1");
  localStorage.removeItem("resumeData");
  localStorage.removeItem("resumeTheme");
  localStorage.removeItem(ATS_KEY);
  localStorage.removeItem(INTERVIEW_KEY);
}

export const ATS_HISTORY_KEY = ATS_KEY;
export const INTERVIEW_HISTORY_KEY = INTERVIEW_KEY;
