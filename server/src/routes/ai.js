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

export default router;
