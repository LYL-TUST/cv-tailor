import { useState, useMemo, useEffect, useCallback } from "react";
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

import EditorTopbar from "../components/editor/EditorTopbar";
import EditorDrawer from "../components/editor/EditorDrawer";
import { defaultSettings, readSettings, ORDER_SUPPORTED_TEMPLATES } from "../utils/resumeSettings";

/** 模板元数据 —— 与右侧抽屉的"切换模板"tab 共享 */
const TEMPLATES = [
  { id: "professional", name: "商务双栏", description: "双栏布局,侧边栏放联系方式", previewImage: "/template-professional.png" },
  { id: "classy",       name: "经典居中", description: "传统居中版式,蓝色分区标题",   previewImage: "/template-classy.png" },
  { id: "simple",       name: "极简单栏", description: "简约单栏布局,排版清晰易读",     previewImage: "/template-simple.png" },
  { id: "stylish",      name: "优雅深蓝", description: "深蓝页眉搭配金色点缀",          previewImage: "/template-stylish.png" },
];

const blankResume = () => ({
  photo: "",
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
const atsToEditor = (resumeData) => {
  const editor = {
    photo: resumeData.personalInfo?.photo || resumeData.photo || "",
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
  };
  editor._settings = readSettings(resumeData);
  return editor;
};

export default function Editor() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [activeAI, setActiveAI] = useState(null);

  // 防竞态守卫(必须是 state 而非 ref):
  // hydrated 为 false 期间自动保存绝不写入,防止空白简历覆盖刚导入的数据。
  const [hydrated, setHydrated] = useState(false);

  // ===== 撤销/重做(简化:每次 setResume 自动 push 快照;P1.3 强化 history 栈) =====
  const [history, setHistory] = useState([]);
  const [historyCursor, setHistoryCursor] = useState(-1);

  // Load saved resume (multi-version aware) on mount
  useEffect(() => {
    try {
      const list = listVersions();
      setVersions(list);
      const active = getActiveVersion();
      if (active) {
        setActiveId(active.id);
        if (active.data && !active.data.empty) {
          const restored = atsToEditor(active.data);
          setResume(restored);
          setHistory([restored]);
          setHistoryCursor(0);
        }
      }
    } catch (err) {
      console.error('读取已保存的简历失败:', err);
    } finally {
      setHydrated(true);
    }
  }, []);

  // ===== 数据变更时 push 快照到 history(去重:跳过相邻相同) =====
  const updateWithHistory = useCallback((mutator) => {
    setResume((prev) => {
      const next = mutator(prev);
      setHistory((h) => {
        if (h.length > 0 && JSON.stringify(h[h.length - 1]) === JSON.stringify(next)) return h;
        const trimmed = h.slice(0, historyCursor + 1);
        const newH = [...trimmed, next].slice(-50); // 50 条循环
        // 让 historyCursor 同步生效
        setHistoryCursor(newH.length - 1);
        return newH;
      });
      return next;
    });
  }, [historyCursor]);

  const undo = () => {
    if (historyCursor <= 0) return;
    const next = historyCursor - 1;
    setResume(history[next]);
    setHistoryCursor(next);
  };
  const redo = () => {
    if (historyCursor >= history.length - 1) return;
    const next = historyCursor + 1;
    setResume(history[next]);
    setHistoryCursor(next);
  };

  /* Helpers */
  const updateField = (field, value) => updateWithHistory((r) => ({ ...r, [field]: value }));

  const updateExperience = (i, field, value) => updateWithHistory((r) => {
    const exps = [...r.experiences];
    exps[i] = { ...exps[i], [field]: value };
    return { ...r, experiences: exps };
  });

  const updateBullet = (ei, bi, value) => updateWithHistory((r) => {
    const exps = [...r.experiences];
    const bullets = [...exps[ei].bullets];
    bullets[bi] = value;
    exps[ei] = { ...exps[ei], bullets };
    return { ...r, experiences: exps };
  });

  const addBullet = (ei) => updateWithHistory((r) => {
    const exps = [...r.experiences];
    exps[ei] = { ...exps[ei], bullets: [...exps[ei].bullets, ""] };
    return { ...r, experiences: exps };
  });

  const removeBullet = (ei, bi) => updateWithHistory((r) => {
    const exps = [...r.experiences];
    const bullets = exps[ei].bullets.filter((_, idx) => idx !== bi);
    exps[ei] = { ...exps[ei], bullets: bullets.length ? bullets : [""] };
    return { ...r, experiences: exps };
  });

  /* 设置(模块可见/排序/排版)——存于 resume._settings,随简历一并持久化 */
  const updateSettings = (patch) => updateWithHistory((r) => ({
    ...r,
    _settings: { ...(r._settings || defaultSettings()), ...patch },
  }));
  const currentSettings = resume._settings || defaultSettings();

  const addExperience = () => updateWithHistory((r) => ({
    ...r,
    experiences: [...r.experiences, { company: "", role: "", duration: "", bullets: [""] }],
  }));

  const removeExperience = (i) => updateWithHistory((r) => {
    if (r.experiences.length <= 1) return r;
    return { ...r, experiences: r.experiences.filter((_, idx) => idx !== i) };
  });

  const updateEducation = (i, field, value) => updateWithHistory((r) => {
    const edu = [...r.education];
    edu[i] = { ...edu[i], [field]: value };
    return { ...r, education: edu };
  });

  const addEducation = () => updateWithHistory((r) => ({
    ...r,
    education: [...r.education, { school: "", degree: "", field: "", graduationYear: "" }],
  }));

  const removeEducation = (i) => updateWithHistory((r) => {
    if (r.education.length <= 1) return r;
    return { ...r, education: r.education.filter((_, idx) => idx !== i) };
  });

  /* AI Functions */
  const generateSummary = async () => {
    setLoadingStates((s) => ({ ...s, summary: true }));
    setError(null);
    try {
      const startedAt = Date.now();
      track("ai_generate_click", { feature: "summary" });
      const response = await api.generateSummary({
        fullName: resume.name,
        title: resume.title,
        skills: resume.skills.split(',').map((s) => s.trim()).filter(Boolean),
        tone: 'professional',
      });
      updateField("summary", response.summary);
      track("ai_generate_success", { feature: "summary", ms: Date.now() - startedAt });
    } catch (err) {
      track("ai_generate_fail", { feature: "summary", reason: String(err.message || err).slice(0, 120) });
      setError(`生成个人简介失败: ${err.message}`);
    } finally {
      setLoadingStates((s) => ({ ...s, summary: false }));
    }
  };

  const generateBulletsForExp = async (expIndex) => {
    const exp = resume.experiences[expIndex];
    if (!exp.role || !exp.company) {
      setError("请先填写职位与公司");
      return;
    }
    setLoadingStates((s) => ({ ...s, bullets: { ...s.bullets, [expIndex]: true } }));
    setError(null);
    try {
      const startedAt = Date.now();
      track("ai_generate_click", { feature: "bullets" });
      const response = await api.generateBullets({
        jobTitle: exp.role,
        company: exp.company,
        responsibilities: exp.bullets.filter((b) => b.trim()).join('. ') || 'General responsibilities',
        tone: 'professional',
      });
      updateWithHistory((r) => {
        const exps = [...r.experiences];
        exps[expIndex] = { ...exps[expIndex], bullets: response.bullets };
        return { ...r, experiences: exps };
      });
      track("ai_generate_success", { feature: "bullets", ms: Date.now() - startedAt });
    } catch (err) {
      track("ai_generate_fail", { feature: "bullets", reason: String(err.message || err).slice(0, 120) });
      setError(`生成经历要点失败: ${err.message}`);
    } finally {
      setLoadingStates((s) => ({ ...s, bullets: { ...s.bullets, [expIndex]: false } }));
    }
  };

  const convertToSTAR = async (expIndex) => {
    const exp = resume.experiences[expIndex];
    setLoadingStates((s) => ({ ...s, star: { ...s.star, [expIndex]: true } }));
    setError(null);
    try {
      const startedAt = Date.now();
      track("ai_generate_click", { feature: "star" });
      const response = await api.convertToStar({
        experience: `${exp.role} at ${exp.company}`,
        bullets: exp.bullets.filter((b) => b.trim()),
      });
      updateWithHistory((r) => {
        const exps = [...r.experiences];
        exps[expIndex] = { ...exps[expIndex], bullets: response.starBullets };
        return { ...r, experiences: exps };
      });
      track("ai_generate_success", { feature: "star", ms: Date.now() - startedAt });
    } catch (err) {
      track("ai_generate_fail", { feature: "star", reason: String(err.message || err).slice(0, 120) });
      setError(`STAR 格式转换失败: ${err.message}`);
    } finally {
      setLoadingStates((s) => ({ ...s, star: { ...s.star, [expIndex]: false } }));
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

  /* Persist to localStorage(多版本:写当前激活版本 + 写穿 resumeData 兼容旧页面)
     守卫:hydrated 为 false 时绝不写入 */
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
          photo: resume.photo || "",
        },
        summary: resume.summary,
        skills: resume.skills.split(',').map((s) => s.trim()).filter(Boolean),
        experience: resume.experiences.map((exp) => ({
          company: exp.company,
          position: exp.role,
          duration: exp.duration,
          bullets: exp.bullets.filter((b) => b.trim()),
        })),
        education: resume.education,
        selectedTemplate: templateId,
        settings: resume._settings || defaultSettings(),
      };
      writeThrough(resumeDataForATS);
    } catch (err) {
      console.error('保存简历数据失败:', err);
    }
  }, [hydrated, resume, templateId, activeId]);

  /* ===== 多版本管理 ===== */
  const refreshVersions = () => setVersions(listVersions());

  const handleCreateVersion = () => {
    const name = window.prompt('新简历版本名称(如:字节跳动-产品岗)', '未命名简历');
    if (name === null) return;
    const v = createVersion(name.trim() || '未命名简历');
    setActiveId(v.id);
    const blank = blankResume();
    setResume(blank);
    setHistory([blank]);
    setHistoryCursor(0);
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
    const restored = target.data && !target.data.empty ? atsToEditor(target.data) : blankResume();
    setResume(restored);
    setHistory([restored]);
    setHistoryCursor(0);
    track("resume_version_switch", { from: activeId, to: id });
  };

  const handleRenameVersion = () => {
    if (!activeId) return;
    const current = versions.find((v) => v.id === activeId);
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
    const current = versions.find((v) => v.id === activeId);
    if (!window.confirm(`确定删除版本「${current?.name}」?此操作不可恢复。`)) return;
    const { active } = deleteVersion(activeId);
    setActiveId(active);
    const target = versions.find((v) => v.id === active);
    const restored = target?.data && !target.data.empty ? atsToEditor(target.data) : blankResume();
    setResume(restored);
    setHistory([restored]);
    setHistoryCursor(0);
    refreshVersions();
    track("resume_version_delete", {});
  };

  /* ===== 模板切换 ===== */
  const handleSelectTemplate = (id) => {
    if (id === templateId) return;
    setSearchParams({ template: id }, { replace: true });
    track("template_change", { template: id });
  };

  /* ===== AI 工具组行为(P1.1:快捷入口;P1.2 字段级 AI 悬浮工具条强化) ===== */
  const handleAI = (feature) => {
    switch (feature) {
      case "optimize":   // AI 一键优化 → 弹 modal 选目标字段(本轮先弹提示)
        setError("💡 AI 一键优化:请把光标放到画布的某个字段上,点悬浮工具条中的 AI 按钮针对该字段优化。");
        break;
      case "beautify":    // 简历美化 → 切换主题/模板提示
        setError("💡 简历美化:在右侧抽屉切换模板,或到「模板主题」页调整主色调与字体。");
        break;
      case "analyze":    // 智能分析 → 跳 JD 诊断
        navigate("/ats");
        break;
      case "interview":  // AI 面试官 → 跳模拟面试
        navigate("/interview");
        break;
      default:
        break;
    }
  };

  const handleDownload = () => navigate("/download");

  const handleToggleDrawer = () => setDrawerOpen((v) => !v);

  // Select preview component based on template
  const PreviewComponent = {
    professional: ProfessionalPreview,
    classy: ClassyPreview,
    simple: SimplePreview,
    stylish: StylishPreview,
  }[templateId] || ProfessionalPreview;

  const undoCount = historyCursor;                    // 可撤销次数
  const redoCount = history.length - 1 - historyCursor; // 可重做次数

  return (
    <section className="editor-shell">
      <EditorTopbar
        versions={versions}
        activeId={activeId}
        onSwitchVersion={handleSwitchVersion}
        onCreateVersion={handleCreateVersion}
        onDuplicateVersion={handleDuplicateVersion}
        onRenameVersion={handleRenameVersion}
        onDeleteVersion={handleDeleteVersion}
        activeAI={activeAI}
        onAISelect={setActiveAI}
        onAI={handleAI}
        onDownload={handleDownload}
        onToggleDrawer={handleToggleDrawer}
        drawerOpen={drawerOpen}
        undoCount={undoCount}
        redoCount={redoCount}
        onUndo={undo}
        onRedo={redo}
      />

      <div className={`editor-stage${drawerOpen ? " drawer-open" : ""}`}>
        <div className="editor-canvas-wrap">
          {error && (
            <div className="editor-canvas-banner notice notice-warn">
              {error}
              <button className="banner-close" onClick={() => setError(null)} aria-label="关闭">×</button>
            </div>
          )}

          {/* 完成度 */}
          <div className="editor-progress">
            <div className="editor-progress-bar" style={{ width: `${progress}%` }} />
            <span className="editor-progress-text">{progress}% 已完成</span>
          </div>

          {/* 画布:左页码 + 中白纸 + 右工具条(添加/AI 字段级操作) */}
          <div className="editor-canvas">
            <div className="canvas-pages">
              <div className="canvas-page-indicator">
                <span className="active">1</span>
                <span className="total">/1</span>
              </div>
              <div className="canvas-page-tools">
                <button
                  className="canvas-page-tool"
                  onClick={addExperience}
                  title="添加工作经历"
                >＋ 经历</button>
                <button
                  className="canvas-page-tool"
                  onClick={addEducation}
                  title="添加教育背景"
                >＋ 教育</button>
                <button
                  className="canvas-page-tool canvas-page-tool-ai"
                  onClick={generateSummary}
                  disabled={loadingStates.summary}
                  title="AI 生成个人简介"
                >
                  {loadingStates.summary ? "生成中..." : "✨ AI 简介"}
                </button>
              </div>
            </div>

            <div
              className="canvas-paper"
              style={{
                padding: currentSettings.typography.margin,
                fontSize: currentSettings.typography.fontSize,
                lineHeight: currentSettings.typography.lineHeight,
                textAlign: currentSettings.typography.align,
              }}
            >
              <PreviewComponent
                resume={resume}
                settings={currentSettings}
                onUpdateField={updateField}
                onUpdateExperience={updateExperience}
                onUpdateBullet={updateBullet}
                onUpdateEducation={updateEducation}
              />
            </div>

            {/* AI 操作面板(字段级 AI 入口 —— 本轮保留,后续加悬浮工具条) */}
            <div className="canvas-ai-panel">
              <h4>字段级 AI</h4>
              <p className="canvas-ai-hint">
                点击工作经历条目右侧的 AI 按钮,可针对该段经历生成要点 / 转 STAR。
              </p>
              <div className="canvas-ai-exp-list">
                {resume.experiences.map((exp, i) => (
                  (exp.company || exp.role) && (
                    <div key={i} className="canvas-ai-exp">
                      <span className="canvas-ai-exp-name">
                        {exp.role || "新职位"} · {exp.company || "新公司"}
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => generateBulletsForExp(i)}
                        disabled={loadingStates.bullets[i]}
                      >
                        {loadingStates.bullets[i] ? "生成中..." : "✨ 要点"}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => convertToSTAR(i)}
                        disabled={loadingStates.star[i]}
                      >
                        {loadingStates.star[i] ? "转换中..." : "⭐ STAR"}
                      </button>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        </div>

        <EditorDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          templates={TEMPLATES}
          currentTemplateId={templateId}
          onSelectTemplate={handleSelectTemplate}
          settings={currentSettings}
          orderSupported={ORDER_SUPPORTED_TEMPLATES.has(templateId)}
          onSettingsChange={updateSettings}
        />
      </div>
    </section>
  );
}