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

// JD 驱动的经历要点改写 —— 真实性护栏:只重写措辞、突出与 JD 要求相关的侧面,禁止新增事实
// 由 ATS 诊断页「去改写」调用:带着该 bullet + 语义诊断的要求/建议来重写
router.post("/rewrite-for-jd", async (req, res) => {
  try {
    const { bullet, requirement = "", suggestion = "", jobDescription = "" } = req.body;
    if (!bullet || !bullet.trim()) {
      return res.status(400).json({ error: "bullet 不能为空。" });
    }

    const prompt = `
你是一位专业的简历写作顾问。求职者正在针对一个职位要求,重写自己的一条简历经历要点,让已有经历中与该要求相关的能力呈现得更清晰、更贴近 JD 用语。

职位要求:${requirement || "（未提供）"}
补强建议:${suggestion || "（未提供）"}
职位描述(节选):${jobDescription ? jobDescription.slice(0, 1200) : "（未提供）"}

原始经历要点(唯一事实来源):
"""${bullet}"""

红线(必须遵守):
- 只允许重新组织语言、结构与措辞,把原要点中与职位要求相关的部分讲得更清楚
- 不得新增任何原始要点中没有的事实:公司、项目、产品、数字、指标、技能、时间线一律不得编造或夸大
- 如果原始要点确实不支撑该职位要求,就只做语言优化,不要硬贴 JD 关键词
- 保持 1-2 行,用中文输出;只返回改写后的要点本身,不要任何解释或引号
`;
    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    });

    res.json({ rewritten: response.choices[0].message.content.trim() });
  } catch (err) {
    console.error("Rewrite for JD error:", err);
    res.status(500).json({ error: "JD 改写失败。" });
  }
});

export default router;
