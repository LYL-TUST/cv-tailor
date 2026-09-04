import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { openai, MODEL_NAME } from "../services/openaiClient.js";

const router = Router();

/**
 * 简历导入：上传 PDF / DOCX → 提取纯文本 → LLM 结构化 → 返回 ATS 格式简历数据
 *
 * 设计原则（对应 PRD §6 AI 失败模式治理）：
 * - 文本提取失败 → 422，给出可读原因（如扫描件/加密 PDF）
 * - LLM 输出 → Zod 强校验，不合格直接报错，不把脏数据交给前端
 * - 原文永不落库，请求结束即丢弃（隐私承诺）
 */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const ok = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.mimetype);
    if (!ok) {
      cb(new Error("仅支持 PDF 或 .docx 文件（旧版 .doc 请先另存为 .docx）"));
    } else {
      cb(null, true);
    }
  },
});

/** 结构化简历 Zod Schema（与前端 ATS 格式一致） */
const ResumeSchema = z.object({
  personalInfo: z.object({
    name: z.string().default(""),
    title: z.string().default(""),
    email: z.string().default(""),
    phone: z.string().default(""),
    location: z.string().default(""),
    linkedin: z.string().default(""),
  }).default({}),
  summary: z.string().default(""),
  skills: z.array(z.string()).default([]),
  experience: z.array(z.object({
    company: z.string().default(""),
    position: z.string().default(""),
    duration: z.string().default(""),
    bullets: z.array(z.string()).default([]),
  })).default([]),
  education: z.array(z.object({
    school: z.string().default(""),
    degree: z.string().default(""),
    field: z.string().default(""),
    graduationYear: z.string().default(""),
  })).default([]),
});

const MAX_TEXT = 12000; // 超长简历截断，防止 token 爆炸

/** 从上传文件提取纯文本 */
async function extractText(file) {
  if (file.mimetype === "application/pdf") {
    // pdf-parse v2 API：PDFParse 类 + getText()（已实测验证）
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(file.buffer) });
    try {
      const result = await parser.getText();
      return { text: result.text, fileType: "pdf" };
    } finally {
      await parser.destroy();
    }
  }
  // .docx
  const mammothModule = await import("mammoth");
  const mammoth = mammothModule.default ?? mammothModule;
  const result = await mammoth.extractRawText({ buffer: file.buffer });
  return { text: result.value, fileType: "docx" };
}

/** 校验并规范 LLM 结构化结果，产出告警列表 */
function normalizeAndValidate(parsed) {
  const warnings = [];
  if (!parsed.personalInfo?.name) warnings.push("未能识别姓名，请手动补充");
  if (!parsed.personalInfo?.phone && !parsed.personalInfo?.email) warnings.push("未识别到联系方式");
  if (!parsed.experience?.length) warnings.push("未识别到工作经历，建议手动添加");
  if (!parsed.skills?.length) warnings.push("未识别到技能项");
  return { resumeData: parsed, warnings };
}

router.post("/parse-resume", upload.single("file"), async (req, res) => {
  const startedAt = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({ error: "请上传简历文件（PDF 或 .docx）" });
    }

    /* 1. 提取纯文本 */
    let text, fileType;
    try {
      ({ text, fileType } = await extractText(req.file));
    } catch (err) {
      return res.status(422).json({
        error: `无法读取文件内容：${err.message}。若是扫描件/图片型 PDF，请先用 Word 或 OCR 工具转成可编辑文档。`,
      });
    }

    const trimmed = (text || "").trim();
    if (trimmed.length < 30) {
      return res.status(422).json({
        error: "提取到的文本过少，可能是扫描件或加密文档，请换一份可编辑的简历文件。",
      });
    }

    /* 2. LLM 结构化抽取（JSON 模式 + Zod 兜底） */
    const prompt = `你是简历结构化引擎。从下面的简历原文中抽取结构化信息，输出 JSON（不要输出任何其他内容）。

要求：
- 严格基于原文抽取，禁止编造原文中不存在的任何信息
- 原文中没有的字段填空字符串或空数组
- 工作经历的 bullets 拆成独立短句数组；教育背景尽量补全 school/degree/field/graduationYear
- 联系方式里的电话、邮箱、城市、LinkedIn 分别放入对应字段

JSON 结构：
{
  "personalInfo": { "name": "", "title": "", "email": "", "phone": "", "location": "", "linkedin": "" },
  "summary": "",
  "skills": [],
  "experience": [{ "company": "", "position": "", "duration": "", "bullets": [] }],
  "education": [{ "school": "", "degree": "", "field": "", "graduationYear": "" }]
}

简历原文：
"""
${trimmed.slice(0, MAX_TEXT)}
"""`;

    const completion = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: "你是一个严谨的简历信息抽取器，只输出合法 JSON。" },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }, {
      timeout: 120000, // LLM 超时 2 分钟：超时直接报错，不让请求永久挂起
      maxRetries: 1,
    });

    let raw;
    try {
      raw = JSON.parse(completion.choices[0].message.content);
    } catch {
      return res.status(502).json({ error: "AI 结构化输出异常，请重试一次。" });
    }

    const validated = ResumeSchema.safeParse(raw);
    if (!validated.success) {
      return res.status(502).json({ error: "AI 结构化结果校验未通过，请重试一次。" });
    }

    /* 兜底：识别结果整体为空 → 明确报错，而不是把空简历交给前端"假装成功" */
    const v = validated.data;
    const hasContent = v.personalInfo?.name || v.summary || v.skills?.length > 0 ||
      v.experience?.length > 0 || v.education?.length > 0;
    if (!hasContent) {
      return res.status(422).json({
        error: "未能从文件中识别出有效简历内容。可能原因：① 扫描件/图片型 PDF（文字是图片，需要 OCR）；② 文档排版特殊导致文本提取乱码。建议：用 Word 打开后另存为 .docx 再试，或手动填写。",
      });
    }

    const { resumeData, warnings } = normalizeAndValidate(validated.data);

    res.json({
      resumeData,
      meta: {
        fileType,
        textLength: trimmed.length,
        truncated: trimmed.length > MAX_TEXT,
        warnings,
        ms: Date.now() - startedAt,
      },
    });
  } catch (err) {
    console.error("Import parse error:", err);
    res.status(500).json({ error: err.message?.includes("fileFilter") || err.message?.includes("仅支持") ? err.message : "简历导入解析失败。" });
  }
});

/** multer 文件类型错误统一处理 */
router.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || "上传失败" });
});

export default router;
