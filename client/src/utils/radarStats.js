/**
 * radarStats.js —— 能力雷达画像(category × difficulty × score 本地聚合)
 *
 * 数据源:interview_history_v1 的逐题 records(category / difficulty / score / timeUp / followUp)。
 * 纯前端算术,local-first:不进 LLM、不上传(与整场复盘的本地统计同一设计原则)。
 *
 * 弱题口径(与 Interview.jsx 的 WEAK_SCORE 一致):
 *   score < 6 / 超时(timeUp)/ 被追问但未回应 —— 三者都是「经不起追问」的信号。
 */

import { listInterviewSessions } from "./historyStore";

export const RADAR_WEAK_SCORE = 6;   // 均分低于此值判定为弱项维度
export const RADAR_MAX_AXES = 8;     // 雷达图最多维度数(太多可读性差)
export const RADAR_WEAK_LIMIT = 3;   // 一键针对性再练最多携带的弱项维度数

const DIFF_KEYS = ["easy", "medium", "hard"];

/** 单题是否为弱题(低分 / 超时 / 未回应追问) */
function isWeakRecord(r) {
  if (typeof r.score !== "number") return false;
  if (r.score < RADAR_WEAK_SCORE) return true;
  if (r.timeUp) return true;
  if (r.followUp && r.followUp.question && !(r.followUp.answer || "").trim()) return true;
  return false;
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * 构建能力画像。
 * @param {Array} sessions listInterviewSessions() 的结果(新→旧)
 * @returns profile:
 *   {
 *     sessions, questions, avg,                       // 总览
 *     dims: [{ category, attempts, avg, weakCount, weakRate, lastTs, diff }],
 *     difficulty: { easy: {n, avg}, medium, hard },   // 全量按难度聚合
 *     weakCategories: [cat...],                       // 弱项维度(均分<6,升序,最多3)
 *     radarDims: dims.slice(0, RADAR_MAX_AXES),       // 雷达图轴(按练习次数取前 N)
 *   }
 */
export function buildRadarProfile(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];

  const dimMap = new Map();     // category -> 聚合
  const diffMap = new Map();    // difficulty -> { n, sum }
  let scored = 0;
  let sum = 0;

  list.forEach((s) => {
    (s.records || []).forEach((r) => {
      const cat = (r.category || "").trim() || "未分类";
      if (!dimMap.has(cat)) {
        dimMap.set(cat, { category: cat, attempts: 0, sum: 0, weakCount: 0, lastTs: 0, diff: {} });
      }
      const d = dimMap.get(cat);

      if (typeof r.score === "number") {
        d.attempts += 1;
        d.sum += r.score;
        scored += 1;
        sum += r.score;
        d.lastTs = Math.max(d.lastTs, s.ts || 0);

        const diff = String(r.difficulty || "").toLowerCase();
        if (DIFF_KEYS.includes(diff)) {
          if (!d.diff[diff]) d.diff[diff] = { n: 0, sum: 0 };
          d.diff[diff].n += 1;
          d.diff[diff].sum += r.score;
          if (!diffMap.has(diff)) diffMap.set(diff, { n: 0, sum: 0 });
          const g = diffMap.get(diff);
          g.n += 1;
          g.sum += r.score;
        }
      }
      if (isWeakRecord(r)) d.weakCount += 1;
    });
  });

  const dims = [...dimMap.values()]
    .filter((d) => d.attempts > 0)
    .map((d) => ({
      category: d.category,
      attempts: d.attempts,
      avg: round1(d.sum / d.attempts),
      weakCount: d.weakCount,
      weakRate: d.attempts > 0 ? Math.round((d.weakCount / d.attempts) * 100) : 0,
      lastTs: d.lastTs,
      diff: Object.fromEntries(
        Object.entries(d.diff).map(([k, v]) => [k, { n: v.n, avg: round1(v.sum / v.n) }])
      ),
    }));

  // 展示序:弱的在前(均分升序),同分按练习次数多的在前
  const dimsByWeak = [...dims].sort((a, b) => a.avg - b.avg || b.attempts - a.attempts);
  // 雷达轴:按练习次数取前 N(次数多 = 数据更可信)
  const dimsByAttempts = [...dims].sort((a, b) => b.attempts - a.attempts);

  const weakCategories = dimsByWeak
    .filter((d) => d.avg < RADAR_WEAK_SCORE)
    .slice(0, RADAR_WEAK_LIMIT)
    .map((d) => d.category);

  const difficulty = Object.fromEntries(
    DIFF_KEYS.map((k) => {
      const g = diffMap.get(k);
      return [k, g ? { n: g.n, avg: round1(g.sum / g.n) } : null];
    })
  );

  return {
    sessions: list.length,
    questions: scored,
    avg: scored > 0 ? round1(sum / scored) : null,
    dims: dimsByWeak,
    radarDims: dimsByAttempts.slice(0, RADAR_MAX_AXES),
    difficulty,
    weakCategories,
  };
}

/** 最近一次练习的目标职位(针对性再练时预填) */
export function lastSessionJobTitle(sessions) {
  const s = (Array.isArray(sessions) ? sessions : []).find((x) => x.jobTitle);
  return s ? s.jobTitle : "";
}
