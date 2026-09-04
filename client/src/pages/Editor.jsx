import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import * as api from "../utils/api";
import { track } from "../utils/analytics";
import {
  listVersions, getActiveVersion, writeThrough,
  createVersion, duplicateVersion, switchTo, renameVersion, deleteVersion,
} from "../utils/resumeStore";

import ProfessionalPreview from "../components/templates/ProfessionalTemplate";
import ClassyPreview from "../components/templates/ClassyTemplate";
import SimplePreview from "../components/templates/SimpleTemplate";
import StylishPreview from "../components/templates/StylishTemplate";

const blankResume = () => ({
  name: "",
  title: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  summary: "",
  skills: "",
  experiences: [{
    company: "",
    role: "",
    duration: "",
    bullets: [""],
  }],
  education: [{
    school: "",
    degree: "",
    field: "",
    graduationYear: "",
  }],
});

/** ATS 格式 → 编辑器格式 */
const atsToEditor = (resumeData) => ({
  name: resumeData.personalInfo?.name || "",
  title: resumeData.personalInfo?.title || "",
  email: resumeData.personalInfo?.email || "",
  phone: resumeData.personalInfo?.phone || "",
  location: resumeData.personalInfo?.location || "",
  linkedin: resumeData.personalInfo?.linkedin || "",
  summary: resumeData.summary || "",
  skills: resumeData.skills?.join(', ') || "",
  experiences: resumeData.experience?.map(exp => ({
    company: exp.company || "",
    role: exp.position || "",
    duration: exp.duration || "",
    bullets: exp.bullets?.length > 0 ? exp.bullets : [""],
  })) || [{
    company: "",
    role: "",
    duration: "",
    bullets: [""],
  }],
  education: resumeData.education?.length > 0 ? resumeData.education : [{
    school: "",
    degree: "",
    field: "",
    graduationYear: "",
  }],
});

export default function Editor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get('template') || 'professional';

  const [resume, setResume] = useState(blankResume());
  const [versions, setVersions] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const [loadingStates, setLoadingStates] = useState({
    summary: false,
    bullets: {},
    star: {},
  });

  const [error, setError] = useState(null);

  // 防竞态守卫（必须是 state 而非 ref）：
  // hydrated 为 false 期间自动保存绝不写入。state 要到下一轮渲染才生效，
  // 因此挂载第一轮（resume 还是空白初始值）时保存 effect 必然被跳过，
  // 防止空白简历覆盖刚导入的数据；ref 版守卫在同轮就已生效，挡不住。
  const [hydrated, setHydrated] = useState(false);

  // Load saved resume (multi-version aware) on mount
  useEffect(() => {
    try {
      setVersions(listVersions());
      const active = getActiveVersion();
      if (active) {
        setActiveId(active.id);
        if (active.data && !active.data.empty) {
          setResume(atsToEditor(active.data));
        }
      }
    } catch (err) {
      console.error('读取已保存的简历失败:', err);
    } finally {
      setHydrated(true); // 下一轮渲染起才允许自动保存
    }
  }, []);

  /* Helpers */
  const updateField = (field, value) => {
    setResume({ ...resume, [field]: value });
  };

  const updateExperience = (i, field, value) => {
    const exps = [...resume.experiences];
    exps[i][field] = value;
    setResume({ ...resume, experiences: exps });
  };

  const updateBullet = (ei, bi, value) => {
    const exps = [...resume.experiences];
    exps[ei].bullets[bi] = value;
    setResume({ ...resume, experiences: exps });
  };

  const addBullet = (ei) => {
    const exps = [...resume.experiences];
    exps[ei].bullets.push("");
    setResume({ ...resume, experiences: exps });
  };

  const addExperience = () => {
    setResume({
      ...resume,
      experiences: [
        ...resume.experiences,
        { company: "", role: "", duration: "", bullets: [""] },
      ],
    });
  };

  const updateEducation = (i, field, value) => {
    const edu = [...resume.education];
    edu[i][field] = value;
    setResume({ ...resume, education: edu });
  };

  const addEducation = () => {
    setResume({
      ...resume,
      education: [...resume.education, { school: "", degree: "", field: "", graduationYear: "" }],
    });
  };

  /* AI Functions */
  const generateSummary = async () => {
    setLoadingStates({ ...loadingStates, summary: true });
    setError(null);

    try {
      const startedAt = Date.now();
      track("ai_generate_click", { feature: "summary" });
      const response = await api.generateSummary({
        fullName: resume.name,
        title: resume.title,
        skills: resume.skills.split(',').map(s => s.trim()).filter(Boolean),
        tone: 'professional',
      });
      updateField("summary", response.summary);
      track("ai_generate_success", { feature: "summary", ms: Date.now() - startedAt });
    } catch (err) {
      track("ai_generate_fail", { feature: "summary", reason: String(err.message || err).slice(0, 120) });
      setError(`生成个人简介失败: ${err.message}`);
    } finally {
      setLoadingStates({ ...loadingStates, summary: false });
    }
  };

  const generateBulletsForExp = async (expIndex) => {
    const exp = resume.experiences[expIndex];

    if (!exp.role || !exp.company) {
      setError("请先填写职位与公司");
      return;
    }

    setLoadingStates({
      ...loadingStates,
      bullets: { ...loadingStates.bullets, [expIndex]: true },
    });
    setError(null);

    try {
      const startedAt = Date.now();
      track("ai_generate_click", { feature: "bullets" });
      const response = await api.generateBullets({
        jobTitle: exp.role,
        company: exp.company,
        responsibilities: exp.bullets.filter(b => b.trim()).join('. ') || 'General responsibilities',
        tone: 'professional',
      });

      const exps = [...resume.experiences];
      exps[expIndex].bullets = response.bullets;
      setResume({ ...resume, experiences: exps });
      track("ai_generate_success", { feature: "bullets", ms: Date.now() - startedAt });
    } catch (err) {
      track("ai_generate_fail", { feature: "bullets", reason: String(err.message || err).slice(0, 120) });
      setError(`生成经历要点失败: ${err.message}`);
    } finally {
      setLoadingStates({
        ...loadingStates,
        bullets: { ...loadingStates.bullets, [expIndex]: false },
      });
    }
  };

  const convertToSTAR = async (expIndex) => {
    const exp = resume.experiences[expIndex];

    setLoadingStates({
      ...loadingStates,
      star: { ...loadingStates.star, [expIndex]: true },
    });
    setError(null);

    try {
      const startedAt = Date.now();
      track("ai_generate_click", { feature: "star" });
      const response = await api.convertToStar({
        experience: `${exp.role} at ${exp.company}`,
        bullets: exp.bullets.filter(b => b.trim()),
      });

      const exps = [...resume.experiences];
      exps[expIndex].bullets = response.starBullets;
      setResume({ ...resume, experiences: exps });
      track("ai_generate_success", { feature: "star", ms: Date.now() - startedAt });
    } catch (err) {
      track("ai_generate_fail", { feature: "star", reason: String(err.message || err).slice(0, 120) });
      setError(`STAR 格式转换失败: ${err.message}`);
    } finally {
      setLoadingStates({
        ...loadingStates,
        star: { ...loadingStates.star, [expIndex]: false },
      });
    }
  };

  /* Progress */
  const progress = useMemo(() => {
    let score = 0;
    if (resume.name) score += 10;
    if (resume.title) score += 10;
    if (resume.email) score += 5;
    if (resume.phone) score += 5;
    if (resume.location) score += 5;
    if (resume.summary) score += 15;
    if (resume.skills) score += 15;
    if (resume.experiences.some((e) => e.company && e.role)) score += 20;
    if (resume.education.some((e) => e.school && e.degree)) score += 15;
    return Math.min(score, 100);
  }, [resume]);

  /* Persist to localStorage（多版本：写当前激活版本 + 写穿 resumeData 兼容旧页面）
     守卫：hydrated 为 false（挂载第一轮）时绝不写入 */
  useEffect(() => {
    if (!hydrated) return;
    try {
      const resumeDataForATS = {
        personalInfo: {
          name: resume.name,
          title: resume.title,
          email: resume.email,
          phone: resume.phone,
          location: resume.location,
          linkedin: resume.linkedin,
        },
        summary: resume.summary,
        skills: resume.skills.split(',').map(s => s.trim()).filter(Boolean),
        experience: resume.experiences.map(exp => ({
          company: exp.company,
          position: exp.role,
          duration: exp.duration,
          bullets: exp.bullets.filter(b => b.trim()),
        })),
        education: resume.education,
        selectedTemplate: templateId,
      };
      writeThrough(resumeDataForATS);
    } catch (err) {
      console.error('保存简历数据失败:', err);
    }
  }, [hydrated, resume, templateId, activeId]);

  /* ===== 多版本管理 ===== */
  const refreshVersions = () => setVersions(listVersions());

  const handleCreateVersion = () => {
    const name = window.prompt('新简历版本名称（如：字节跳动-产品岗）', '未命名简历');
    if (name === null) return;
    createVersion(name.trim() || '未命名简历');
    setActiveId(getActiveVersion().id);
    setResume(blankResume()); // 新版本从空白开始
    refreshVersions();
    track("resume_version_create", { action: "create" });
  };

  const handleDuplicateVersion = () => {
    if (!activeId) return;
    duplicateVersion(activeId);
    setActiveId(getActiveVersion().id);
    refreshVersions();
    track("resume_version_create", { action: "duplicate" });
  };

  const handleSwitchVersion = (id) => {
    if (id === activeId) return;
    const target = switchTo(id);
    if (!target) return;
    setActiveId(id);
    setResume(target.data && !target.data.empty ? atsToEditor(target.data) : blankResume());
    track("resume_version_switch", { from: activeId, to: id });
  };

  const handleRenameVersion = () => {
    if (!activeId) return;
    const current = versions.find(v => v.id === activeId);
    const name = window.prompt('修改版本名称', current?.name || '');
    if (name === null || !name.trim()) return;
    renameVersion(activeId, name.trim());
    refreshVersions();
  };

  const handleDeleteVersion = () => {
    if (!activeId) return;
    if (versions.length <= 1) {
      alert('至少保留一个简历版本');
      return;
    }
    const current = versions.find(v => v.id === activeId);
    if (!window.confirm(`确定删除版本「${current?.name}」？此操作不可恢复。`)) return;
    const { active } = deleteVersion(activeId);
    setActiveId(active);
    const target = versions.find(v => v.id === active);
    setResume(target?.data && !target.data.empty ? atsToEditor(target.data) : blankResume());
    refreshVersions();
    track("resume_version_delete", {});
  };

  // Select preview component based on template
  const PreviewComponent = {
    professional: ProfessionalPreview,
    classy: ClassyPreview,
    simple: SimplePreview,
    stylish: StylishPreview,
  }[templateId] || ProfessionalPreview;

  return (
    <section className="editor">
      {/* LEFT PANEL */}
      <div className="editor-panel">
        <div className="editor-header">
          <h2 className="editor-title">
            <span className="editor-title-ico" aria-hidden="true">✏️</span>
            简历编辑器
          </h2>
          <div className="editor-header-meta">
            {templateId && (
              <span className="editor-chip">模板：{templateId}</span>
            )}
            <span className="progress-badge">{progress}% 已完成</span>
          </div>
        </div>

        {/* 多版本管理条 */}
        <div className="version-bar">
          <span className="version-bar-label">版本</span>
          <select
            value={activeId || ''}
            onChange={(e) => handleSwitchVersion(e.target.value)}
            className="version-bar-select"
          >
            {versions.length === 0 && <option value="">（暂无版本）</option>}
            {versions.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={handleCreateVersion}>＋ 新建空白版</button>
          <button className="btn btn-ghost btn-sm" onClick={handleDuplicateVersion}>⧉ 复制当前版</button>
          <button className="btn btn-ghost btn-sm" onClick={handleRenameVersion}>✎ 重命名</button>
          <button className="btn btn-ghost btn-sm version-bar-del" onClick={handleDeleteVersion}>🗑 删除</button>
          <span className="version-bar-hint">不同公司/岗位各存一版，互不影响</span>
        </div>

        {error && (
          <div className="notice notice-err">
            {error}
          </div>
        )}

        {/* Personal Info */}
        <label>姓名 *</label>
        <input value={resume.name} onChange={(e) => updateField("name", e.target.value)} />

        <label>目标职位 *</label>
        <input value={resume.title} onChange={(e) => updateField("title", e.target.value)} />

        {/* Contact Info */}
        <h3 className="section-heading">联系方式</h3>

        <label>邮箱</label>
        <input value={resume.email} onChange={(e) => updateField("email", e.target.value)} placeholder="you@example.com" />

        <label>电话</label>
        <input value={resume.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="(123) 456-7890" />

        <label>所在城市</label>
        <input value={resume.location} onChange={(e) => updateField("location", e.target.value)} placeholder="城市" />

        <label>LinkedIn / 主页</label>
        <input value={resume.linkedin} onChange={(e) => updateField("linkedin", e.target.value)} placeholder="linkedin.com/in/你的主页" />

        {/* Summary */}
        <h3 className="section-heading">个人简介</h3>
        <textarea
          value={resume.summary}
          onChange={(e) => updateField("summary", e.target.value)}
          placeholder="填写或让 AI 生成个人简介"
          rows={4}
        />

        <button
          className="btn-primary"
          onClick={generateSummary}
          disabled={loadingStates.summary}
        >
          {loadingStates.summary ? '正在生成...' : 'AI 生成个人简介 ✨'}
        </button>

        {/* Skills */}
        <label>技能（用逗号分隔）</label>
        <textarea
          value={resume.skills}
          onChange={(e) => updateField("skills", e.target.value)}
          placeholder="需求分析, 数据分析, 产品设计"
          rows={2}
        />

        {/* 工作经历 */}
        <h3 className="section-heading">工作经历</h3>

        {resume.experiences.map((exp, i) => (
          <div key={i} className="experience-block">
            <input
              placeholder="公司"
              value={exp.company}
              onChange={(e) => updateExperience(i, "company", e.target.value)}
            />
            <input
              placeholder="职位"
              value={exp.role}
              onChange={(e) => updateExperience(i, "role", e.target.value)}
            />
            <input
              placeholder="任职时间（如 2023.01 - 至今）"
              value={exp.duration}
              onChange={(e) => updateExperience(i, "duration", e.target.value)}
            />

            <label>职责 / 成就</label>
            {exp.bullets.map((b, bi) => (
              <input
                key={bi}
                placeholder="• 输入要点"
                value={b}
                onChange={(e) => updateBullet(i, bi, e.target.value)}
              />
            ))}

            <div className="exp-actions">
              <button
                className="btn-ghost"
                type="button"
                onClick={() => addBullet(i)}
              >
                + 添加要点
              </button>
              <button
                className="btn-ghost"
                onClick={() => generateBulletsForExp(i)}
                disabled={loadingStates.bullets[i]}
              >
                {loadingStates.bullets[i] ? '正在生成...' : 'AI 生成要点 ✨'}
              </button>
              <button
                className="btn-ghost"
                onClick={() => convertToSTAR(i)}
                disabled={loadingStates.star[i]}
              >
                {loadingStates.star[i] ? '转换中...' : 'STAR 结构化 ✨'}
              </button>
            </div>
          </div>
        ))}

        <button className="btn-ghost" onClick={addExperience}>
          + 添加工作经历
        </button>

        {/* 教育背景 */}
        <h3 className="section-heading">教育背景</h3>

        {resume.education.map((edu, i) => (
          <div key={i} className="experience-block">
            <input
              placeholder="学校"
              value={edu.school}
              onChange={(e) => updateEducation(i, "school", e.target.value)}
            />
            <input
              placeholder="学历"
              value={edu.degree}
              onChange={(e) => updateEducation(i, "degree", e.target.value)}
            />
            <input
              placeholder="专业"
              value={edu.field}
              onChange={(e) => updateEducation(i, "field", e.target.value)}
            />
            <input
              placeholder="毕业年份"
              value={edu.graduationYear}
              onChange={(e) => updateEducation(i, "graduationYear", e.target.value)}
            />
          </div>
        ))}

        <button className="btn-ghost" onClick={addEducation}>
          + 添加教育背景
        </button>

        {/* 下一步操作：创作完成后衔接诊断/投递（不占全局导航） */}
        <h3 className="section-heading">下一步</h3>
        <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
          <button
            className="btn-primary"
            onClick={() => navigate('/ats')}
            style={{ width: '100%' }}
          >
            🎯 JD 匹配诊断（ATS）
          </button>
          <button
            className="btn-ghost"
            onClick={() => navigate('/interview')}
            style={{ width: '100%' }}
          >
            🎤 模拟面试
          </button>
          <button
            className="btn-ghost"
            onClick={() => navigate('/download')}
            style={{ width: '100%' }}
          >
            📄 导出 PDF / Word
          </button>
          <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>
            使用「{templateId}」模板导出兼容 ATS 的 PDF
          </p>
        </div>
      </div>

      {/* RIGHT PANEL - Template Preview */}
      <div className="preview-panel">
        <div className="resume-card">
          <PreviewComponent resume={resume} />
        </div>
      </div>
    </section>
  );
}
