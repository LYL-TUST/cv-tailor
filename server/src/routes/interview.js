import { Router } from "express";
import { openai, MODEL_NAME } from "../services/openaiClient.js";

const router = Router();

// 上下文输入护栏(与 ATS 的 F5 超长输入同源策略)
const MAX_JD = 4000;      // 职位描述最大字符
const MAX_BRIEF = 6000;   // 简历摘要最大字符

function clip(text, max) {
  if (!text) return "";
  const s = String(text).trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/** 拼装「面试官掌握的资料」注入段:简历(可选)与 JD(可选)的通用规则 */
function buildContextRules({ jobDescription, resumeBrief }) {
  const parts = [];
  if (jobDescription) {
    parts.push(
      "面试官已阅读该岗位的职位描述(JD),题目应紧扣 JD 中的职责与任职要求," +
      "考察求职者是否具备岗位所需的核心能力。"
    );
  }
  if (resumeBrief) {
    parts.push(
      "面试官已阅读求职者的简历(摘要附后),题目应贴合其真实经历与背景:" +
      "① 简历中有相关经历时,优先让求职者以自身真实经历作答;" +
      "② 简历未体现的能力不要默认其具备,可出假设情境题引导其补足;" +
      "③ 绝不诱导求职者编造简历中不存在的经历、项目或技能。"
    );
  }
  return parts.join("\n");
}

// 面试官风格档位(面试官资料包第四维度):影响语气/提问锋芒/追问方式,不影响评分标准
const STYLES = {
  standard: "大厂标准型:提问专业规范、结构清晰,语气客观正式;追问直接但保持礼貌。",
  friendly: "温和引导型:语气温和、先肯定再引导,追问时给出思考方向提示;压迫感低,适合建立表达信心。",
  pressure: "压力追问型:持续质疑与深挖,直击含糊表述、快速切换追问角度,模拟高压面试;对事不对人,保持专业。",
};
const STYLE_DEFAULT = "standard";
function styleOf(raw) {
  return STYLES[raw] ? raw : STYLE_DEFAULT;
}
function styleRule(raw, forEvaluate = false) {
  const key = styleOf(raw);
  const base = `面试官风格:${STYLES[key]}`;
  if (forEvaluate) {
    return `${base}
重要:风格只影响你的表达语气与提问锋芒,评分标准保持一致——不因温和风格放水,也不因压力风格压分。`;
  }
  return base;
}

// Generate interview questions
router.post("/generate", async (req, res) => {
    try {
        const {
            jobTitle,
            jobDescription,
            resumeBrief,
            interviewType = "mixed",
            count = 5,
            difficulty: difficultyRaw,
            focusCategories: focusRaw,
            style: styleRaw,
        } = req.body;

        // 弱项针对性再练(能力画像 → 定向出题):只保留合法维度名,最多 5 个
        const focusCategories = Array.isArray(focusRaw)
            ? [...new Set(focusRaw.map((c) => String(c).trim()).filter(Boolean).map((c) => c.slice(0, 24)))].slice(0, 5)
            : [];
        // 深挖模式题源是简历经历,维度由简历内容决定,定向规则不适用
        const focusRule =
            focusCategories.length > 0 && interviewType !== "resume-drill"
                ? `针对性补练要求:本次是弱项针对性练习,所有题目必须集中考察以下能力维度:${focusCategories.join("、")};每题的 category 字段必须取自这些维度(措辞可细分,但语义不得超出该范围)。`
                : "";

        // 难度档位(默认循序渐进):easy | medium | hard | progressive(旧客户端不带则渐进)
        const difficulty = ["easy", "medium", "hard", "progressive"].includes(difficultyRaw)
            ? difficultyRaw
            : "progressive";
        const difficultyLabel = {
            easy: "简单(常规水平,重在建立表达信心)",
            medium: "中等(常规深度加适度挑战)",
            hard: "困难(高复杂度情境与深入追问)",
            progressive: "循序渐进(整组由易到难递进,前面的题热身、后面的题挑战)",
        }[difficulty];
        const diffRule = `难度档位:${difficultyLabel}
出题要求:${
    difficulty === "progressive"
        ? "整组题目难度从 easy 递进到 hard,并严格按此顺序排列题目"
        : `每题难度均为「${difficulty}」对应档位`
};各题 difficulty 字段一律小写(easy|medium|hard)。`;
        const sRule = styleRule(styleRaw);

        if (!jobTitle) {
            return res.status(400).json({ error: "请提供目标职位" });
        }

        const jd = clip(jobDescription, MAX_JD);
        const brief = clip(resumeBrief, MAX_BRIEF);
        const ctxRules = buildContextRules({ jobDescription: jd, resumeBrief: brief });
        const n = Math.min(Math.max(Number(count) || 5, 1), 10);

        let prompt = "";

        if (interviewType === "resume-drill") {
            // 简历深挖模式:面试官逐条盘问简历经历(题源 = 简历,不依赖 JD)
            if (!brief) {
                return res.status(400).json({ error: "简历深挖模式需要先选择一份简历(简历摘要为空)" });
            }
            prompt = `
你是一位专业但严格的面试官,正在对求职者做「简历深挖」式面试。你已经完整读过求职者的简历,面试目的是验证简历的真实性与含金量,并帮求职者暴露经不起追问的薄弱点。

${diffRule}
难度语义:简单=浅层澄清;中等=深入细节;困难=挑战性假设与压力情境。
${sRule}

职位名称:${jobTitle}
${jd ? `(该求职者投递了「${jobTitle}」,可适当结合 JD 判断哪些经历最有价值)\n职位描述:${jd}` : ""}

求职者简历摘要:
${brief}

请针对简历中的真实内容生成 ${n} 道「经历深挖题」,要求:
- 从经历、项目、技能声明、量化数字中选取最有追问价值的点,每道题都锚定一段具体经历或一项声明
- 提问角度贴近真实追问:当时为什么这么做?遇到的最大困难与如何解决?怎么衡量成功、数据从哪来?你的个人贡献 vs 团队贡献?如果重来会改什么?有没有被否决的方案?
- 可少量穿插动机与自我认知题(如离职原因、职业规划、为什么觉得自己适合此岗),但主体必须是经历深挖
- 题目要具体到能看出你读了简历,禁止出与该简历无关的通用题
- 红线:不得暗示或诱导求职者编造简历中不存在的经历、项目、技能或数据

以 JSON 输出,格式如下:
{
  "questions": [
    {
      "question": "题目内容(中文)",
      "type": "behavioral|technical",
      "category": "深挖维度(如:项目细节、量化成果、团队协作、技能验证、动机)",
      "answerFramework": "STAR"(行为类题目填 STAR,否则空字符串),
      "fromExperience": "对应经历标识(如:公司-职位),取自简历",
      "drillHint": "面试官后续可能追问的方向提示(一句,可空)",
      "difficulty": "easy|medium|hard(依据追问锋芒与情境复杂度给出,一律小写)",
      "referenceTips": {
        "summary": "本题考察点(一句话)",
        "keyPoints": ["答题要点,2-4条,中文"],
        "sample": "简短示范:基于简历真实经历示意,禁止虚构简历中不存在的经历/项目/数据;简历信息不足时只写 STAR 框架,不编造细节(可空)"
      }
    }
  ]
}
`;
        } else if (interviewType === "behavioral") {
            prompt = `
请为「${jobTitle}」岗位生成 ${n} 道行为面试题。

${diffRule}
难度语义:简单=常见单一情境;中等=含取舍或冲突;困难=多角色矛盾或时间压力,追问更深。
${sRule}
${focusRule ? focusRule + "\n" : ""}
${jd ? `职位描述：${jd}` : ""}
${brief ? `简历摘要(面试官已阅读):\n${brief}` : ""}

${ctxRules}

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
      "answerFramework": "STAR",
      "fromExperience": "",
      "drillHint": "",
      "difficulty": "easy|medium|hard(按情境复杂度给出,一律小写)",
      "referenceTips": {
        "summary": "本题考察点(一句话)",
        "keyPoints": ["答题要点,2-4条,中文"],
        "sample": "简短示范:基于简历真实经历示意,禁止虚构简历中不存在的经历/项目/数据;简历信息不足时只写 STAR 框架,不编造细节(可空)"
      }
    }
  ]
}
`;
        } else if (interviewType === "technical") {
            prompt = `
请为「${jobTitle}」岗位生成 ${n} 道专业技术面试题。

${diffRule}
难度语义:简单=基础概念与常见场景;中等=需要深入分析;困难=复杂系统/边界情形/综合运用。
${sRule}
${focusRule ? focusRule + "\n" : ""}
${jd ? `职位描述：${jd}` : ""}
${brief ? `简历摘要(面试官已阅读):\n${brief}` : ""}

${ctxRules}

要求：
- 包含岗位相关的专业问题
- 覆盖理论知识与实际场景
- 难度从基础到进阶
- 紧扣该岗位的技术栈（若有 JD 则以 JD 为准；若简历声明了相关技能，可出验证题考察其真实掌握程度）
- 题目与解析用中文

以 JSON 输出，格式如下：
{
  "questions": [
    {
      "question": "题目内容（中文）",
      "type": "technical",
      "category": "分类（如：系统设计、编码、架构等）",
      "difficulty": "easy|medium|hard(一律小写)",
      "fromExperience": "",
      "drillHint": "",
      "referenceTips": {
        "summary": "本题考察点(一句话)",
        "keyPoints": ["答题要点,2-4条,中文"],
        "sample": "解题思路或简短示范(技术题给思路与关键结论即可,可空)"
      }
    }
  ]
}
`;
        } else {
            // Mixed
            prompt = `
请为「${jobTitle}」岗位生成 ${n} 道面试题（行为面与技术面混合）。

${diffRule}
难度语义:行为题按情境复杂度,技术题按知识深度,两种题型各自的难度都要符合档位。
${sRule}
${focusRule ? focusRule + "\n" : ""}
${jd ? `职位描述：${jd}` : ""}
${brief ? `简历摘要(面试官已阅读):\n${brief}` : ""}

${ctxRules}

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
      "answerFramework": "STAR"（如为行为题）,
      "fromExperience": "",
      "drillHint": "",
      "difficulty": "easy|medium|hard(按题型各自的难度语义给出,一律小写)",
      "referenceTips": {
        "summary": "本题考察点(一句话)",
        "keyPoints": ["答题要点,2-4条,中文"],
        "sample": "简短示范:行为题基于简历真实经历示意(禁止虚构);技术题给解题思路与关键结论(可空)"
      }
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

// Generate interviewer follow-up question (P2 真人面试循环:基于首答生成 1 条追问)
router.post("/follow-up", async (req, res) => {
    try {
        const {
            question,
            userAnswer,
            questionType = "behavioral",
            jobTitle = "",
            jobDescription,
            resumeBrief,
            style: styleRaw,
        } = req.body;

        if (!question || !userAnswer) {
            return res.status(400).json({ error: "请提供面试题与候选人的回答" });
        }

        const jd = clip(jobDescription, MAX_JD);
        const brief = clip(resumeBrief, MAX_BRIEF);
        const isResumeDrill = questionType === "resume-drill";
        const contextBlock = [
            jobTitle ? `目标职位：${jobTitle}` : "",
            jd ? `职位描述：\n${jd}` : "",
            brief ? `求职者简历摘要（面试官已阅读）：\n${brief}` : "",
        ].filter(Boolean).join("\n");

        const prompt = `
你是一位专业但严格的面试官，正在做模拟面试。候选人刚刚回答了你的问题，请基于其回答生成 1 条追问。
${styleRule(styleRaw)}

${contextBlock ? `【面试背景】\n${contextBlock}\n` : ""}
【面试题】${question}
【候选人回答】${userAnswer}
题目类型：${isResumeDrill ? "简历深挖（行为/情境为主）" : questionType}

追问要求：
- 追问必须针对候选人的回答内容：深挖其中的细节、数据来源、个人贡献，或挑战其中含糊、单薄、前后矛盾之处
- 若提供了简历背景，可结合简历核查回答与真实经历是否一致，追问可指向需要澄清的点；绝不诱导候选人编造简历中不存在的经历、项目、数据
- 只问一个问题，具体、锋利但专业礼貌，中文，尽量不超过 50 字
- 不重复原问题，不脱离候选人的回答与已有背景凭空发问

以 JSON 输出：
{
  "followUp": "追问内容（中文，一个问题）",
  "angle": "追问角度的极短标签（如：数据来源、个人贡献、方案取舍、真实性核实、结果衡量）"
}
`;

        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
        });

        const data = JSON.parse(response.choices[0].message.content);
        if (!data.followUp) {
            return res.status(500).json({ error: "追问生成失败" });
        }
        res.json({ followUp: data.followUp, angle: data.angle || "" });
    } catch (err) {
        console.error("Follow-up generation error:", err);
        res.status(500).json({ error: "追问生成失败" });
    }
});

// Generate whole-session review report (基于本场逐题记录的跨题归纳;追问命中率等统计由前端本地计算,不进 LLM)
router.post("/session-report", async (req, res) => {
    try {
        const { jobTitle = "", records } = req.body;

        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ error: "请提供本场逐题记录" });
        }

        // 精简记录(控 token):题干/回答截断,追问只留角度与是否回应
        const slim = records.slice(0, 10).map((r, i) => ({
            no: i + 1,
            question: clip(r.question, 80),
            category: r.category || "",
            type: r.type || "",
            difficulty: r.difficulty || "",
            score: typeof r.score === "number" ? r.score : null,
            timeUp: Boolean(r.timeUp),
            userAnswer: clip(r.userAnswer, 150),
            followUp: r.followUp && r.followUp.question
                ? { angle: r.followUp.angle || "", responded: Boolean((r.followUp.answer || "").trim()) }
                : null,
        }));

        const prompt = `
你是一位资深面试教练。候选人刚完成一场${jobTitle ? `「${jobTitle}」岗位的` : ""}模拟面试,以下是逐题记录(含得分、是否超时、是否被面试官追问及是否回应)。

逐题记录(JSON):
${JSON.stringify(slim)}

请生成整场复盘,要求:
- 一切基于记录归纳,不虚构未提及的表现;对低分题/超时/未回应追问如实点出
- commonWeaknesses:跨题共性弱点(如多处缺量化结果、追问应对薄弱、STAR 结构不完整、技术细节含糊),2-4 条,每条一句话并点出对应题号
- practiceAdvice:下一步训练建议,具体可执行,2-4 条
- highlights:整场亮点,1-3 条(没有明显亮点可返回空数组)
- overallSummary:总评,2-3 句,先肯定后指路,结合平均分水平

以 JSON 输出:
{
  "overallSummary": "总评(中文)",
  "highlights": ["亮点 1"],
  "commonWeaknesses": ["共性弱点 1(含题号)"],
  "practiceAdvice": ["训练建议 1"]
}
`;

        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
        });

        const data = JSON.parse(response.choices[0].message.content);
        res.json({
            overallSummary: data.overallSummary || "",
            highlights: Array.isArray(data.highlights) ? data.highlights : [],
            commonWeaknesses: Array.isArray(data.commonWeaknesses) ? data.commonWeaknesses : [],
            practiceAdvice: Array.isArray(data.practiceAdvice) ? data.practiceAdvice : [],
        });
    } catch (err) {
        console.error("Session report error:", err);
        res.status(500).json({ error: "复盘报告生成失败" });
    }
});

// Answer-vs-resume consistency check (回答-简历矛盾点对照:真实性护栏的结构化升级)
// 只对照、不虚构;「回答提到但简历没有」是提示核实/补充,不是指控
router.post("/consistency-check", async (req, res) => {
    try {
        const { question = "", userAnswer, resumeBrief, followUpAnswer = "" } = req.body;

        if (!userAnswer || !String(userAnswer).trim()) {
            return res.status(400).json({ error: "请提供你的回答" });
        }
        const brief = clip(resumeBrief, MAX_BRIEF);
        if (!brief) {
            return res.status(400).json({ error: "需要简历背景才能对照（请开启「结合我的简历」后重新出题）" });
        }

        const prompt = `
你是一位严谨但善意的简历真实性核查员。候选人刚完成一道面试题的回答,请将回答内容与其简历逐点比对,找出两类「矛盾点」与「含糊点」。

【面试题】${question ? clip(question, 200) : "（未提供题干,直接对照回答）"}
【候选人回答】${clip(userAnswer, 2500)}
${String(followUpAnswer).trim() ? `【候选人补充回答】${clip(followUpAnswer, 1500)}` : ""}
【候选人简历摘要】
${brief}

对照要求:
- not_in_resume:回答中提到的经历/项目/数据/技能/奖项在简历中完全没有体现(可能只是简历没写全,提醒其核实或日后补充进简历,不是指控造假)
- unclear:简历声明了相关经历/技能,但回答对关键细节(时间、数据、个人贡献、做法)说不清或含糊其辞(声明含金量存疑)
- conflict:回答与简历内容明显矛盾(如时间线、数字、角色、公司/项目名不一致)——这是最严重的一类
- 一切基于两份材料归纳,不虚构、不脑补;若回答与简历完全一致,如实给出一致结论,不要硬找问题
- advice 给可执行建议:如何在面试中把细节讲清楚,或如何把这段经历补进简历;绝不建议编造

以 JSON 输出:
{
  "verdict": "consistent|minor|concern(一致/有小疑点/需要认真对待)",
  "summary": "一句话总评(中文)",
  "items": [
    { "kind": "not_in_resume|unclear|conflict", "point": "矛盾点概述(一句话)", "detail": "具体说明:回答说了什么 vs 简历写了什么(或没写)", "advice": "建议(一句话)" }
  ]
}
`;

        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
        });

        const data = JSON.parse(response.choices[0].message.content);
        res.json({
            verdict: ["consistent", "minor", "concern"].includes(data.verdict) ? data.verdict : "minor",
            summary: data.summary || "",
            items: (Array.isArray(data.items) ? data.items : []).slice(0, 6).map((it) => ({
                kind: ["not_in_resume", "unclear", "conflict"].includes(it.kind) ? it.kind : "unclear",
                point: it.point || "",
                detail: it.detail || "",
                advice: it.advice || "",
            })),
        });
    } catch (err) {
        console.error("Consistency check error:", err);
        res.status(500).json({ error: "简历对照检查失败" });
    }
});

// Evaluate interview answer
router.post("/evaluate", async (req, res) => {
    try {
        const {
            question,
            userAnswer,
            questionType = "behavioral",
            jobTitle = "",
            jobDescription,
            resumeBrief,
            followUpQuestion = "",
            followUpAnswer = "",
            style: styleRaw,
        } = req.body;

        if (!question || !userAnswer) {
            return res.status(400).json({ error: "请提供面试题与你的回答" });
        }

        const jd = clip(jobDescription, MAX_JD);
        const brief = clip(resumeBrief, MAX_BRIEF);
        const isResumeDrill = questionType === "resume-drill";
        const contextBlock = [
            jobTitle ? `目标职位：${jobTitle}` : "",
            jd ? `职位描述：\n${jd}` : "",
            brief ? `求职者简历摘要（面试官已阅读）：\n${brief}` : "",
        ].filter(Boolean).join("\n");

        // P2 追问块:有追问时综合首答与补答评估
        const hasFollowUp = Boolean(String(followUpQuestion || "").trim());
        const followUpBlock = hasFollowUp ? `
【面试官追问】${String(followUpQuestion).trim()}
【求职者补充回答】${String(followUpAnswer || "").trim() || "（未回应追问）"}
` : "";
        const followUpRule = hasFollowUp ? `
- 本次包含一轮面试官追问：请综合首答与补充回答评估，反馈中体现「追问应对」的质量（追问是否回应到位、补充是否弥补了首答的薄弱点）
${String(followUpAnswer || "").trim() ? "" : "- 求职者未回应追问：请在改进建议中提醒其练习「被追问时如何接话补答」"}
` : "";

        const prompt = `
你是一位资深面试教练兼该岗位的面试官。请评估以下面试回答，并用中文给出反馈。
${styleRule(styleRaw, true)}

${contextBlock ? `【面试背景】\n${contextBlock}\n` : ""}
【面试题】${question}
【求职者回答】${userAnswer}${followUpBlock}
题目类型：${isResumeDrill ? "简历深挖（行为/情境为主）" : questionType}

评分时请严格对照面试背景：
- 切题度：回答是否回应了题目要求；若有 JD，是否体现 JD 所需能力
- 真实性：若有简历背景，判断回答是否基于其简历中的真实经历；若求职者提到简历中没有的经历/项目/数据，应在反馈中提示补充说明或核实（绝不建议其编造）
- 结构与表达清晰度、是否给出具体事例与细节、是否提及结果与影响
- 行为题是否遵循 STAR 结构；技术题回答是否准确${followUpRule}

以 JSON 输出详细评估：
{
  "score": 8.5,
  "feedback": "整体评估总结（中文，结合 JD 与简历背景给出针对性建议）",
  "strengths": ["优点 1", "优点 2"],
  "improvements": ["改进建议 1", "改进建议 2"],
  "starCompliance": true/false（如为行为题，是否遵循 STAR 结构）,
  "authenticityNote": "可选：对回答真实性的核查提示（有简历背景时给出；与简历一致/存疑/空泛无细节等）",
  "improvedAnswer": "可选：一版更优的回答示例（中文，须基于其简历已有经历，不得虚构）"
}
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
