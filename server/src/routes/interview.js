import { Router } from "express";
import { openai, MODEL_NAME } from "../services/openaiClient.js";

const router = Router();

// Generate interview questions
router.post("/generate", async (req, res) => {
    try {
        const { jobTitle, jobDescription, interviewType = "mixed", count = 5 } = req.body;

        if (!jobTitle) {
            return res.status(400).json({ error: "请提供目标职位" });
        }

        let prompt = "";

        if (interviewType === "behavioral") {
            prompt = `
请为「${jobTitle}」岗位生成 ${count} 道行为面试题。

${jobDescription ? `职位描述：${jobDescription}` : ""}

要求：
- 题目适合用 STAR 结构（情境、任务、行动、结果）回答
- 覆盖多种能力维度：领导力、团队协作、问题解决、冲突处理、适应能力
- 题目具体、贴近真实工作场景
- 每道题考察不同能力

以 JSON 输出，格式如下：
{
  "questions": [
    {
      "question": "题目内容（中文）",
      "type": "behavioral",
      "category": "能力维度（如：领导力）",
      "answerFramework": "STAR"
    }
  ]
}
`;
        } else if (interviewType === "technical") {
            prompt = `
请为「${jobTitle}」岗位生成 ${count} 道专业技术面试题。

${jobDescription ? `职位描述：${jobDescription}` : ""}

要求：
- 包含岗位相关的专业问题
- 覆盖理论知识与实际场景
- 难度从基础到进阶
- 紧扣该岗位的技术栈
- 题目与解析用中文

以 JSON 输出，格式如下：
{
  "questions": [
    {
      "question": "题目内容（中文）",
      "type": "technical",
      "category": "分类（如：系统设计、编码、架构等）",
      "difficulty": "Easy|Medium|Hard"
    }
  ]
}
`;
        } else {
            // Mixed
            prompt = `
请为「${jobTitle}」岗位生成 ${count} 道面试题（行为面与技术面混合）。

${jobDescription ? `职位描述：${jobDescription}` : ""}

要求：
- 混合行为面（可用 STAR 回答）与技术面题目
- 覆盖多种能力维度与专业技能
- 难度由易到难
- 题目真实、贴合岗位、用中文

以 JSON 输出，格式如下：
{
  "questions": [
    {
      "question": "题目内容（中文）",
      "type": "behavioral|technical",
      "category": "分类",
      "answerFramework": "STAR"（如为行为题）
    }
  ]
}
`;
        }

        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
        });

        const data = JSON.parse(response.choices[0].message.content);
        res.json(data);
    } catch (err) {
        console.error("Interview generation error:", err);
        res.status(500).json({ error: "面试题生成失败" });
    }
});

// Evaluate interview answer
router.post("/evaluate", async (req, res) => {
    try {
        const { question, userAnswer, questionType = "behavioral" } = req.body;

        if (!question || !userAnswer) {
            return res.status(400).json({ error: "请提供面试题与你的回答" });
        }

        const prompt = `
你是一位资深面试教练。请评估以下面试回答，并用中文给出反馈。

面试题：${question}
求职者回答：${userAnswer}
题目类型：${questionType}

请以 JSON 输出详细评估：
{
  "score": 8.5,
  "feedback": "整体评估总结（中文）",
  "strengths": ["优点 1", "优点 2"],
  "improvements": ["改进建议 1", "改进建议 2"],
  "starCompliance": true/false（如为行为题，是否遵循 STAR 结构）,
  "improvedAnswer": "可选：一版更优的回答示例（中文）"
}

评估维度：
- 结构与表达清晰度
- 是否给出具体事例与细节
- 是否提及结果与影响
- 是否切题
- 行为题是否遵循 STAR 结构
- 技术题回答是否准确
`;

        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
        });

        const evaluation = JSON.parse(response.choices[0].message.content);
        res.json(evaluation);
    } catch (err) {
        console.error("Answer evaluation error:", err);
        res.status(500).json({ error: "回答评估失败" });
    }
});

// Get interview tips for a specific role
router.post("/tips", async (req, res) => {
    try {
        const { jobTitle, interviewType = "general" } = req.body;

        const prompt = `
请为「${jobTitle}」岗位提供面试准备建议。
关注方向：${interviewType}

以 JSON 输出：
{
  "tips": [
    {
      "category": "面试前|面试中|面试后",
      "tip": "具体可执行的建议（中文）",
      "why": "简要说明为什么重要"
    }
  ]
}

提供 5-7 条实用建议。
`;

        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
        });

        const data = JSON.parse(response.choices[0].message.content);
        res.json(data);
    } catch (err) {
        console.error("Tips generation error:", err);
        res.status(500).json({ error: "面试建议生成失败" });
    }
});

export default router;
