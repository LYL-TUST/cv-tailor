import { useState, useEffect, useRef } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import ProfessionalPreview from "../components/templates/ProfessionalTemplate";
import ClassyPreview from "../components/templates/ClassyTemplate";
import SimplePreview from "../components/templates/SimpleTemplate";
import StylishPreview from "../components/templates/StylishTemplate";
import { track } from "../utils/analytics";
import * as api from "../utils/api";

export default function Download() {
  const [resumeData, setResumeData] = useState(null); // ATS format from localStorage
  const [editorResume, setEditorResume] = useState(null); // Mapped format for components
  const [loading, setLoading] = useState(false);
  const [docxLoading, setDocxLoading] = useState(false);
  const [templateId, setTemplateId] = useState('professional');
  const printRef = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('resumeData');
      if (saved) {
        const data = JSON.parse(saved);
        setResumeData(data);
        setTemplateId(data.selectedTemplate || 'professional');

        // Map ATS format back to Editor format for visual templates
        const mappedResume = {
          name: data.personalInfo?.name || "",
          title: data.personalInfo?.title || "",
          email: data.personalInfo?.email || "",
          phone: data.personalInfo?.phone || "",
          location: data.personalInfo?.location || "",
          linkedin: data.personalInfo?.linkedin || "",
          summary: data.summary || "",
          skills: data.skills?.join(', ') || "",
          experiences: data.experience?.map(exp => ({
            company: exp.company || "",
            role: exp.position || "",
            duration: exp.duration || "",
            bullets: exp.bullets?.length > 0 ? exp.bullets : [""],
          })) || [],
          education: data.education?.length > 0 ? data.education : [],
        };
        setEditorResume(mappedResume);
      }
    } catch (err) {
      console.error('Failed to load resume data:', err);
    }
  }, []);

  const PreviewComponent = {
    professional: ProfessionalPreview,
    classy: ClassyPreview,
    simple: SimplePreview,
    stylish: StylishPreview,
  }[templateId] || ProfessionalPreview;

  const generatePDF = async () => {
    if (!printRef.current) return;
    setLoading(true);

    try {
      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2, // Higher scale for better quality
        useCORS: true,
        logging: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      // Handle multi-page if content is long (basic implementation)
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const fileName = `${editorResume.name?.replace(/\s+/g, '_') || 'Resume'}_Resume.pdf`;
      pdf.save(fileName);
      track("pdf_export", { status: "success" });
    } catch (error) {
      track("pdf_export", { status: "fail", reason: String(error.message || error).slice(0, 120) });
      console.error('PDF generation failed:', error);
      alert('PDF 生成失败，请重试。');
    } finally {
      setLoading(false);
    }
  };

  const downloadDOCX = async () => {
    if (!resumeData) return;
    setDocxLoading(true);

    try {
      const startedAt = Date.now();
      await api.downloadDOCX({ resumeData });
      track("docx_export", { status: "success", ms: Date.now() - startedAt });
    } catch (error) {
      track("docx_export", { status: "fail", reason: String(error.message || error).slice(0, 120) });
      console.error('DOCX generation failed:', error);
      alert(`DOCX 生成失败：${error.message}`);
    } finally {
      setDocxLoading(false);
    }
  };

  const downloadText = () => {
    if (!resumeData) return;

    try {
      let textContent = '';
      if (resumeData.personalInfo?.name) textContent += `${resumeData.personalInfo.name}\n`;
      if (resumeData.personalInfo?.title) textContent += `${resumeData.personalInfo.title}\n`;
      textContent += '\n' + '='.repeat(50) + '\n\n';

      if (resumeData.summary) {
        textContent += 'SUMMARY\n';
        textContent += `${resumeData.summary}\n\n`;
      }

      if (resumeData.skills && resumeData.skills.length > 0) {
        textContent += 'SKILLS\n';
        textContent += `${resumeData.skills.join(', ')}\n\n`;
      }

      if (resumeData.experience && resumeData.experience.length > 0) {
        textContent += 'EXPERIENCE\n\n';
        resumeData.experience.forEach((exp) => {
          textContent += `${exp.position || '职位'} — ${exp.company || '公司'}\n`;
          if (exp.duration) textContent += `${exp.duration}\n`;
          if (exp.bullets) {
            exp.bullets.forEach((bullet) => {
              if (bullet.trim()) textContent += `• ${bullet}\n`;
            });
          }
          textContent += '\n';
        });
      }

      const blob = new Blob([textContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${resumeData.personalInfo?.name?.replace(/\s+/g, '_') || 'Resume'}_Resume.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      track("txt_export", { status: "success" });
    } catch (error) {
      track("txt_export", { status: "fail", reason: String(error.message || error).slice(0, 120) });
      console.error('Text download failed:', error);
    }
  };

  return (
    <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <h2 className="page-title">导出简历</h2>
      <p className="page-subtitle">
        将简历导出为兼容 ATS 的 PDF 格式
        {templateId && <span style={{ marginLeft: '8px', color: '#2563eb' }}>
          （模板：{templateId.charAt(0).toUpperCase() + templateId.slice(1)})
        </span>}
      </p>

      {!editorResume && (
        <div style={{ padding: '16px', background: '#fff3cd', color: '#856404', borderRadius: '8px' }}>
          ⚠️ 未找到简历数据，请先在「编辑器」中创建简历。
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '32px', marginTop: '24px' }}>

        {/* Left Column: Actions */}
        <div className="download-actions">
          <div className="download-options" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <button
              className="btn-primary"
              onClick={generatePDF}
              disabled={loading || !editorResume}
              style={{ fontSize: '16px', padding: '12px' }}
            >
              {loading ? '正在生成 PDF...' : '📄 下载 PDF'}
            </button>

            <button
              className="btn-primary"
              onClick={downloadDOCX}
              disabled={docxLoading || !editorResume}
              style={{ fontSize: '16px', padding: '12px' }}
            >
              {docxLoading ? '正在生成 DOCX...' : '📝 下载 Word（DOCX）'}
            </button>

            <button
              className="btn-ghost"
              onClick={downloadText}
              disabled={!editorResume}
            >
              📄 下载纯文本版
            </button>

            <div style={{
              marginTop: '16px',
              padding: '16px',
              background: '#e3f2fd',
              borderRadius: '8px',
              fontSize: '14px',
              lineHeight: '1.5'
            }}>
              <strong>💡 可视化 PDF 导出</strong><br />
              导出的 PDF 将与右侧预览完全一致，保留所选模板的字体、配色与排版。
            </div>
          </div>
        </div>

        {/* Right Column: Visual Preview */}
        <div style={{ minHeight: '500px' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>文档预览</h3>
          {editorResume ? (
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                overflow: 'hidden',
                background: 'white'
              }}
            >
              {/* 
                   We use an inner container for the ref so we capture ONLY the resume content 
                   and not the border/shadow of the wrapper 
                */}
              <div ref={printRef} style={{ background: 'white', width: '100%' }}>
                <PreviewComponent resume={editorResume} />
              </div>
            </div>
          ) : (
            <div style={{
              height: '400px',
              background: '#f8f9fa',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6c757d'
            }}>
              预览将显示在这里
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
