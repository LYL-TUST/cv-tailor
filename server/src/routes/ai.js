import { Router } from "express";
import { openai, MODEL_NAME } from "../services/openaiClient.js";

const router = Router();

// Generate resume summary
router.post("/generate-summary", async (req, res) => {
  try {
    const { fullName, title, skills, tone } = req.body;

    const prompt = `
请为求职者撰写一段简洁、规范、可通过 ATS（自动简历筛选系统）的简历个人简介。

姓名：${fullName}
目标职位：${title}
技能：${skills && skills.length > 0 ? skills.join("、") : "未提供"}
语气：${tone}

要求：
- 不超过 4 行
- 不用空话套话、不堆砌术语、不使用表情符号
- 突出与该职位相关的核心能力与经验
- 用中文输出
`;

    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
    });

    res.json({ summary: response.choices[0].message.content.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI 个人简介生成失败。" });
  }
});

// Generate experience bullet points
router.post("/generate-bullets", async (req, res) => {
  try {
    const { jobTitle, company, responsibilities, tone = "professional" } = req.body;

    const prompt = `
你是一位专业的简历写作顾问。请为以下这段工作经历撰写 3-5 条有冲击力的要点描述。

职位：${jobTitle}
公司：${company}
职责：${responsibilities}
语气：${tone}

要求：
- 采用 STAR 结构（情境、任务、行动、结果）
- 尽量包含可量化的指标
- 每条以有力的动作动词开头
- 每条保持简洁（1-2 行）
- 便于通过 ATS 关键词筛选
- 突出成就而非仅仅罗列职责
- 用中文输出

只返回要点本身，每行一条，不要编号。
`;

    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
    });

    const bullets = response.choices[0].message.content
      .trim()
      .split("\n")
      .filter((b) => b.trim());

    res.json({ bullets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "经历要点生成失败。" });
  }
});

// Improve existing bullet point
router.post("/improve-bullet", async (req, res) => {
  try {
    const { bulletPoint, addMetrics = false } = req.body;

    const prompt = `
你是一位专业的简历写作顾问。请优化以下这条简历要点：

"${bulletPoint}"

要求：
- 使其更有冲击力、更突出结果
- 使用有力的动作动词
- ${addMetrics ? "- 在合适的地方补充或建议具体的量化数字/指标" : ""}
- 保持简洁（1-2 行）
- 尽可能遵循 STAR 结构
- 便于通过 ATS 关键词筛选
- 用中文输出

只返回优化后的要点。
`;

    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
    });

    res.json({ improvedBullet: response.choices[0].message.content.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "要点优化失败。" });
  }
});

// Convert experience to STAR format
router.post("/convert-to-star", async (req, res) => {
  try {
    const { experience, bullets } = req.body;

    const prompt = `
请将以下工作经历改写为 STAR 结构（情境、任务、行动、结果）的要点描述。

经历背景：${experience}
现有要点：
${bullets && bullets.length > 0 ? bullets.join("\n") : "未提供要点"}

要求：
- 生成 3-5 条 STAR 格式要点
- 包含具体的量化指标与成果
- 使用有力的动作动词
- 每条突出成就
- 保持简洁并便于 ATS 筛选
- 用中文输出

只返回要点，每行一条。
`;

    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
    });

    const starBullets = response.choices[0].message.content
      .trim()
      .split("\n")
      .filter((b) => b.trim());

    res.json({ starBullets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "STAR 结构改写失败。" });
  }
});

// Fill employment gaps with professional explanation
router.post("/fill-gaps", async (req, res) => {
  try {
    const { gapPeriod, reason } = req.body;

    const prompt = `
请为简历或求职信撰写一段简短、专业的空窗期解释。

空窗期：${gapPeriod}
原因：${reason}

要求：
- 保持积极、专业的口吻
- 侧重空窗期中学到的技能或参与的活动
- 最多 2-3 句话
- 诚实但有力
- 用中文输出

只返回解释文本。
`;

    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
    });

    res.json({ explanation: response.choices[0].message.content.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "空窗期解释生成失败。" });
  }
});

// 字段级润色 —— 保留全部事实信息,只重写语言与结构(真实性护栏)
// kind: 'summary' | 'skills' | 'bullet'
router.post("/polish-text", async (req, res) => {
  try {
    const { text, kind = "bullet" } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "text 不能为空。" });
    }

    const kindGuide = {
      summary: "这是一段简历「个人简介」。优化其表达:更精炼、有层次、突出能力与经验,结构清晰(可含 2-3 个分号或句号连接的短句)。",
      skills: "这是简历「专业技能」列表(逗号或顿号分隔)。整理:统一分隔符(逗号)、去除重复项、按「岗位相关度从高到低」排序;不要新增技能。",
      bullet: "这是简历中的一条经历要点。优化:以有力的动作动词开头、突出结果与量化信息、符合 STAR 逻辑、保持 1-2 行。",
    };

    const prompt = `
你是一位专业的简历写作顾问。请润色下面这段内容,只输出优化后的文本本身。

内容类型:${kindGuide[kind] || kindGuide.bullet}

原文:
"""${text}"""

红线(必须遵守):
- 只允许重写语言、结构与措辞;不得新增、删改或虚构任何事实数据(公司、项目、数字、指标一律保持原样)
- 不得凭空补充原文没有的信息
- 用中文输出;只返回结果,不要任何解释或引号
`;
    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    });

    res.json({ polished: response.choices[0].message.content.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "内容润色失败。" });
  }
});

// Cover letter 生成 —— 基于简历真实信息 + 可选 JD,不编造经历
router.post("/cover-letter", async (req, res) => {
  try {
    const { fullName, title, company, jd, summary, skills, experienceBrief } = req.body || {};

    const experienceText = Array.isArray(experienceBrief) && experienceBrief.length
      ? experienceBrief.map((e, i) => `${i + 1}. ${e}`).join("\n")
      : "未提供";

    const prompt = `
你是一位求职顾问。请为求职者写一封正式的中文求职信(Cover Letter)。

求职者:${fullName || "求职者"}
目标职位:${title || ""}
目标公司:${company || ""}
个人简介:${summary || "未提供"}
核心技能:${skills || "未提供"}
真实经历(供引用,禁止超出此范围编造):
${experienceText}
目标岗位 JD(如有,用于针对性回应):
${jd || "未提供"}

要求:
- 300~450 字;结构:称呼 → 应聘意向与动机 → 用 1-2 段点出与职位最相关的经历/能力(可引用上面的真实经历,但不得虚构公司、项目或量化数字)→ 收尾致谢
- 称呼默认「尊敬的招聘负责人:」,如公司名明确可写作「尊敬的${company || ""}招聘团队:」
- 语气专业、真诚、不空洞
- 用中文输出;正文用换行分段落,不要标题与落款日期
`;
    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
    });

    res.json({ letter: response.choices[0].message.content.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "求职信生成失败。" });
  }
});

export default router;
