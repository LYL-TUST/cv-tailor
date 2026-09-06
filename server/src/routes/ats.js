import { Router } from "express";
import { openai, MODEL_NAME } from "../services/openaiClient.js";

const router = Router();

// ---- LLM JSON 输出兜底:宽松提取 + 一次重试(防模型输出杂质导致 500) ----
function extractJsonObject(text) {
    if (typeof text !== "string" || !text.trim()) throw new Error("模型返回为空");
    try { return JSON.parse(text); } catch { /* fallthrough */ }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
        try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fallthrough */ }
    }
    throw new Error("模型未能返回合法 JSON");
}

async function chatJson(prompt, { temperature } = {}) {
    const messages = [{ role: "user", content: prompt }];
    for (let attempt = 0; attempt < 2; attempt++) {
        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages,
            response_format: { type: "json_object" },
            ...(temperature != null ? { temperature } : {}),
        });
        const content = response.choices?.[0]?.message?.content ?? "";
        try {
            return extractJsonObject(content);
        } catch (err) {
            if (attempt === 0) {
                messages.push({ role: "assistant", content: String(content).slice(0, 2000) });
                messages.push({ role: "user", content: "你的上一条输出不是合法 JSON。请只输出一个合法的 JSON 对象,不要包含任何解释、代码块标记或其他文本。" });
                continue;
            }
            throw err;
        }
    }
}

// Analyze resume against job description
router.post("/analyze", async (req, res) => {
    try {
        const { resumeData, jobDescription } = req.body;

        if (!resumeData || !jobDescription) {
            return res.status(400).json({ error: "请提供简历数据与职位描述" });
        }

        // Extract resume content as text
        const resumeText = formatResumeAsText(resumeData);

        // Use OpenAI to extract keywords and analyze match
        const analysisPrompt = `
你是一位资深的 ATS（自动简历筛选系统）分析专家。请将这份简历与职位描述进行匹配分析。

职位描述：
${jobDescription}

简历内容：
${resumeText}

请以 JSON 格式输出详细分析，字段如下：
1. atsScore：整体匹配得分（0-100）
2. matchedKeywords：命中关键词数组（简历与职位描述都出现的技能/关键词）
3. missingKeywords：缺失关键词数组，每项为 {"term": "关键词", "tier": "must" 或 "bonus"}。must=JD 中明确要求的硬性能力；bonus=JD 中标注「优先/加分」的要求
4. suggestions：3-5 条具体的改进建议（中文，可执行）
5. categoryScores：分维度得分（technicalSkills 专业技能、experience 经验、keywords 关键词），各 0-100
6. summary：一段中文总结，说明当前匹配情况与最大差距

注意:bonus 类缺失项不得建议候选人编造经历来补足,应建议用真实经历或学习路径自然呈现。

只返回合法的 JSON，不要输出任何其他文本。
`;

        const analysis = await chatJson(analysisPrompt, { temperature: 0.2 });

        // 归一化缺失关键词:missingKeywords 保持字符串数组(向后兼容旧前端/历史记录),
        // 分级明细另放 missingKeywordTiers,由前端分组渲染「必须 / 加分」
        const rawMissing = Array.isArray(analysis.missingKeywords) ? analysis.missingKeywords : [];
        const missingDetailed = rawMissing
            .map((m) => (typeof m === "string"
                ? { term: m, tier: "must" }
                : { term: m.term || m.keyword || String(m), tier: m.tier === "bonus" ? "bonus" : "must" }))
            .filter((x) => x.term);
        analysis.missingKeywords = missingDetailed.map((x) => x.term);
        analysis.missingKeywordTiers = missingDetailed;

        res.json(analysis);
    } catch (err) {
        console.error("ATS analysis error:", err);
        res.status(500).json({ error: "ATS 匹配分析失败" });
    }
});

// Get keyword suggestions for a specific job title
router.post("/keywords", async (req, res) => {
    try {
        const { jobTitle, industry } = req.body;

        const prompt = `
请列出该职位最重要的 15-20 个关键词与技能：

职位名称：${jobTitle}
行业：${industry || "通用"}

以 JSON 数组返回，字段 keywords 为字符串数组。请包含：
- 专业技能
- 软技能
- 工具/技术
- 行业术语

只返回合法的 JSON，不要输出任何其他文本。
`;

        const data = await chatJson(prompt, { temperature: 0.4 });
        res.json({ keywords: data.keywords || data });
    } catch (err) {
        console.error("Keyword generation error:", err);
        res.status(500).json({ error: "关键词生成失败" });
    }
});

// ============================================================
// 增量模块 1：语义级 JD 匹配诊断
// 原版 /analyze 只做"关键词比对"；这里把 JD 拆成职责要求逐条
// 语义匹配，输出 matchLevel + 证据引用 + 补强建议。
// ============================================================
router.post("/semantic-match", async (req, res) => {
    try {
        const { resumeData, jobDescription } = req.body;

        if (!resumeData || !jobDescription) {
            return res.status(400).json({ error: "请提供简历数据与职位描述" });
        }

        const resumeText = formatResumeAsText(resumeData);

        const prompt = `
你是一位资深招聘官 + 简历评审专家。请对下面这份简历与职位描述做"逐条职责的语义匹配分析"，
而不是简单的关键词比对——要判断候选人是否真正具备该职责背后的能力。

职位描述：
${jobDescription}

简历内容：
${resumeText}

请以 JSON 格式输出：
{
  "overallAssessment": "一段中文总体评价：候选人整体匹配度、最大优势、最大短板",
  "requirements": [
    {
      "requirement": "从 JD 中提炼出的一条具体职责/要求（中文）",
      "priority": "must | bonus",
      "matchLevel": "full | partial | missing",
      "evidence": "简历中支撑该匹配的证据原文摘录；若 missing 则说明为何判断缺失",
      "reasoning": "一句中文推理：为什么判定为这个匹配级别（看能力语义而非字面关键词）",
      "suggestion": "一条可执行的补强建议（若已 full 可为空字符串）"
    }
  ],
  "priorityActions": ["2-3 条按优先级排序的整体改进动作（中文）"]
}

要求：
- requirements 覆盖 JD 的 4-8 条核心要求，不要遗漏关键职责
- matchLevel 判定要基于能力语义：例如简历写"负责大模型产品落地"能支撑 JD 的"AI 产品规划"要求，即使措辞不同也算 full 或 partial
- evidence 必须是简历原文，不要编造
- priority 按 JD 原文区分：明确要求的职责为 must，「优先/加分」类要求为 bonus；bonus 项若判定 missing，建议中应提醒不必为凑分硬编，可用学习路径自然补足
- 只返回合法的 JSON，不要输出任何其他文本
`;

        const result = await chatJson(prompt, { temperature: 0.2 });
        res.json(result);
    } catch (err) {
        console.error("Semantic match error:", err);
        res.status(500).json({ error: "语义匹配分析失败" });
    }
});

// ============================================================
// 增量模块 2：建议质量 verifier（独立校验，不信任模型自述）
// 对 /analyze 或 /semantic-match 给出的建议逐条做规则化校验：
// 该建议是否真的回应了对应的缺失项，且具体可执行。
// 呼应个人方法论：与"独立 verifier 校验产物而非模型自述"一致。
// ============================================================
router.post("/verify-suggestions", async (req, res) => {
    try {
        // 优先接收结构化 resumeData,用与 /analyze、/semantic-match 相同的 formatResumeAsText
        // 格式化,保证 verifier 与诊断看到同一份简历文本(口径统一、省 token);
        // resumeText 为旧入参,向后兼容
        const { resumeData, resumeText: resumeRaw, jobDescription, suggestions = [], missingKeywords = [] } = req.body;

        if (!jobDescription || suggestions.length === 0) {
            return res.status(400).json({ error: "请提供职位描述与待校验的建议列表" });
        }

        const resumeText = resumeData ? formatResumeAsText(resumeData) : (resumeRaw || "");

        const prompt = `
你是一位严格的简历评审校验员。你的任务是对每条"改进建议"做独立校验，判断它是否：
(a) relevance：确实回应了职位描述或缺失项（不是泛泛而谈）；
(b) specific：足够具体可执行（包含可操作的动作/内容方向，而非空话）；
(c) honest：没有建议候选人编造不存在的经历（简历中无任何支撑时，不能建议"补充一段大模型项目经历"这种需要造假的建议，而应建议用真实经历或学习路径补足）。

职位描述：
${jobDescription}

简历内容（可能为空）：
${resumeText || "（未提供）"}

缺失关键词/能力：
${missingKeywords.length > 0 ? missingKeywords.join("、") : "（未提供）"}

待校验的建议：
${suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}

请以 JSON 格式输出：
{
  "results": [
    {
      "index": 0,
      "verified": true/false,
      "checks": { "relevance": true/false, "specific": true/false, "honest": true/false },
      "reason": "一句中文理由，说明通过/未通过哪项检查"
    }
  ],
  "summary": "一段中文总评：这些建议整体质量如何，哪些需要人工复核"
}

只返回合法的 JSON，不要输出任何其他文本。
`;

        const result = await chatJson(prompt, { temperature: 0.0 });
        // 归一化：保证 results 与传入 suggestions 顺序一致
        if (Array.isArray(result.results)) {
            result.results = result.results
                .filter((r) => typeof r.index === "number")
                .sort((a, b) => a.index - b.index);
        }
        res.json(result);
    } catch (err) {
        console.error("Suggestion verification error:", err);
        res.status(500).json({ error: "建议质量校验失败" });
    }
});

// Helper function to format resume data as plain text
function formatResumeAsText(resumeData) {
    const {
        personalInfo = {},
        summary = "",
        experience = [],
        education = [],
        skills = [],
    } = resumeData;

    let text = "";

    // Personal Info
    if (personalInfo.name) text += `${personalInfo.name}\n`;
    if (personalInfo.title) text += `${personalInfo.title}\n`;
    text += "\n";

    // Summary
    if (summary) text += `个人简介：\n${summary}\n\n`;

    // Experience
    if (experience.length > 0) {
        text += "工作经历：\n";
        experience.forEach((exp) => {
            text += `${exp.position || ""} at ${exp.company || ""}\n`;
            if (exp.bullets) {
                exp.bullets.forEach((bullet) => {
                    text += `- ${bullet}\n`;
                });
            }
            text += "\n";
        });
    }

    // Education
    if (education.length > 0) {
        text += "教育背景：\n";
        education.forEach((edu) => {
            text += `${edu.degree || ""} in ${edu.field || ""} - ${edu.school || ""}\n`;
        });
        text += "\n";
    }

    // Skills
    if (skills.length > 0) {
        text += `技能：\n${skills.join(", ")}\n`;
    }

    return text;
}

export default router;
