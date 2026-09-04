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
router.post("/generate-docx", async (req, res) => {
    try {
        const { resumeData } = req.body;
        if (!resumeData) {
            return res.status(400).json({ error: "Resume data is required" });
        }

        const info = resumeData.personalInfo || {};
        const contactLine = [
            info.email, info.phone, info.location, info.linkedin,
        ].filter(Boolean).join("  |  ");

        const sections = [];

        /* 抬头 */
        if (info.name) {
            sections.push(new Paragraph({
                text: info.name,
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
            }));
        }
        if (info.title) {
            sections.push(new Paragraph({
                text: info.title,
                heading: HeadingLevel.HEADING_2,
                alignment: AlignmentType.CENTER,
            }));
        }
        if (contactLine) {
            sections.push(new Paragraph({
                children: [new TextRun({ text: contactLine, size: 18, color: "555555" })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 240 },
            }));
        }

        /* 章节辅助 */
        const heading = (text) => new Paragraph({
            text,
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 240, after: 120 },
        });
        const body = (text) => new Paragraph({ children: [new TextRun(text)] });
        const bullet = (text) => new Paragraph({ text, bullet: { level: 0 } });

        if (resumeData.summary) {
            sections.push(heading("个人简介"));
            sections.push(body(resumeData.summary));
        }

        if (resumeData.skills?.length > 0) {
            sections.push(heading("专业技能"));
            sections.push(body(resumeData.skills.join("、")));
        }

        if (resumeData.experience?.length > 0) {
            sections.push(heading("工作经历"));
            resumeData.experience.forEach((exp) => {
                const titleLine = [exp.position, exp.company, exp.duration].filter(Boolean).join("  |  ");
                sections.push(new Paragraph({
                    children: [new TextRun({ text: titleLine || "经历", bold: true })],
                    spacing: { before: 160 },
                }));
                (exp.bullets || []).filter(b => b.trim()).forEach((b) => sections.push(bullet(b)));
            });
        }

        if (resumeData.education?.length > 0) {
            sections.push(heading("教育背景"));
            resumeData.education.forEach((edu) => {
                const eduLine = [edu.school, edu.degree, edu.field, edu.graduationYear].filter(Boolean).join("  |  ");
                if (eduLine) sections.push(body(eduLine));
            });
        }

        const doc = new Document({
            styles: {
                default: {
                    document: { run: { font: "Microsoft YaHei", size: 21 } },
                },
            },
            sections: [{
                properties: {},
                children: sections.length > 0 ? sections : [body("空简历")],
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
