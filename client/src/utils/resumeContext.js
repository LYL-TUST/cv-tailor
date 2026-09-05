/**
 * resumeContext —— 把一份 ATS 格式简历压缩成「面试官视角的简历摘要」文本
 *
 * 用途：
 * - 模拟面试出题/评估：作为 resumeBrief 传给后端（面试官已读简历）
 * - 与 JD 一样属于“上下文输入”，需做长度护栏（防超长输入 F5）
 *
 * 纯本地、无副作用、可独立测试。
 */

const MAX_BRIEF = 5000; // 与后端 MAX_BRIEF=6000 保持一个余量
const MAX_BULLETS_PER_EXP = 4; // 每段经历最多带几条要点，控制体积

/** 是否空版本（新建未填写的占位版本 data 为 { empty: true } 或全空） */
export function isEmptyResumeData(data) {
  if (!data) return true;
  if (data.empty === true) return true;
  const pi = data.personalInfo || {};
  const hasCore =
    (pi.name || "").trim() ||
    (data.summary || "").trim() ||
    (Array.isArray(data.skills) && data.skills.length > 0) ||
    (Array.isArray(data.experience) && data.experience.length > 0) ||
    (Array.isArray(data.education) && data.education.length > 0);
  return !hasCore;
}

function pick(arr) {
  return Array.isArray(arr) ? arr : [];
}

/**
 * 把 ATS 格式简历压缩为纯文本摘要（按长度截断兜底）
 * @param {object} data ATS 格式简历（personalInfo/summary/skills/experience/education）
 * @returns {string}
 */
export function buildResumeBrief(data) {
  if (!data || isEmptyResumeData(data)) return "";

  const lines = [];
  const pi = data.personalInfo || {};

  const name = (pi.name || "").trim();
  const title = (pi.title || "").trim();
  if (name) lines.push(`姓名：${name}`);
  if (title) lines.push(`求职目标：${title}`);

  const summary = (data.summary || "").trim();
  if (summary) lines.push(`个人简介：${summary}`);

  const skills = pick(data.skills).map((s) => String(s).trim()).filter(Boolean);
  if (skills.length > 0) lines.push(`技能：${skills.join("、")}`);

  const exps = pick(data.experience);
  if (exps.length > 0) {
    lines.push("");
    lines.push("工作/项目经历：");
    exps.forEach((exp) => {
      const company = (exp.company || "").trim();
      const position = (exp.position || "").trim();
      const duration = (exp.duration || "").trim();
      const head = [position, company ? `@ ${company}` : "", duration ? `(${duration})` : ""]
        .filter(Boolean)
        .join(" ");
      lines.push(`- ${head || "（未填职位）"}`);
      const bullets = pick(exp.bullets)
        .map((b) => String(b).trim())
        .filter(Boolean)
        .slice(0, MAX_BULLETS_PER_EXP);
      bullets.forEach((b) => lines.push(`  · ${b}`));
      if (pick(exp.bullets).filter((b) => String(b).trim()).length > MAX_BULLETS_PER_EXP) {
        lines.push(`  · …（共 ${pick(exp.bullets).filter((b) => String(b).trim()).length} 条要点，摘要仅截取前 ${MAX_BULLETS_PER_EXP} 条）`);
      }
    });
  }

  const edu = pick(data.education);
  if (edu.length > 0) {
    lines.push("");
    lines.push("教育背景：");
    edu.forEach((e) => {
      const school = (e.school || "").trim();
      const degree = (e.degree || "").trim();
      const major = (e.major || "").trim();
      const duration = (e.duration || "").trim();
      lines.push(`- ${[school, degree, major, duration].filter(Boolean).join(" · ")}`);
    });
  }

  let text = lines.join("\n").trim();
  if (text.length > MAX_BRIEF) {
    text = text.slice(0, MAX_BRIEF) + "\n…（摘要过长已截断）";
  }
  return text;
}

/** 由版本对象(含 data)生成摘要，空版本返回 "" */
export function briefOfVersion(version) {
  if (!version || !version.data) return "";
  return buildResumeBrief(version.data);
}
