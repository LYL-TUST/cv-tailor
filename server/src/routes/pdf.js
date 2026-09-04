import { Router } from "express";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
} from "docx";

const router = Router();

// Generate PDF from resume data
router.post("/generate", async (req, res) => {
    try {
        const { resumeData, templateId = "ats-optimized" } = req.body;

        if (!resumeData) {
            return res.status(400).json({ error: "Resume data is required" });
        }

        // For now, return a placeholder response
        // In production, you would use a library like:
        // - puppeteer (headless Chrome)
        // - pdf-lib (PDF manipulation)
        // - jsPDF (client-side PDF generation)
        // - react-pdf or similar

        res.json({
            message: "PDF generation endpoint ready",
            note: "PDF library needs to be installed (puppeteer, pdf-lib, or jspdf)",
            resumeData,
            templateId,
            instructions: `
To implement PDF generation:

1. Install a PDF library:
   npm install puppeteer
   OR
   npm install pdf-lib

2. For puppeteer approach:
   - Render resume as HTML
   - Use puppeteer to convert HTML to PDF
   - Return PDF buffer

3. For pdf-lib approach:
   - Programmatically build PDF
   - Add text, formatting
   - Return PDF buffer

Example puppeteer code would go here.
      `,
        });

        // TODO: Implement actual PDF generation
        // Example with puppeteer:
        /*
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        // Generate HTML from resumeData
        const html = generateResumeHTML(resumeData, templateId);
        await page.setContent(html);
        
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
        });
        
        await browser.close();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=resume.pdf');
        res.send(pdf);
        */
    } catch (err) {
        console.error("PDF generation error:", err);
        res.status(500).json({ error: "PDF generation failed" });
    }
});

// Generate DOCX (Word document) —— 真实生成：docx 库构建文档，返回二进制流
// 支持 resumeData.settings：moduleOrder/moduleVisible(模块输出) + typography(字号/行距/对齐/页边距)
router.post("/generate-docx", async (req, res) => {
    try {
        const { resumeData } = req.body;
        if (!resumeData) {
            return res.status(400).json({ error: "Resume data is required" });
        }

        /* ===== settings(缺省即默认) ===== */
        const st = resumeData.settings || {};
        const typo = st.typography || {};
        const visible = st.moduleVisible || {};
        const order = Array.isArray(st.moduleOrder) ? st.moduleOrder : null;

        // 字号:前端语义 11/13/15 → docx half-points(10/12/14pt)
        const FS_HALF = { 11: 20, 13: 24, 15: 28 };
        const bodySize = FS_HALF[typo.fontSize] || 24;
        // 行距:1.x → spacing.line(240 = 1.0)
        const line = typo.lineHeight ? Math.round(typo.lineHeight * 240) : undefined;
        const spacingOpts = line ? { line, lineRule: "auto" } : {};
        // 对齐
        const ALIGN = {
            left: AlignmentType.LEFT,
            justify: AlignmentType.JUSTIFIED,
            center: AlignmentType.CENTER,
        };
        const align = ALIGN[typo.align] || AlignmentType.LEFT;
        // 页边距:与画布预览厘米等价(24px≈0.6cm→360twips / 38px≈1.0cm→570 / 54px≈1.4cm→810)
        const MARGIN_TW = { 24: 360, 38: 570, 54: 810 };
        const marginTw = MARGIN_TW[typo.margin] ?? 570;

        const info = resumeData.personalInfo || {};
        const contactLine = [
            info.email, info.phone, info.location, info.linkedin,
        ].filter(Boolean).join("  |  ");

        const has = (x) => Array.isArray(x) ? x.length > 0 : Boolean(x);
        const visOn = (id) => visible[id] !== false; // 默认可见

        /* ===== 章节生成器 ===== */
        const genSummary = () => [
            new Paragraph({ text: "个人简介", heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 120 } }),
            new Paragraph({ children: [new TextRun({ text: resumeData.summary, size: bodySize })], spacing: spacingOpts, alignment: align }),
        ];

        const genSkills = () => [
            new Paragraph({ text: "专业技能", heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 120 } }),
            new Paragraph({ children: [new TextRun({ text: resumeData.skills.join("、"), size: bodySize })], spacing: spacingOpts, alignment: align }),
        ];

        const genExperience = () => {
            const out = [];
            out.push(new Paragraph({ text: "工作经历", heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 120 } }));
            resumeData.experience.forEach((exp) => {
                const titleLine = [exp.position, exp.company, exp.duration].filter(Boolean).join("  |  ");
                out.push(new Paragraph({
                    children: [new TextRun({ text: titleLine || "经历", bold: true, size: bodySize })],
                    spacing: { before: 160, ...spacingOpts },
                }));
                (exp.bullets || []).filter((b) => b.trim()).forEach((b) => {
                    out.push(new Paragraph({
                        children: [new TextRun({ text: b, size: bodySize })],
                        bullet: { level: 0 },
                        spacing: spacingOpts,
                        alignment: align,
                    }));
                });
            });
            return out;
        };

        const genEducation = () => {
            const out = [];
            out.push(new Paragraph({ text: "教育背景", heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 120 } }));
            resumeData.education.forEach((edu) => {
                const eduLine = [edu.school, edu.degree, edu.field, edu.graduationYear].filter(Boolean).join("  |  ");
                if (eduLine) {
                    out.push(new Paragraph({
                        children: [new TextRun({ text: eduLine, size: bodySize })],
                        spacing: spacingOpts,
                        alignment: align,
                    }));
                }
            });
            return out;
        };

        const GENERATORS = {
            summary: { on: visOn("summary") && has(resumeData.summary), gen: genSummary },
            skills: { on: visOn("skills") && has(resumeData.skills), gen: genSkills },
            experience: { on: visOn("experience") && has(resumeData.experience), gen: genExperience },
            education: { on: visOn("education") && has(resumeData.education), gen: genEducation },
        };
        // 默认顺序(与前端 CONTENT_MODULES 默认一致)
        const DEFAULT_ORDER = ["summary", "experience", "education", "skills"];
        const moduleSeq = (order && order.length === 4) ? order : DEFAULT_ORDER;

        /* ===== 组装 ===== */
        const sections = [];
        if (info.name) {
            sections.push(new Paragraph({ text: info.name, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }));
        }
        if (info.title) {
            sections.push(new Paragraph({ text: info.title, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }));
        }
        if (contactLine) {
            sections.push(new Paragraph({
                children: [new TextRun({ text: contactLine, size: 18, color: "555555" })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 240 },
            }));
        }

        moduleSeq.forEach((id) => {
            const m = GENERATORS[id];
            if (m && m.on) sections.push(...m.gen());
        });

        const doc = new Document({
            styles: {
                default: {
                    document: { run: { font: "Microsoft YaHei", size: bodySize } },
                },
            },
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: marginTw, right: marginTw,
                            bottom: marginTw, left: marginTw,
                        },
                    },
                },
                children: sections.length > 0 ? sections : [new Paragraph({ children: [new TextRun({ text: "空简历" })] })],
            }],
        });

        const buffer = await Packer.toBuffer(doc);
        const fileName = `${(info.name || "Resume").replace(/\s+/g, "_")}_Resume.docx`;

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition",
            `attachment; filename="resume.docx"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error("DOCX generation error:", err);
        res.status(500).json({ error: "DOCX generation failed" });
    }
});

export default router;
