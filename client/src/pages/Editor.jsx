import { useState, useMemo, useEffect, useCallback, useRef } from "react";
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
import { defaultSettings, readSettings, zonesWithCustom } from "../utils/resumeSettings";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

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
  customSections: [],
});

const PAGE_H = 1160; // A4 近似页高(与 .canvas-paper min-height 一致)

/** 编辑器格式 → ATS 存储格式(导出 DOCX 与 persist 共用同一转换,保证一致) */
const toAtsData = (resume, templateId) => ({
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
  customSections: (resume.customSections || []).map((s) => ({
    id: s.id, title: s.title || '', body: s.body || '',
  })),
  selectedTemplate: templateId,
  settings: resume._settings || defaultSettings(),
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
  customSections: Array.isArray(resumeData.customSections)
    ? resumeData.customSections.map((s) => ({ id: s.id, title: s.title || '', body: s.body || '' }))
    : [],
};
  editor._settings = readSettings(resumeData);
  return editor;
};

export default function Editor() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // 当前模板:进入时由 URL 意图决定,切换后写入激活版本 selectedTemplate 并随 URL 同步。
  // (修复:模板原先只存在于 URL query,重进/切版本即回默认 professional)
  const [templateId, setTemplateId] = useState(() => {
    const urlTpl = searchParams.get('template');
    return TEMPLATES.some((t) => t.id === urlTpl) ? urlTpl : 'professional';
  });

  const [resume, setResume] = useState(blankResume());
  const [versions, setVersions] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const [busy, setBusy] = useState({}); // 忙碌键:summary | bullets:<i> | star:<i> | polish
  const markBusy = useCallback((key, on) => {
    setBusy((b) => ({ ...b, [key]: on }));
  }, []);
  const isBusy = (key) => !!busy[key];

  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [activeAI, setActiveAI] = useState(null);

  // 抽屉 tab 外部请求(顶部「简历美化」→ 切到模板 tab)
  const [drawerTabReq, setDrawerTabReq] = useState({ tab: "templates", tick: 0 });
  // 「AI 一键优化」点击后的引导脉冲(短暂高亮画布)
  const [aiPulseOn, setAiPulseOn] = useState(false);
  const pulseTimer = useRef(null);

  // ===== 字段级 AI 悬浮工具条 =====
  const wrapRef = useRef(null);
  const paperRef = useRef(null);
  const fieldElRef = useRef(null); // 当前聚焦的 [data-ai] DOM 节点(用于重定位)
  const [fieldAI, setFieldAI] = useState(null); // { top, left, ctx }
  const BAR_H = 40;
  const BAR_W = 380;
  const BAR_GAP = 8;

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
        // 模板:URL 意图(如从模板库进入)优先;否则回读激活版本保存的模板
        const urlTpl = searchParams.get('template');
        const savedTpl = active.data?.selectedTemplate || active.data?.settings?.template || '';
        const tpl = TEMPLATES.some((t) => t.id === urlTpl)
          ? urlTpl
          : TEMPLATES.some((t) => t.id === savedTpl) ? savedTpl : 'professional';
        setTemplateId(tpl);
        if (!urlTpl && tpl !== 'professional') {
          setSearchParams({ template: tpl }, { replace: true }); // 让 URL 与生效模板一致(刷新不丢)
        }
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

  /* 设置(模块可见/排序/排版)——存于 resume._settings,随简历一并持久化。
     typography/moduleVisible 做嵌套合并,避免快速连续点击时旧快照互相覆盖 */
  const updateSettings = (patch) => updateWithHistory((r) => {
    const cur = r._settings || defaultSettings();
    const next = { ...cur, ...patch };
    if (patch.typography) next.typography = { ...cur.typography, ...patch.typography };
    if (patch.moduleVisible) next.moduleVisible = { ...cur.moduleVisible, ...patch.moduleVisible };
    return { ...r, _settings: next };
  });
  const currentSettings = resume._settings || defaultSettings();
  // 模板栏分区:把自定义模块注入正文/主栏,参与与内置模块的顺序编排(键与 moduleOrder 一致)
  const customKeys = (resume.customSections || []).map((s) => `custom:${s.id}`);
  const previewZones = zonesWithCustom(templateId, customKeys);

  /* ===== 自定义模块(文本块型):键 custom:<id>,挂进全局 moduleOrder 尾端 ===== */
  const customKey = (id) => `custom:${id}`;
  const updateCustom = (id, field, value) => updateWithHistory((r) => ({
    ...r,
    customSections: (r.customSections || []).map((s) => (s.id === id ? { ...s, [field]: value } : s)),
  }));

  const addCustom = () => updateWithHistory((r) => {
    const cur = r._settings || defaultSettings();
    const id = `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const key = customKey(id);
    return {
      ...r,
      customSections: [...(r.customSections || []), { id, title: "自定义模块", body: "" }],
      _settings: {
        ...cur,
        moduleVisible: { ...cur.moduleVisible, [key]: true },
        moduleOrder: [...cur.moduleOrder, key],
      },
    };
  });

  const renameCustom = (id) => {
    const sec = (resume.customSections || []).find((s) => s.id === id);
    const name = window.prompt("修改模块标题（也可直接在画布上点击标题编辑）", sec?.title || "自定义模块");
    if (name === null) return;
    updateCustom(id, "title", name.trim() || "自定义模块");
  };

  const removeCustom = (id) => {
    if (!window.confirm("删除该自定义模块？其内容会一并移除。")) return;
    updateWithHistory((r) => {
      const cur = r._settings || defaultSettings();
      const key = customKey(id);
      const mv = { ...cur.moduleVisible };
      delete mv[key];
      return {
        ...r,
        customSections: (r.customSections || []).filter((s) => s.id !== id),
        _settings: { ...cur, moduleVisible: mv, moduleOrder: cur.moduleOrder.filter((k) => k !== key) },
      };
    });
  };

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
    if (isBusy("summary")) return;
    markBusy("summary", true);
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
      markBusy("summary", false);
    }
  };

  const generateBulletsForExp = async (expIndex) => {
    const exp = resume.experiences[expIndex];
    if (!exp.role || !exp.company) {
      setError("请先填写职位与公司");
      return;
    }
    const key = `bullets:${expIndex}`;
    if (isBusy(key)) return;
    markBusy(key, true);
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
      markBusy(key, false);
    }
  };

  const convertToSTAR = async (expIndex) => {
    const exp = resume.experiences[expIndex];
    const key = `star:${expIndex}`;
    if (isBusy(key)) return;
    markBusy(key, true);
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
      markBusy(key, false);
    }
  };

  // 悬浮工具条按钮点击分发
  const runFieldAI = async (action) => {
    const fa = fieldAI;
    if (!fa) return;
    const { ctx } = fa;
    try {
      if (action === "polish") {
        const el = fieldElRef.current;
        const text = (el?.textContent || "").trim();
        if (!text) {
          setError("这个字段还是空的,先写点内容再来润色吧。");
          return;
        }
        markBusy("polish", true);
        const startedAt = Date.now();
        track("ai_generate_click", { feature: "polish" });
        const kind = ctx.k === "bullet" ? "bullet" : ctx.f === "skills" ? "skills" : "summary";
        const response = await api.polishText({ text, kind });
        if (ctx.k === "field") updateField(ctx.f, response.polished);
        else if (ctx.k === "bullet") updateBullet(ctx.i, ctx.bi, response.polished);
        track("ai_generate_success", { feature: "polish", ms: Date.now() - startedAt });
      } else if (action === "gen_summary") {
        await generateSummary();
      } else if (action === "bullets") {
        await generateBulletsForExp(ctx.i);
      } else if (action === "star") {
        await convertToSTAR(ctx.i);
      }
    } catch (err) {
      track("ai_generate_fail", { feature: "polish", reason: String(err.message || err).slice(0, 120) });
      setError(`AI 处理失败: ${err.message}`);
    } finally {
      markBusy("polish", false);
    }
  };

  /* ===== 悬浮工具条:定位 ===== */
  const computeBarPos = (el, wrap) => {
    const r = el.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    // wrap 为滚动容器,用内容坐标保证滚动时工具条跟随字段
    const topRaw = r.top - wr.top + wrap.scrollTop;
    const leftRaw = r.left - wr.left + wrap.scrollLeft;
    const elH = r.height;
    let top = topRaw - BAR_H - BAR_GAP;
    let left = leftRaw + r.width / 2 - BAR_W / 2;
    // 视口内钳制
    const maxLeft = wr.width - BAR_W - 8;
    left = Math.max(8, Math.min(left, Math.max(8, maxLeft)));
    if (top < 6) top = topRaw + elH + BAR_GAP;
    return { top, left };
  };

  const openFieldAI = (el) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let ctx;
    try { ctx = JSON.parse(el.dataset.ai || "null"); } catch { ctx = null; }
    if (!ctx) return;
    fieldElRef.current = el;
    const pos = computeBarPos(el, wrap);
    setFieldAI({ ...pos, ctx });
  };

  // 画布滚动 / 窗口尺寸变化时重定位(避免工具条与字段脱节)
  const repositionFieldAI = useCallback(() => {
    const el = fieldElRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap || !document.contains(el)) return;
    setFieldAI((fa) => (fa ? { ...fa, ...computeBarPos(el, wrap) } : fa));
  }, [BAR_H, BAR_W, BAR_GAP]);

  useEffect(() => {
    if (!fieldAI) return;
    const onKey = (e) => { if (e.key === "Escape") { setFieldAI(null); fieldElRef.current?.blur?.(); } };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", repositionFieldAI);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", repositionFieldAI);
    };
  }, [fieldAI, repositionFieldAI]);

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

  /* ===== 长简历自动分页:连续流测量 → 估算页数 + 画分页线 ===== */
  const [pageCount, setPageCount] = useState(1);
  const [pageH, setPageH] = useState(PAGE_H);
  useEffect(() => {
    const paper = paperRef.current;
    if (!paper || !hydrated) { setPageCount(1); return; }
    const calc = () => {
      // 页高取实际渲染的 min-height(响应式下可能小于默认 A4 近似值)
      let ph = PAGE_H;
      try {
        const mh = parseFloat(window.getComputedStyle(paper).minHeight);
        if (Number.isFinite(mh) && mh > 0) ph = mh;
      } catch { /* keep default */ }
      setPageH((p) => (p === ph ? p : ph));
      const margin = currentSettings.typography.margin || 38;
      const h = paper.scrollHeight || 0;
      const overflow = h - ph;
      let next = 1;
      if (overflow > 0) {
        const per = ph - margin * 2;
        next = 1 + Math.ceil(overflow / Math.max(per, 200));
      }
      setPageCount((p) => (p === next ? p : next));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(paper);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, currentSettings.typography, templateId, hydrated]);

  /* Persist to localStorage(多版本:写当前激活版本 + 写穿 resumeData 兼容旧页面)
     守卫:hydrated 为 false 时绝不写入 */
  useEffect(() => {
    if (!hydrated) return;
    try {
      writeThrough(toAtsData(resume, templateId));
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
    // 模板跟随版本(每个版本保存各自 selectedTemplate)
    const tpl = TEMPLATES.some((t) => t.id === target.data?.selectedTemplate) ? target.data.selectedTemplate : 'professional';
    setTemplateId(tpl);
    if (searchParams.get('template') !== tpl) setSearchParams({ template: tpl }, { replace: true });
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
    const tpl = TEMPLATES.some((t) => t.id === target?.data?.selectedTemplate) ? target.data.selectedTemplate : 'professional';
    setTemplateId(tpl);
    if (searchParams.get('template') !== tpl) setSearchParams({ template: tpl }, { replace: true });
    refreshVersions();
    track("resume_version_delete", {});
  };

  /* ===== 模板切换 ===== */
  const handleSelectTemplate = (id) => {
    if (id === templateId) return;
    setTemplateId(id);
    setSearchParams({ template: id }, { replace: true });
    track("template_change", { template: id });
  };

  /* ===== AI 工具组行为(P1.3:与字段级悬浮工具条联动) ===== */
  const triggerAiPulse = () => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setAiPulseOn(true);
    pulseTimer.current = setTimeout(() => setAiPulseOn(false), 2600);
  };
  useEffect(() => () => { if (pulseTimer.current) clearTimeout(pulseTimer.current); }, []);

  const handleAI = (feature) => {
    switch (feature) {
      case "optimize":   // AI 一键优化 → 引导点击字段,触发悬浮工具条
        setError("💡 点击画布中想要打磨的字段(个人简介 / 经历要点 / 技能),该字段上方会弹出 AI 工具条,可一键润色、重写或转 STAR。");
        triggerAiPulse();
        break;
      case "beautify":    // 简历美化 → 直接打开右侧抽屉并切到「切换模板」
        setDrawerOpen(true);
        setDrawerTabReq((p) => ({ tab: "templates", tick: p.tick + 1 }));
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

  /* 悬浮工具条按钮集(按字段类型) */
  const aiActionsOf = (ctx) => {
    if (!ctx) return [];
    const i = ctx.i;
    const perExp = [
      { id: "bullets", label: "✨ 要点整段", title: "根据该段经历重新生成 3-5 条要点" },
      { id: "star", label: "⭐ STAR 整段", title: "把该段要点改写成 STAR 结构" },
    ];
    if (ctx.k === "field" && ctx.f === "summary") {
      return [
        { id: "gen_summary", label: "✨ 生成简介", title: "AI 按姓名/目标职位/技能生成一段新简介" },
        { id: "polish", label: "🪄 润色现有", title: "重写语言与结构,不新增事实" },
      ];
    }
    if (ctx.k === "field" && ctx.f === "skills") {
      return [{ id: "polish", label: "🪄 智能整理", title: "统一分隔、去重、按相关度排序,不新增技能" }];
    }
    if (ctx.k === "bullet") {
      return [
        { id: "polish", label: "🪄 润色本句", title: "只改语言与结构,保留数字与事实" },
        ...perExp,
      ];
    }
    if (ctx.k === "exp") return perExp;
    return [];
  };
  const aiBusyKeyOf = (ctx, id) => {
    if (id === "gen_summary") return "summary";
    if (id === "polish") return "polish";
    if (id === "bullets") return `bullets:${ctx?.i}`;
    if (id === "star") return `star:${ctx?.i}`;
    return null;
  };

  /* ===== 画布焦点 → 字段级悬浮工具条 ===== */
  const handlePaperFocus = (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('[data-ai]')) openFieldAI(t.closest('[data-ai]'));
  };
  const handlePaperBlur = () => setFieldAI(null);

  const [exportBusy, setExportBusy] = useState(""); // '' | 'pdf' | 'docx' | 'txt'

  /** 就地导出:PDF 截当前画布 / Word 走后端(带 settings) / 纯文本手拼 */
  const exportResume = async (format) => {
    const baseName = (resume.name || "").trim() || "简历";
    const fileBase = baseName.replace(/\s+/g, "_");

    if (format === "pdf") {
      const el = paperRef.current;
      if (!el) {
        setError("画布还没准备好,请稍后再试");
        return;
      }
      setExportBusy("pdf");
      try {
        const startedAt = Date.now();
        const canvas = await html2canvas(el, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
        });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF("p", "mm", "a4");
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const imgH = (canvas.height * pw) / canvas.width;
        let pos = 0;
        let left = imgH;
        pdf.addImage(imgData, "PNG", 0, pos, pw, imgH);
        left -= ph;
        while (left > 0) {
          pos -= ph;
          pdf.addPage();
          pdf.addImage(imgData, "PNG", 0, pos, pw, imgH);
          left -= ph;
        }
        pdf.save(`${fileBase}_简历.pdf`);
        track("pdf_export", { status: "success", ms: Date.now() - startedAt, from: "editor" });
      } catch (err) {
        track("pdf_export", { status: "fail", reason: String(err.message || err).slice(0, 120), from: "editor" });
        setError(`PDF 导出失败: ${err.message || err}`);
      } finally {
        setExportBusy("");
      }
      return;
    }

    if (format === "docx") {
      setExportBusy("docx");
      try {
        const startedAt = Date.now();
        await api.downloadDOCX({ resumeData: toAtsData(resume, templateId) });
        track("docx_export", { status: "success", ms: Date.now() - startedAt, from: "editor" });
      } catch (err) {
        track("docx_export", { status: "fail", reason: String(err.message || err).slice(0, 120), from: "editor" });
        setError(`Word 导出失败: ${err.message || err}`);
      } finally {
        setExportBusy("");
      }
      return;
    }

    if (format === "txt") {
      try {
        const lines = [];
        if (resume.name) lines.push(resume.name);
        if (resume.title) lines.push(resume.title);
        const contacts = [resume.email, resume.phone, resume.location, resume.linkedin].filter(Boolean);
        if (contacts.length) lines.push(contacts.join(" | "));
        lines.push("=".repeat(50));
        if (resume.summary) lines.push("个人简介", resume.summary, "");
        const skillList = resume.skills.split(",").map((s) => s.trim()).filter(Boolean);
        if (skillList.length) lines.push("技能: " + skillList.join(", "), "");
        if (resume.experiences.some((e) => e.company || e.role || e.bullets.some((b) => b.trim()))) {
          lines.push("工作/项目经历");
          resume.experiences.forEach((exp) => {
            const head = [exp.role, exp.company, exp.duration].filter(Boolean).join(" — ");
            if (head) lines.push(head);
            exp.bullets.filter((b) => b.trim()).forEach((b) => lines.push(`  • ${b}`));
            lines.push("");
          });
        }
        const edu = resume.education.filter((e) => e.school || e.degree);
        if (edu.length) {
          lines.push("教育背景");
          edu.forEach((e) => lines.push(`  • ${[e.school, e.degree, e.field, e.graduationYear].filter(Boolean).join(" · ")}`));
        }
        const customs = (resume.customSections || []).filter((s) => s.title || s.body);
        customs.forEach((s) => {
          lines.push(s.title || "自定义模块");
          if (s.body) lines.push(s.body);
          lines.push("");
        });
        const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fileBase}_简历.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        track("txt_export", { status: "success", from: "editor" });
      } catch (err) {
        track("txt_export", { status: "fail", reason: String(err.message || err).slice(0, 120), from: "editor" });
        setError(`纯文本导出失败: ${err.message || err}`);
      } finally {
        setExportBusy("");
      }
    }
  };

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
        onExport={exportResume}
        exportBusy={exportBusy}
        onToggleDrawer={handleToggleDrawer}
        drawerOpen={drawerOpen}
        undoCount={undoCount}
        redoCount={redoCount}
        onUndo={undo}
        onRedo={redo}
      />

      <div className={`editor-stage${drawerOpen ? " drawer-open" : ""}`}>
        <div
          className="editor-canvas-wrap"
          ref={wrapRef}
          onScroll={fieldAI ? repositionFieldAI : undefined}
        >
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

          {/* 画布:页码/工具 + 白纸(可分页)+ 字段级 AI 悬浮工具条 */}
          <div className="editor-canvas">
            <div className="canvas-pages">
              <div className="canvas-page-indicator">
                <span className="active">1</span>
                <span className="total">/{pageCount}</span>
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
                  disabled={isBusy("summary")}
                  title="AI 生成个人简介"
                >
                  {isBusy("summary") ? "生成中..." : "✨ AI 简介"}
                </button>
              </div>
            </div>

            <div className="canvas-sheet-area">
              <div
                ref={paperRef}
                className={`canvas-paper${aiPulseOn ? " ai-pulse" : ""}`}
                data-align={currentSettings.typography.align}
                onFocusCapture={handlePaperFocus}
                onBlurCapture={handlePaperBlur}
                style={{
                  padding: currentSettings.typography.margin,
                  fontSize: currentSettings.typography.fontSize,
                  lineHeight: currentSettings.typography.lineHeight,
                  // 排版 CSS 变量:正文 p/li 跟随,模板内部固定 px 由 CSS !important 覆盖
                  "--res-fs": `${currentSettings.typography.fontSize}px`,
                  "--res-lh": currentSettings.typography.lineHeight,
                }}
              >
                <PreviewComponent
                  resume={resume}
                  settings={currentSettings}
                  zones={previewZones}
                  onUpdateField={updateField}
                  onUpdateExperience={updateExperience}
                  onUpdateBullet={updateBullet}
                  onUpdateEducation={updateEducation}
                  onUpdateCustom={updateCustom}
                />

                {/* 长简历分页线(连续流预览,与 Word 分页语义一致) */}
                {pageCount > 1 && Array.from({ length: pageCount - 1 }, (_, k) => (
                  <div
                    key={k}
                    className="page-rule"
                    aria-hidden="true"
                    style={{ top: (k + 1) * pageH, left: currentSettings.typography.margin, right: currentSettings.typography.margin }}
                  >
                    <span className="page-rule-chip">第 {k + 2} 页</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 字段级 AI 悬浮工具条 */}
            {fieldAI && (
              <div
                className="field-ai-bar"
                role="toolbar"
                aria-label="字段级 AI 工具"
                style={{ top: fieldAI.top, left: fieldAI.left }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <span className="field-ai-badge" aria-hidden="true">✨</span>
                <div className="field-ai-btns">
                  {aiActionsOf(fieldAI.ctx).map((a) => {
                    const busyKey = aiBusyKeyOf(fieldAI.ctx, a.id);
                    const running = !!busyKey && isBusy(busyKey);
                    const anyBusy = Object.keys(busy).some((k) => busy[k]);
                    return (
                      <button
                        key={a.id}
                        className="field-ai-btn"
                        title={a.title}
                        disabled={anyBusy}
                        onClick={() => runFieldAI(a.id)}
                      >
                        {running ? "⏳ 处理中…" : a.label}
                      </button>
                    );
                  })}
                </div>
                <button className="field-ai-close" onClick={() => setFieldAI(null)} aria-label="关闭 AI 工具条">×</button>
              </div>
            )}
          </div>
        </div>

        <EditorDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          templates={TEMPLATES}
          currentTemplateId={templateId}
          onSelectTemplate={handleSelectTemplate}
          settings={currentSettings}
          zones={previewZones}
          onSettingsChange={updateSettings}
          requestedTab={drawerTabReq.tab}
          tabRequestTick={drawerTabReq.tick}
          customSections={resume.customSections || []}
          onAddCustom={addCustom}
          onRenameCustom={renameCustom}
          onRemoveCustom={removeCustom}
        />
      </div>
    </section>
  );
}