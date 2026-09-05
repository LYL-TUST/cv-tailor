import PageHead from "../components/PageHead";
import ResumePicker from "../components/ResumePicker";
import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "react-router-dom";
import * as api from "../utils/api";
import { track } from "../utils/analytics";
import { saveInterviewSession } from "../utils/historyStore";
import { getActiveVersion } from "../utils/resumeStore";
import { briefOfVersion, isEmptyResumeData } from "../utils/resumeContext";
import { loadDraft, saveDraft, clearDraft } from "../utils/draftStore";
import { isFavorite, addFavorite, removeFavorite, listFolderNames, DEFAULT_FOLDER } from "../utils/favoritesStore";
import { useVoiceInput } from "../utils/useVoiceInput";
import { useTTS } from "../utils/useTTS";

/**
 * 模拟面试 —— 面试官资料包
 *
 * 核心模型：面试官"掌握了哪些资料"决定他怎么问。
 * - 盲面：只知道职位名 → 通用能力题
 * - JD 定向面：职位名 + JD → 按 JD 职责/要求定制题目
 * - 简历深挖面：职位名 + 简历 → 面试官逐条盘问你的真实经历（最易被问穿的演练）
 * - 全面定制面：JD + 简历都参考 → 按 JD 能力点提问并要求以自身经历作答
 * 用户可先用预设卡快速选择，再手动微调两个资料开关。
 */

const PRESETS = [
  { id: 'blind', name: '盲面', desc: '只按职位名出通用题', icon: '🎧', jd: false, resume: false, type: 'mixed' },
  { id: 'jd',    name: 'JD 定向面', desc: '紧扣职位描述的要求', icon: '📋', jd: true, resume: false, type: 'mixed' },
  { id: 'drill', name: '简历深挖面', desc: '逐条盘问你的经历',   icon: '🧠', jd: false, resume: true,  type: 'resume-drill' },
  { id: 'full',  name: '全面定制面', desc: 'JD + 简历全参考',    icon: '🎯', jd: true, resume: true,  type: 'mixed' },
];

const TYPE_OPTIONS = [
  { value: 'mixed',         label: '混合（行为面 + 技术面）' },
  { value: 'behavioral',    label: '仅行为面' },
  { value: 'technical',     label: '仅技术面' },
  { value: 'resume-drill',  label: '🧠 简历深挖（面试官盘问你的经历）' },
];

const COUNT_OPTIONS = [3, 5, 8, 10];

const DIFF_OPTIONS = [
  { value: 'progressive', label: '循序渐进（由易到难）' },
  { value: 'easy',        label: '简单' },
  { value: 'medium',      label: '中等' },
  { value: 'hard',        label: '困难' },
];

const DIFF_META = {
  easy:   { label: '简单', cls: 'green' },
  medium: { label: '中等', cls: 'amber' },
  hard:   { label: '困难', cls: 'red' },
};
const DIFF_ORDER = { easy: 0, medium: 1, hard: 2 };

/** 每题作答限时档位(秒);0 = 不限时(默认)。P2 限时作答 */
const TIME_LIMIT_OPTIONS = [0, 60, 90, 120];
const TIME_LIMIT_LABEL = (s) => (s === 0 ? '不限时' : `${s} 秒 / 题`);

/** 面试官风格(面试官资料包第四维度):影响语气/提问锋芒/追问方式,不影响评分标准 */
const STYLE_OPTIONS = [
  { value: 'standard', label: '🏢 大厂标准型（专业规范）' },
  { value: 'friendly', label: '🤝 温和引导型（先肯定再引导）' },
  { value: 'pressure', label: '🔥 压力追问型（持续深挖质疑）' },
];
const STYLE_META = {
  standard: { label: '大厂标准', fg: '#1e40af', bg: '#dbeafe' },
  friendly: { label: '温和引导', fg: '#15803d', bg: '#dcfce7' },
  pressure: { label: '压力追问', fg: '#b91c1c', bg: '#fee2e2' },
};

/** 回答-简历对照的矛盾点类型 → 展示标签 */
const CONS_KIND = {
  not_in_resume: { label: '简历没有', fg: '#b45309', bg: '#fef3c7' },
  unclear:       { label: '说不清',   fg: '#7c2d12', bg: '#ffedd5' },
  conflict:      { label: '明显矛盾', fg: '#b91c1c', bg: '#fee2e2' },
};
const CONS_VERDICT = {
  consistent: { icon: '✅', text: '与简历基本一致' },
  minor:      { icon: '🟡', text: '发现小疑点' },
  concern:    { icon: '🔴', text: '需要认真对待' },
};

const WEAK_SCORE = 6; // 低于此分视为弱题(整场复盘「建议再练」)

/**
 * 整场复盘的本地统计(纯前端算术;追问命中率/角度分布是核心增量,LLM 只负责跨题归纳)
 * 判定弱题:低分 / 超时 / 被追问但未回应 —— 三者都是「经不起追问」的信号
 */
function buildSessionStats(records) {
  const list = Array.isArray(records) ? records : [];
  const scored = list.filter((r) => typeof r.score === 'number');
  const avg = scored.length
    ? Math.round((scored.reduce((s, r) => s + r.score, 0) / scored.length) * 10) / 10
    : null;
  const followUps = list.filter((r) => r.followUp && r.followUp.question);
  const responded = followUps.filter((r) => (r.followUp.answer || '').trim());

  // 追问角度分布:面试官最常从哪些角度"问穿"你
  const angleMap = new Map();
  followUps.forEach((r) => {
    const key = r.followUp.angle || '其他';
    angleMap.set(key, (angleMap.get(key) || 0) + 1);
  });
  const angleCounts = [...angleMap.entries()]
    .map(([angle, count]) => ({ angle, count }))
    .sort((a, b) => b.count - a.count);

  const perQuestion = list.map((r, i) => ({
    no: i + 1,
    score: typeof r.score === 'number' ? r.score : null,
    category: r.category || '',
    flagged: (typeof r.score === 'number' && r.score < WEAK_SCORE)
      || Boolean(r.timeUp)
      || Boolean(r.followUp && r.followUp.question && !(r.followUp.answer || '').trim()),
  }));

  return {
    answered: list.length,
    avg,
    timedOut: list.filter((r) => r.timeUp).length,
    followUpCount: followUps.length,
    followUpResponded: responded.length,
    angleCounts,
    perQuestion,
    weakQuestions: list.filter((_, i) => perQuestion[i].flagged),
  };
}

/** 难度归一化(模型可能返回 Easy/Medium 大小写不一) */
const normDiff = (d) => String(d || '').toLowerCase();

/** progressive 模式:整组按难度 easy→medium→hard 排序,未知难度(旧数据)排最后并保持原序 */
function sortByDifficulty(list) {
  const w = (q) => (DIFF_ORDER[normDiff(q?.difficulty)] ?? 9);
  return [...(list || [])].sort((a, b) => w(a) - w(b));
}

/** 由资料包开关推导 context 标识（埋点/历史用） */
function modeOf({ withJd, withResume, type }) {
  const resume = withResume || type === 'resume-drill';
  if (type === 'resume-drill') return resume ? 'title+jd+resume' : 'title+resume';
  if (withJd && resume) return 'title+jd+resume';
  if (withJd) return 'title+jd';
  if (resume) return 'title+resume';
  return 'title';
}

export default function Interview() {
  const location = useLocation();
  const [jobTitle, setJobTitle] = useState("");
  const [withJd, setWithJd] = useState(false);
  const [jd, setJd] = useState("");
  const [withResume, setWithResume] = useState(false);
  const [resumeVersion, setResumeVersion] = useState(null);
  const [interviewType, setInterviewType] = useState("mixed");
  const [questionCount, setQuestionCount] = useState(5);
  const [difficultyMode, setDifficultyMode] = useState("progressive");
  const [interviewerStyle, setInterviewerStyle] = useState("standard"); // 面试官风格档位
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sessionRecords, setSessionRecords] = useState([]); // 本次练习已完成的 Q&A
  const [sessionSaved, setSessionSaved] = useState(false);
  const [ctxBadge, setCtxBadge] = useState(null); // 生成成功后展示“面试官已读”快照
  const [revealedRef, setRevealedRef] = useState(false); // 当前题是否展开「参考思路」
  const [favSet, setFavSet] = useState(new Set()); // 已收藏的题目原文集合
  const ctxRef = useRef(null); // 出题时上下文快照，评估环节继续使用
  const [restoredTip, setRestoredTip] = useState(false); // 恢复草稿后的一次性提示

  // ===== 能力画像 → 弱项针对性再练:非空时 /generate 只围绕这些维度定向出题 =====
  const [focusCategories, setFocusCategories] = useState(null); // string[] | null

  // ===== 双态布局:设置区展开/收起(练习中默认收起为摘要条) =====
  const [setupOpen, setSetupOpen] = useState(true);
  // ===== 评估卡 Tab 化:feedback | consistency | followup | reference =====
  const [evalTab, setEvalTab] = useState("feedback");

  // ===== P2 真人面试循环:限时 / TTS 读题 / 追问 =====
  const [timeLimitSec, setTimeLimitSec] = useState(0); // 每题限时(0=不限时,默认关)
  const [timeLeft, setTimeLeft] = useState(null); // 当前题剩余秒数(null=未启动)
  const [timeUp, setTimeUp] = useState(false); // 本题是否已超时(记录到 sessionRecord)
  const [firstAnswerSubmitted, setFirstAnswerSubmitted] = useState(false); // 首答是否已交给面试官(停表/进入追问)
  const [followUp, setFollowUp] = useState(null); // 当前题的面试官追问 { question, angle }
  const [followUpAnswer, setFollowUpAnswer] = useState(""); // 追问补答
  const [followUpLoading, setFollowUpLoading] = useState(false); // 追问生成中
  const timeUpRef = useRef(false); // 评估落库时读(避免闭包陈旧)

  // ===== 整场复盘报告(本地统计 + LLM 跨题归纳) =====
  const [report, setReport] = useState(null); // { stats, llm }
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);

  // ===== 回答-简历矛盾点对照(真实性护栏结构化升级,按需触发) =====
  const [consistency, setConsistency] = useState(null); // { verdict, summary, items }
  const [consistencyLoading, setConsistencyLoading] = useState(false);

  /** 面试官语音(P2):读题/念追问,浏览器本地合成 */
  const tts = useTTS({ lang: "zh-CN" });
  /** 语音作答目标:首答 or 追问补答(同一套识别实例,按阶段切换填入目标) */
  const voiceTargetRef = useRef("first");

  /** 语音作答(P1)：口述 → 实时转写 → 可编辑填入回答框；浏览器本地识别，不保存录音
   *  P2 扩展:同一识别实例按 voiceTargetRef 分流填入首答或追问补答 */
  const voiceFillRef = useRef(""); // 最近一次语音填入的原文，评估时比对是否被编辑（转写编辑率指标）
  const voice = useVoiceInput({
    lang: "zh-CN",
    onFinal: (text) => {
      voiceFillRef.current = text; // 编辑率基线（语音识别结果允许用户修改后评估）
      if (voiceTargetRef.current === "followup") {
        setFollowUpAnswer(text);
        track("interview_voice_fill", { chars: text.length, target: "followup" });
      } else {
        setUserAnswer(text);
        track("interview_voice_fill", { chars: text.length, target: "first" });
      }
    },
  });

  // 识别出错埋点（no-speech/network/not-allowed 等，指导 ASR 可用性优化）
  useEffect(() => {
    if (voice.error) track("interview_voice_error", { code: voice.error.code });
  }, [voice.error]);

  // 限时回调里用 ref 读取最新 voice 实例(避免闭包陈旧)
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  // 切题/换会话时若正在聆听则取消，避免识别结果填到下一题；同时停掉面试官朗读，避免声音串场
  useEffect(() => {
    if (voice.state !== "idle") voice.cancel();
    if (tts.speaking) tts.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionIndex]);

  // ===== P2 限时作答:题目展示即开始倒计时(首答提交/评估后停表;切题重置) =====
  useEffect(() => {
    if (!timeLimitSec || questions.length === 0 || firstAnswerSubmitted) {
      setTimeLeft(null);
      return;
    }
    setTimeLeft(timeLimitSec);
    setTimeUp(false);
    timeUpRef.current = false;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t == null) return t;
        if (t <= 1) {
          clearInterval(id);
          setTimeUp(true);
          timeUpRef.current = true;
          track("interview_timer_expire", { limit: timeLimitSec });
          // 限时到:若正在语音作答则自动定稿(等同点「完成作答」)
          if (voiceRef.current.state === "listening") voiceRef.current.stop();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionIndex, questions, timeLimitSec, firstAnswerSubmitted]);

  const useResume = withResume || interviewType === 'resume-drill';

  /** 重置当前题的「真人面试循环」状态(切题/重新生成/清空/再练共用) */
  const resetConversationState = () => {
    setTimeLeft(null);
    setTimeUp(false);
    timeUpRef.current = false;
    setFirstAnswerSubmitted(false);
    setFollowUp(null);
    setFollowUpAnswer("");
    setFollowUpLoading(false);
    voiceTargetRef.current = "first";
    voiceFillRef.current = "";
  };

  /** 从版本列表还原完整版本对象（草稿只存 id/name，避免冗余快照） */
  const findVersion = (versions, id) => {
    if (!id) return null;
    return versions.find((v) => v.id === id) || null;
  };

  // 初始：无草稿时默认激活版本；有跳转带入的新 JD 时优先新意图并清旧草稿
  useEffect(() => {
    const versions = [];
    try {
      const raw = localStorage.getItem('resume_versions_v1');
      versions.push(...(raw ? JSON.parse(raw) : []));
    } catch { /* ignore */ }
    const active = getActiveVersion();

    const st = location.state;

    // 0) 从个人中心「收藏夹 · 再练一次」进入：把收藏题还原为单题会话 → 清旧草稿
    if (st?.replayFavorite && st.replayFavorite.question) {
      const fav = st.replayFavorite;
      const q = {
        question: fav.question,
        type: ['behavioral', 'technical', 'resume-drill'].includes(fav.type) ? fav.type : 'behavioral',
        category: fav.category || '收藏题',
        difficulty: normDiff(fav.difficulty),
        answerFramework: fav.answerFramework || '',
        fromExperience: fav.fromExperience || '',
        drillHint: fav.drillHint || '',
        referenceTips: fav.referenceTips || null,
      };
      setJobTitle(fav.sourceJobTitle || "");
      setWithJd(false);
      setJd("");
      setWithResume(false);
      setInterviewType('mixed');
      setQuestionCount(1);
      setDifficultyMode('progressive');
      setQuestions([q]);
      setCurrentQuestionIndex(0);
      setSetupOpen(false); // 收藏再练直接进入练习态
      setUserAnswer("");
      setEvaluation(null);
      setSessionRecords([]);
      setSessionSaved(false);
      setRevealedRef(false);
      resetConversationState();
      setCtxBadge({ title: fav.sourceJobTitle || "收藏题再练", hasJd: false, resumeName: "" });
      ctxRef.current = {
        jobTitle: fav.sourceJobTitle || "",
        jd: "",
        resumeBrief: "",
        mode: "favorite",
        type: q.type,
        resumeId: "",
        resumeName: "",
      };
      clearDraft("interview");
      return;
    }

    // 1) 从个人中心「能力画像 · 针对性再练」进入:携带弱项维度 → 清旧草稿,定向出题
    if (st?.weakDrill && Array.isArray(st.weakDrill.categories) && st.weakDrill.categories.length > 0) {
      setFocusCategories(st.weakDrill.categories.filter((c) => typeof c === "string" && c.trim()).slice(0, 5));
      if (st.weakDrill.jobTitle) setJobTitle(st.weakDrill.jobTitle);
      clearDraft("interview");
      return;
    }

    // 2) 从 ATS 结果页跳转带入：明确的新意图 → 预填并丢弃旧草稿
    if (st && (st.jd || st.resumeId)) {
      if (st.jd) {
        setJd(st.jd);
        setWithJd(true);
      }
      if (st.resumeId) {
        const target = findVersion(versions, st.resumeId) || active;
        if (target) setResumeVersion(target);
        if (target && target.data && !target.data.empty) setWithResume(true);
      }
      setInterviewType('mixed');
      clearDraft("interview");
      return;
    }

    // 2) 恢复上次未完成的面试练习（静默恢复现场）
    const draft = loadDraft("interview");
    if (draft && (draft.jobTitle || (draft.questions && draft.questions.length > 0))) {
      if (draft.jobTitle) setJobTitle(draft.jobTitle);
      if (typeof draft.withJd === "boolean") setWithJd(draft.withJd);
      if (typeof draft.jd === "string") setJd(draft.jd);
      if (typeof draft.withResume === "boolean") setWithResume(draft.withResume);
      if (draft.interviewType) setInterviewType(draft.interviewType);
      if (typeof draft.questionCount === "number") setQuestionCount(draft.questionCount);
      if (draft.difficultyMode) setDifficultyMode(draft.difficultyMode);
      if (draft.interviewerStyle && STYLE_META[draft.interviewerStyle]) setInterviewerStyle(draft.interviewerStyle);
      if (Array.isArray(draft.focusCategories) && draft.focusCategories.length > 0) setFocusCategories(draft.focusCategories);
      if (TIME_LIMIT_OPTIONS.includes(draft.timeLimitSec)) setTimeLimitSec(draft.timeLimitSec);
      setRevealedRef(false);
      const target = findVersion(versions, draft.resumeId);
      if (target) {
        setResumeVersion(target);
        if (target.data && !target.data.empty) setWithResume(true);
      } else if (active) {
        setResumeVersion(active);
      }
      if (draft.questions) setQuestions(draft.questions);
      if (draft.questions?.length > 0) setSetupOpen(false); // 恢复到练习现场:设置区收起
      const total = (draft.questions || []).length;
      const idx = typeof draft.currentQuestionIndex === "number" ? draft.currentQuestionIndex : 0;
      setCurrentQuestionIndex(total > 0 ? Math.min(Math.max(idx, 0), total - 1) : 0);
      if (typeof draft.userAnswer === "string") setUserAnswer(draft.userAnswer);
      if (typeof draft.firstAnswerSubmitted === "boolean") setFirstAnswerSubmitted(draft.firstAnswerSubmitted);
      if (draft.followUp && draft.followUp.question) setFollowUp(draft.followUp);
      if (typeof draft.followUpAnswer === "string") setFollowUpAnswer(draft.followUpAnswer);
      if (draft.evaluation) setEvaluation(draft.evaluation);
      if (draft.sessionRecords) setSessionRecords(draft.sessionRecords);
      if (draft.report && draft.report.stats) setReport(draft.report);
      if (draft.sessionSaved) setSessionSaved(true);
      if (draft.ctx) {
        ctxRef.current = draft.ctx;
        setCtxBadge({
          title: draft.ctx.jobTitle || draft.jobTitle || "",
          hasJd: !!(draft.ctx.jd && String(draft.ctx.jd).trim()),
          resumeName: draft.ctx.resumeName || "",
        });
      }
      if (draft.jobTitle || draft.questions?.length > 0) setRestoredTip(true);
      return;
    }

    // 3) 全新进入：默认选中激活版本（供“我的简历”开关即用）
    if (active) setResumeVersion(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 防抖自动保存整场练习现场；完全为空则清除草稿
  useEffect(() => {
    const timer = setTimeout(() => {
      const hasAny = !!(jobTitle.trim() || jd.trim() || questions.length > 0 || sessionRecords.length > 0);
      if (!hasAny) {
        clearDraft("interview");
        return;
      }
      saveDraft("interview", {
        resumeId: resumeVersion?.id || "",
        resumeName: resumeVersion?.name || "",
        jobTitle,
        withJd,
        jd,
        withResume,
        interviewType,
        questionCount,
        difficultyMode,
        interviewerStyle,
        focusCategories: focusCategories || [],
        timeLimitSec,
        questions,
        currentQuestionIndex,
        userAnswer,
        firstAnswerSubmitted,
        followUp,
        followUpAnswer,
        evaluation,
        sessionRecords,
        sessionSaved,
        report,
        ctx: ctxRef.current || null,
      });
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobTitle, withJd, jd, withResume, interviewType, questionCount, difficultyMode, interviewerStyle, focusCategories, timeLimitSec, resumeVersion, questions, currentQuestionIndex, userAnswer, firstAnswerSubmitted, followUp, followUpAnswer, evaluation, sessionRecords, sessionSaved, report]);

  /** 结束当前练习并清空本页（已保存到个人中心的记录不受影响） */
  const clearWorkspace = () => {
    if (!window.confirm("结束当前练习并清空本页内容？已「保存到个人中心」的记录不受影响。")) return;
    setJobTitle("");
    setWithJd(false);
    setJd("");
    setWithResume(false);
    setInterviewType("mixed");
    setQuestionCount(5);
    setDifficultyMode("progressive");
    setInterviewerStyle("standard");
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setUserAnswer("");
    setEvaluation(null);
    setEvalTab("feedback");
    setSetupOpen(true); // 清空后回到设置态
    setRevealedRef(false);
    setError(null);
    setSessionRecords([]);
    setSessionSaved(false);
    setCtxBadge(null);
    setRestoredTip(false);
    setFocusCategories(null);
    resetConversationState();
    setReport(null);
    setReportError(null);
    ctxRef.current = null;
    const active = getActiveVersion();
    if (active) setResumeVersion(active); else setResumeVersion(null);
    clearDraft("interview");
  };

  const applyPreset = (p) => {
    setWithJd(p.jd);
    setWithResume(p.resume);
    setInterviewType(p.type);
    if (p.type === 'resume-drill') setDifficultyMode('progressive'); // 深挖难度由简历决定
    if ((p.resume || p.type === 'resume-drill') && !resumeVersion) {
      setResumeVersion(getActiveVersion());
    }
  };

  const toggleJd = () => setWithJd((v) => !v);
  const toggleResume = () => {
    if (interviewType === 'resume-drill') return; // 深挖模式锁定简历
    setWithResume((v) => !v);
  };

  const generateQuestions = async () => {
    if (!jobTitle.trim()) {
      setError("请先填写目标职位");
      return;
    }
    const needResume = useResume;
    if (needResume && (!resumeVersion || isEmptyResumeData(resumeVersion.data))) {
      setError("勾选了「结合我的简历」，请先在「编辑器」中创建一份已填写的简历，或切换简历版本。");
      return;
    }

    setLoading(true);
    setError(null);
    setQuestions([]);
    setEvaluation(null);
    setSessionRecords([]);
    setSessionSaved(false);
    setCtxBadge(null);
    setRevealedRef(false);
    resetConversationState();
    setReport(null);
    setReportError(null);
    setConsistency(null);
    setConsistencyLoading(false);
    setEvalTab("feedback");
    setSetupOpen(false); // 出题后进入练习态:设置区收起为摘要条

    try {
      const resumeBrief = needResume ? briefOfVersion(resumeVersion) : "";
      const mode = modeOf({ withJd, withResume: needResume, type: interviewType });
      const result = await api.generateInterviewQuestions({
        jobTitle: jobTitle.trim(),
        jobDescription: withJd ? jd.trim() : "",
        resumeBrief,
        interviewType,
        count: questionCount,
        difficulty: difficultyMode,
        focusCategories: Array.isArray(focusCategories) ? focusCategories : [],
        style: interviewerStyle,
      });

      const qs = Array.isArray(result.questions) ? result.questions : [];
      // 循序渐进:整组按难度 easy→medium→hard 排列,让"由易到难"体感成立
      setQuestions(difficultyMode === 'progressive' ? sortByDifficulty(qs) : qs);
      setCurrentQuestionIndex(0);
      setRevealedRef(false);
      ctxRef.current = {
        jobTitle: jobTitle.trim(),
        jd: withJd ? jd.trim() : "",
        resumeBrief,
        mode,
        type: interviewType,
        style: interviewerStyle,
        resumeId: needResume ? resumeVersion.id : "",
        resumeName: needResume ? resumeVersion.name : "",
      };
      setCtxBadge({
        title: jobTitle.trim(),
        hasJd: withJd && jd.trim().length > 0,
        resumeName: needResume ? resumeVersion.name : "",
      });
      track("interview_generate", { ctx: mode, type: interviewType, count: questionCount, difficulty: difficultyMode, focus: Array.isArray(focusCategories) ? focusCategories.length : 0, style: interviewerStyle });
    } catch (err) {
      setError(`生成面试题失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /** 提交首答,交给面试官 → 自动生成追问(P2 真人面试循环) */
  const submitFirstAnswer = async () => {
    if (!userAnswer.trim()) {
      setError("请先写下你的回答");
      return;
    }
    if (!ctxRef.current) {
      setError("会话上下文丢失，请重新生成面试题");
      return;
    }

    setFirstAnswerSubmitted(true); // 停表、锁定首答
    setFollowUpLoading(true);
    setError(null);

    const currentQuestion = questions[currentQuestionIndex];
    const ctx = ctxRef.current;
    try {
      const qType = ctx.type === 'resume-drill' ? 'resume-drill' : currentQuestion.type;
      const result = await api.generateFollowUp({
        question: currentQuestion.question,
        userAnswer,
        questionType: qType,
        jobTitle: ctx.jobTitle,
        jobDescription: ctx.jd,
        resumeBrief: ctx.resumeBrief,
        style: ctx.style || "standard",
      });
      if (result?.followUp) {
        setFollowUp({ question: result.followUp, angle: result.angle || "" });
        track("interview_followup_generate", { ctx: ctx.mode });
      } else {
        throw new Error("追问内容为空");
      }
    } catch (err) {
      // 追问生成失败不阻塞主流程:留在追问阶段,可直接获取反馈或返回修改
      setFollowUp(null);
      setError(`追问生成失败: ${err.message} —— 可直接点击下方「获取 AI 反馈」，或返回修改回答`);
    } finally {
      setFollowUpLoading(false);
    }
  };

  const evaluateUserAnswer = async () => {
    if (!userAnswer.trim()) {
      setError("请先写下你的回答");
      return;
    }
    if (!ctxRef.current) {
      setError("会话上下文丢失，请重新生成面试题");
      return;
    }

    const currentQuestion = questions[currentQuestionIndex];
    const ctx = ctxRef.current;
    const hasFollowUp = Boolean(followUp?.question);

    // 语音填入后被用户编辑过 → 记录（编辑率是语音转写质量的衡量指标，越低越好）
    const voiceFilled = voiceFillRef.current;
    if (voiceFilled && userAnswer.trim() !== voiceFilled.trim()) {
      track("interview_voice_edited", {});
    }
    // 追问闭环:用户补答后才算「应对了追问」(空补答=未回应,也是有效信号)
    if (hasFollowUp && followUpAnswer.trim()) {
      track("interview_followup_answered", {});
    }

    setLoading(true);
    setError(null);
    setFirstAnswerSubmitted(true); // 评估即本题作答结束(停表)

    try {
      // 简历深挖模式下，评估按深挖规则走（后端会对照简历核查真实性）
      const qType = ctx.type === 'resume-drill' ? 'resume-drill' : currentQuestion.type;
      const result = await api.evaluateAnswer({
        question: currentQuestion.question,
        userAnswer,
        questionType: qType,
        jobTitle: ctx.jobTitle,
        jobDescription: ctx.jd,
        resumeBrief: ctx.resumeBrief,
        followUpQuestion: hasFollowUp ? followUp.question : "",
        followUpAnswer: followUpAnswer.trim(),
        style: ctx.style || "standard",
      });

      setEvaluation(result);
      // 汇总到本次会话记录（同一题重答则覆盖旧记录）
      setSessionRecords((prev) => {
        const others = prev.filter((r) => r.question !== currentQuestion.question);
        return [...others, {
          type: currentQuestion.type || "",
          category: currentQuestion.category || "",
          difficulty: normDiff(currentQuestion.difficulty),
          question: currentQuestion.question || "",
          userAnswer,
          score: result.score ?? null,
          feedback: result.feedback || "",
          strengths: result.strengths || [],
          improvements: result.improvements || [],
          starCompliance: result.starCompliance,
          authenticityNote: result.authenticityNote || "",
          improvedAnswer: result.improvedAnswer || "",
          followUp: hasFollowUp ? {
            question: followUp.question,
            angle: followUp.angle || "",
            answer: followUpAnswer.trim(),
          } : null,
          timeUp: timeUpRef.current, // 本题是否超时(仅限时模式有意义)
        }];
      });
      setSessionSaved(false);
    } catch (err) {
      setError(`回答评估失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /** 回答-简历矛盾点对照(按需触发):把本题回答(含补答)与简历原文逐点比对 */
  const runConsistencyCheck = async () => {
    if (!ctxRef.current?.resumeBrief) {
      setError("本次面试没有结合简历，无法做回答-简历对照；可开启「我的简历」后重新出题。");
      return;
    }
    const currentQuestion = questions[currentQuestionIndex];
    const ctx = ctxRef.current;
    setConsistencyLoading(true);
    setError(null);
    try {
      const result = await api.consistencyCheck({
        question: currentQuestion?.question || "",
        userAnswer,
        resumeBrief: ctx.resumeBrief,
        followUpAnswer: followUpAnswer.trim(),
      });
      setConsistency(result);
      // 结果并入本题记录(同题重答/重新对照则覆盖)
      setSessionRecords((prev) =>
        prev.map((r) => (r.question === currentQuestion?.question ? { ...r, consistency: result } : r))
      );
      setSessionSaved(false);
      track("interview_consistency_check", { verdict: result.verdict, items: (result.items || []).length });
    } catch (err) {
      setError(`简历对照失败: ${err.message}`);
    } finally {
      setConsistencyLoading(false);
    }
  };

  /** 保存本次练习到个人中心历史 */
  const saveSession = () => {
    if (sessionRecords.length === 0) {
      setError("还没有已评估的回答，请先完成至少一题再保存");
      return;
    }
    const ctx = ctxRef.current || {};
    const jdFirstLine = (ctx.jd || "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) || "";
    const session = saveInterviewSession({
      jobTitle: ctx.jobTitle || jobTitle,
      interviewType: ctx.type || interviewType,
      context: {
        mode: ctx.mode || "title",
        jdTitle: jdFirstLine.slice(0, 40),
        jdPreview: (ctx.jd || "").trim().slice(0, 80),
        resumeId: ctx.resumeId || "",
        resumeName: ctx.resumeName || "",
        style: ctx.style || interviewerStyle || "standard",
      },
      records: sessionRecords,
      report: report ? { stats: report.stats, llm: report.llm } : null,
    });
    setSessionSaved(true);
    setError(null);
    track("interview_history_save", { questions: session.questionCount, ctx: ctx.mode || "title" });
  };

  /** 切题(上一题/下一题共用):重置本题作答状态;在点击手势栈内同步朗读新题(P2 自动读题) */
  const goQuestion = (dir) => {
    const next = currentQuestionIndex + dir;
    if (next < 0 || next >= questions.length) return;
    setCurrentQuestionIndex(next);
    setUserAnswer("");
    setEvaluation(null);
    setConsistency(null);
    setEvalTab("feedback");
    setRevealedRef(false);
    resetConversationState();
    // 换题自动读题:手势栈内同步调用,浏览器允许开口;失败则静默(题卡仍有「面试官读题」按钮兜底)
    const q = questions[next];
    if (q?.question && tts.speak(`第 ${next + 1} 题。${q.question}`)) {
      track("interview_tts_play", { kind: "question", auto: true, chars: String(q.question).length });
    }
  };

  const nextQuestion = () => goQuestion(1);
  const previousQuestion = () => goQuestion(-1);

  /** 侧栏会话仪表盘:点击任意题直接跳转(与翻页同等语义,含自动读题) */
  const jumpToQuestion = (i) => {
    if (i === currentQuestionIndex || i < 0 || i >= questions.length) return;
    setCurrentQuestionIndex(i);
    setUserAnswer("");
    setEvaluation(null);
    setConsistency(null);
    setEvalTab("feedback");
    setRevealedRef(false);
    resetConversationState();
    const q = questions[i];
    if (q?.question && tts.speak(`第 ${i + 1} 题。${q.question}`)) {
      track("interview_tts_play", { kind: "question", auto: true, chars: String(q.question).length });
    }
  };

  /** 面试官读题 / 停止(题卡按钮兜底:网络生成首题、收藏再练等无手势场景) */
  const toggleReadQuestion = () => {
    if (tts.speaking) {
      tts.stop();
      track("interview_tts_stop", {});
      return;
    }
    const q = questions[currentQuestionIndex];
    if (q?.question && tts.speak(`第 ${currentQuestionIndex + 1} 题。${q.question}`)) {
      track("interview_tts_play", { kind: "question", auto: false, chars: String(q.question).length });
    }
  };

  /** 念出追问 / 停止(追问卡按钮) */
  const toggleReadFollowUp = () => {
    if (tts.speaking) {
      tts.stop();
      track("interview_tts_stop", {});
      return;
    }
    if (followUp?.question && tts.speak(`面试官追问。${followUp.question}`)) {
      track("interview_tts_play", { kind: "followup", auto: false, chars: String(followUp.question).length });
    }
  };

  // 题目列表变化时同步收藏状态(读 store 建集合,避免逐题渲染反复解析 localStorage)
  useEffect(() => {
    const s = new Set(
      (questions || [])
        .map((q) => String(q?.question || "").trim())
        .filter((t) => t && isFavorite(t))
    );
    setFavSet(s);
  }, [questions]);

  // ===== 收藏目标收藏夹(题卡星标旁选择;"" = 默认收藏夹;弱题一键收藏同用) =====
  const [favFolder, setFavFolder] = useState("");

  /** 收藏/取消收藏当前题目(判重与上限在 favoritesStore 内处理) */
  const toggleFavorite = () => {
    const q = questions[currentQuestionIndex];
    if (!q) return;
    const key = String(q.question || "").trim();
    if (favSet.has(key)) {
      removeFavorite(key);
      setFavSet((prev) => { const s = new Set(prev); s.delete(key); return s; });
      track("interview_favorite_remove", {});
    } else {
      const { added } = addFavorite({
        question: q.question,
        type: q.type || "",
        category: q.category || "",
        difficulty: normDiff(q.difficulty),
        answerFramework: q.answerFramework || "",
        fromExperience: q.fromExperience || "",
        drillHint: q.drillHint || "",
        referenceTips: q.referenceTips || null,
        sourceJobTitle: ctxRef.current?.jobTitle || jobTitle || "",
        folder: favFolder,
      });
      if (added) {
        setFavSet((prev) => new Set(prev).add(key));
        track("interview_favorite_add", { folder: favFolder || DEFAULT_FOLDER });
      }
    }
  };

  /** 展开/收起「参考思路」(仅展开埋点;答后评估给出的 improvedAnswer 通道不受影响) */
  const toggleReference = () => {
    const next = !revealedRef;
    setRevealedRef(next);
    if (next) track("interview_reveal_answer", { source: "reveal" });
  };

  /** 整场复盘:本地统计即时呈现,LLM 跨题归纳异步补充(失败不影响统计展示) */
  const generateReport = async () => {
    if (sessionRecords.length === 0) {
      setError("还没有已评估的回答，请先完成至少一题再生成复盘");
      return;
    }
    const stats = buildSessionStats(sessionRecords);
    setReport({ stats, llm: null });
    setReportError(null);
    setReportLoading(true);
    track("interview_report_generate", { questions: stats.answered, avg: stats.avg });
    try {
      const ctx = ctxRef.current || {};
      const llm = await api.generateSessionReport({ jobTitle: ctx.jobTitle || jobTitle, records: sessionRecords });
      setReport({ stats, llm });
    } catch (err) {
      setReportError(err.message); // 本地统计仍然有效
    } finally {
      setReportLoading(false);
    }
  };

  /** 一键把弱题(低分/超时/未回应追问)送进收藏夹,配合「再练一次」形成训练闭环 */
  const addWeakToFavorites = () => {
    if (!report) return;
    let added = 0;
    let dup = 0;
    report.stats.weakQuestions.forEach((r) => {
      const key = String(r.question || "").trim();
      if (!key) return;
      if (favSet.has(key)) { dup += 1; return; }
      // 优先回查题库原题(带 referenceTips 等完整信息),找不到再用记录字段
      const q = questions.find((item) => String(item.question || "").trim() === key);
      const { added: ok } = addFavorite({
        question: r.question,
        type: r.type || q?.type || "",
        category: r.category || q?.category || "",
        difficulty: r.difficulty || normDiff(q?.difficulty),
        answerFramework: q?.answerFramework || "",
        fromExperience: q?.fromExperience || "",
        drillHint: q?.drillHint || "",
        referenceTips: q?.referenceTips || null,
        sourceJobTitle: ctxRef.current?.jobTitle || jobTitle || "",
        folder: favFolder,
      });
      if (ok) {
        added += 1;
        setFavSet((prev) => new Set(prev).add(key));
      }
    });
    track("interview_report_retrain", { added, dup });
    if (added === 0 && dup > 0) setError("弱题都已在收藏夹里了——去「个人中心 · 收藏夹」再练一次");
    else if (added > 0) setError(null);
  };

  const currentQuestion = questions[currentQuestionIndex];
  const refTips = currentQuestion?.referenceTips || null;
  // 当前题的历史记录(回看已答过的题时,追问应对 Tab 的数据源)
  const curRecord = sessionRecords.find((r) => r.question === currentQuestion?.question) || null;

  /** 语音作答条(P1/P2):按 target 决定识别结果填入首答还是追问补答 */
  const renderVoicePanel = (target) => (
    <div className="iv-voice">
      {voice.supported ? (
        voice.state === 'idle' ? (
          <button
            type="button"
            className="btn-ghost iv-voice-start"
            onClick={() => { voiceTargetRef.current = target; track("interview_voice_start", {}); voice.start(); }}
          >
            🎤 用语音作答
          </button>
        ) : (
          <>
            <span className="iv-voice-live">
              <span className="iv-voice-dot" />
              {voice.state === 'busy' ? '⏳ 正在整理…' : '正在聆听…停顿思考也没关系，说完请点「■ 完成作答」'}
            </span>
            <button type="button" className="btn-primary iv-voice-stop" onClick={voice.stop} disabled={voice.state === 'busy'}>
              ■ 完成作答
            </button>
            <button type="button" className="btn-ghost" onClick={voice.cancel}>取消</button>
            {(voice.accumulated || voice.interim) && (
              <div className="iv-voice-live-text">
                <span className="iv-voice-live-cap">已识别（会继续累积，点「完成作答」后填入）：</span>
                {voice.accumulated && <span className="iv-voice-live-acc">{voice.accumulated}</span>}
                {voice.interim && <span className="iv-voice-live-int">{voice.interim}…</span>}
              </div>
            )}
          </>
        )
      ) : (
        <span className="iv-voice-unsupported">当前浏览器不支持语音识别，可直接打字作答</span>
      )}

      {voice.error && (
        <p className="iv-voice-err">⚠️ {voice.error.title}：{voice.error.hint}</p>
      )}
      {voice.interim && (
        <div className="iv-voice-interim"><span>实时转写：</span>{voice.interim}…</div>
      )}
      {voice.state === 'idle' && !voice.error && (
        <p className="iv-voice-hint">口述时的停顿不会被切断：内容会持续累积，点「■ 完成作答」后统一填入上方输入框（可再修改）；语音仅在本机实时识别、不保存录音</p>
      )}
    </div>
  );

  /** 限时倒计时展示(P2):mm:ss 胶囊,剩 15 秒内红色警示 */
  const timerLabel = timeLeft == null ? "" : `${String(Math.floor(timeLeft / 60)).padStart(2, "0")}:${String(timeLeft % 60).padStart(2, "0")}`;

  return (
    <section>
      <PageHead
        kicker="打磨优化"
        title="模拟面试"
        icon="🎤"
        sub="设定面试官掌握的「资料」（职位名 / JD / 你的简历），AI 按不同模式出题并逐条评估你的回答。"
      />

      {/* 恢复提示（一次性、可关闭） */}
      {restoredTip && (
        <div className="notice notice-ok" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <span>🔄 已恢复上次离开时的练习 —— 本页现场会自动保存在本机，随时可以放心切换页面。</span>
          <button className="btn-ghost" style={{ fontSize: '12px', padding: '2px 10px', flexShrink: 0 }} onClick={() => setRestoredTip(false)}>知道了</button>
        </div>
      )}

      {/* 针对性练习横幅(能力画像弱项定向):出题只围绕这些维度,可随时取消 */}
      {focusCategories && focusCategories.length > 0 && (
        <div className="notice notice-ok" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <span>🎯 <b>针对性练习</b>：本场题目将集中考察「{focusCategories.join("、")}」(来自能力画像的弱项维度)。</span>
          <button className="btn-ghost" style={{ fontSize: '12px', padding: '2px 10px', flexShrink: 0 }} onClick={() => setFocusCategories(null)}>取消定向</button>
        </div>
      )}

      {/* 工作区工具行 */}
      {(jobTitle.trim() || jd.trim() || questions.length > 0) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
          <button className="btn-ghost" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={clearWorkspace}>
            🗑 清空本页，重新开始
          </button>
        </div>
      )}

      {/* ========== 设置区:双态布局 —— 展开为左右分栏,练习中收起为摘要条 ========== */}
      <div className="iv-setup">
        {setupOpen ? (
          <div className="iv-setup-grid">
            {/* 左栏 · 面试官资料包:他读了什么 */}
            <div className="iv-setup-col">
              <p className="iv-setup-cap">🎙️ 面试官资料包 <span>他读了什么</span></p>
        <div className="iv-field">
          <label htmlFor="iv-jobtitle">目标职位 <em>*</em></label>
          <input
            id="iv-jobtitle"
            type="text"
            placeholder="例如：AI 产品经理、数据分析师"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
        </div>

        <div className="iv-presets">
          <span className="iv-cap">🎙️ 面试官掌握了哪些资料？（预设）</span>
          <div className="iv-preset-grid">
            {PRESETS.map((p) => {
              const active = p.jd === withJd
                && (p.resume === useResume)
                && p.type === interviewType;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`iv-preset-card${active ? " active" : ""}`}
                  onClick={() => applyPreset(p)}
                >
                  <span className="iv-preset-ico">{p.icon}</span>
                  <span className="iv-preset-name">{p.name}</span>
                  <span className="iv-preset-desc">{p.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="iv-switches">
          <button
            type="button"
            className={`iv-switch${withJd ? " on" : ""}`}
            onClick={toggleJd}
          >
            <span className="iv-switch-box">{withJd ? "✓" : ""}</span>
            <span className="iv-switch-body">
              <b>岗位 JD</b>
              <i>题目紧扣职位职责与任职要求</i>
            </span>
          </button>
          <button
            type="button"
            className={`iv-switch${useResume ? " on" : ""}${interviewType === 'resume-drill' ? " locked" : ""}`}
            onClick={toggleResume}
          >
            <span className="iv-switch-box">{useResume ? "✓" : ""}</span>
            <span className="iv-switch-body">
              <b>我的简历</b>
              <i>贴合真实经历提问与评估，绝不诱导编造</i>
            </span>
          </button>
        </div>

        {withJd && (
          <div className="iv-field">
            <label htmlFor="iv-jd">职位描述（JD）<span className="iv-hint">{jd.trim() ? `${jd.trim().length} 字` : "粘贴完整 JD 更贴近真实投递"}</span></label>
            <textarea
              id="iv-jd"
              rows={6}
              placeholder="把招聘 JD 粘到这里，AI 面试官会按其中的职责与要求提问…"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
            />
            {jd.trim() && (
              <Link to="/ats" className="iv-jd-backlink" title="JD 诊断页会自动恢复上次的分析现场">
                🎯 回看这份 JD 的诊断结果 →
              </Link>
            )}
          </div>
        )}

        {useResume && (
          <div className="iv-resume-box">
            <ResumePicker
              version={resumeVersion}
              onChange={(v) => setResumeVersion(v)}
              label="面试官将阅读的简历"
            />
          </div>
        )}
            </div>

            {/* 右栏 · 考试规则:怎么考你 */}
            <div className="iv-setup-col iv-setup-col-rules">
              <p className="iv-setup-cap">⚙️ 考试规则 <span>怎么考你</span></p>
        <div className="iv-field">
          <label htmlFor="iv-type">题目类型</label>
          <select
            id="iv-type"
            value={interviewType}
            onChange={(e) => {
              const t = e.target.value;
              setInterviewType(t);
              if (t === 'resume-drill') setDifficultyMode('progressive'); // 深挖难度由简历决定
              if (t === 'resume-drill' && !resumeVersion) {
                setResumeVersion(getActiveVersion());
              }
            }}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {interviewType === 'resume-drill' && (
            <p className="iv-tip">🧠 深挖模式下，面试官会逐条盘问你简历中的经历——先到「编辑器」把简历写实写细，效果最好。</p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div className="iv-field" style={{ flex: '1 1 140px', minWidth: 130 }}>
            <label htmlFor="iv-count">题目数量</label>
            <select id="iv-count" value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))}>
              {[...new Set([questionCount, ...COUNT_OPTIONS])].sort((a, b) => a - b).map((c) => (
                <option key={c} value={c}>{c} 题</option>
              ))}
            </select>
            <p className="iv-tip">每题独立评估，数量越多越接近真实面试节奏</p>
          </div>
          <div className="iv-field" style={{ flex: '1 1 260px', minWidth: 230 }}>
            <label htmlFor="iv-diff">题目难度</label>
            <select
              id="iv-diff"
              value={difficultyMode}
              disabled={interviewType === 'resume-drill'}
              onChange={(e) => setDifficultyMode(e.target.value)}
            >
              {DIFF_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {interviewType === 'resume-drill' ? (
              <p className="iv-tip">🧠 深挖面的难度由简历内容决定，无需手动选择</p>
            ) : difficultyMode === 'progressive' ? (
              <p className="iv-tip">由易到难递进：前几题热身表达，后几题挑战薄弱点</p>
            ) : (
              <p className="iv-tip">全部题目将按所选档位出题</p>
            )}
          </div>
          <div className="iv-field" style={{ flex: '1 1 140px', minWidth: 130 }}>
            <label htmlFor="iv-timelimit">作答限时</label>
            <select
              id="iv-timelimit"
              value={timeLimitSec}
              onChange={(e) => setTimeLimitSec(Number(e.target.value))}
            >
              {TIME_LIMIT_OPTIONS.map((s) => (
                <option key={s} value={s}>{TIME_LIMIT_LABEL(s)}</option>
              ))}
            </select>
            <p className="iv-tip">默认关闭；开启后每题展示即倒计时，到时语音自动定稿并提示</p>
          </div>
          <div className="iv-field" style={{ flex: '1 1 200px', minWidth: 180 }}>
            <label htmlFor="iv-style">面试官风格</label>
            <select
              id="iv-style"
              value={interviewerStyle}
              onChange={(e) => setInterviewerStyle(e.target.value)}
            >
              {STYLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="iv-tip">决定提问锋芒与语气；评分标准不因风格改变</p>
          </div>
        </div>

        <button
          className="btn-primary iv-generate"
          onClick={generateQuestions}
          disabled={loading || !jobTitle.trim()}
        >
          {loading ? '⏳ 正在生成题目…' : '🎤 开始面试'}
        </button>
            </div>
          </div>
        ) : (
          /* 练习态摘要条:点击可展开设置区重新出题 */
          <button type="button" className="iv-setup-summary" onClick={() => setSetupOpen(true)}>
            <span className="iv-setup-summary-job">🎤 {jobTitle.trim() || "未命名岗位"}</span>
            <span className="iv-setup-summary-meta">
              {TYPE_OPTIONS.find((o) => o.value === interviewType)?.label.split('（')[0] || interviewType}
              {' · '}{questionCount} 题
              {' · '}{interviewType === 'resume-drill' ? '深挖难度' : DIFF_OPTIONS.find((o) => o.value === difficultyMode)?.label.split('（')[0] || difficultyMode}
              {' · '}{STYLE_META[interviewerStyle]?.label || '大厂标准'}
              {withJd ? ' · JD' : ''}{useResume ? ' · 简历' : ''}
            </span>
            <span className="iv-setup-summary-toggle">调整设置 ▾</span>
          </button>
        )}
      </div>

      {error && (
        <div className="notice notice-err" style={{ marginTop: '14px' }}>{error}</div>
      )}

      {/* ========== 练习态:主栏(题卡+作答) + 侧栏(会话仪表盘) ========== */}
      {questions.length > 0 && currentQuestion && (
        <div className="iv-practice-grid">
        <div className="iv-practice-main">
          {/* 保存到个人中心 */}
          <div className="iv-savebar">
            <span>
              已答 {sessionRecords.length} 题{sessionSaved && ' · ✅ 已保存到个人中心'}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-ghost" onClick={generateReport} disabled={sessionRecords.length === 0 || reportLoading}>
                {reportLoading ? '⏳ 归纳中…' : report ? '🔄 重新复盘' : '📋 整场复盘'}
              </button>
              <button className="btn-ghost" onClick={saveSession} disabled={sessionRecords.length === 0 || sessionSaved}>
                💾 保存本次练习
              </button>
            </div>
          </div>

          {/* 整场复盘报告:本地统计(追问命中率/角度分布/得分条形)+ AI 跨题归纳 + 弱题一键收藏 */}
          {report && (
            <div className="iv-report">
              <div className="iv-report-head">
                <span className="iv-report-cap">📋 整场复盘</span>
                <span className="iv-report-sub">{ctxRef.current?.jobTitle || jobTitle || '本次练习'} · {report.stats.answered} 题</span>
              </div>

              <div className="iv-report-stats">
                <div className="iv-stat"><b>{report.stats.avg ?? '—'}</b><span>平均分</span></div>
                <div className={`iv-stat${report.stats.timedOut > 0 ? ' warn' : ''}`}><b>{report.stats.timedOut}</b><span>超时</span></div>
                <div className="iv-stat"><b>{report.stats.followUpCount > 0 ? `${report.stats.followUpResponded}/${report.stats.followUpCount}` : '—'}</b><span>追问回应</span></div>
                <div className={`iv-stat${report.stats.weakQuestions.length > 0 ? ' warn' : ''}`}><b>{report.stats.weakQuestions.length}</b><span>建议再练</span></div>
              </div>

              {report.stats.angleCounts.length > 0 && (
                <div className="iv-report-sec">
                  <strong>🗣 追问角度分布</strong>
                  <span className="iv-report-hint">被追问最多的角度 = 你最容易「答虚」的地方</span>
                  <div className="iv-report-angles">
                    {report.stats.angleCounts.map((a) => (
                      <span key={a.angle} className="iv-angle-chip">{a.angle} × {a.count}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="iv-report-sec">
                <strong>📊 逐题得分</strong>
                <div className="iv-report-bars">
                  {report.stats.perQuestion.map((p) => (
                    <div key={p.no} className="iv-bar-row" title={p.flagged ? '低分 / 超时 / 未回应追问,建议再练' : p.category}>
                      <span className="iv-bar-no">Q{p.no}</span>
                      <div className="iv-bar-track">
                        <div
                          className={`iv-bar-fill${p.score != null && p.score < WEAK_SCORE ? ' weak' : ''}`}
                          style={{ width: p.score != null ? `${p.score * 10}%` : '0%' }}
                        />
                      </div>
                      <span className="iv-bar-score">{p.score ?? '—'}{p.flagged ? ' ⚠️' : ''}</span>
                    </div>
                  ))}
                </div>
              </div>

              {reportLoading && <p className="iv-report-llm-loading">⏳ 面试教练正在归纳整场表现…</p>}
              {reportError && (
                <p className="iv-report-llm-err">⚠️ AI 总评生成失败:{reportError} —— 下方本地统计仍然有效。</p>
              )}
              {report.llm && (
                <div className="iv-report-llm">
                  {report.llm.overallSummary && <p className="iv-report-sum">{report.llm.overallSummary}</p>}
                  {report.llm.highlights?.length > 0 && (
                    <div className="iv-report-sec">
                      <strong>✅ 整场亮点</strong>
                      <ul>{report.llm.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
                    </div>
                  )}
                  {report.llm.commonWeaknesses?.length > 0 && (
                    <div className="iv-report-sec">
                      <strong>⚠️ 跨题共性弱点</strong>
                      <ul>{report.llm.commonWeaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul>
                    </div>
                  )}
                  {report.llm.practiceAdvice?.length > 0 && (
                    <div className="iv-report-sec">
                      <strong>🎯 下一步训练建议</strong>
                      <ul>{report.llm.practiceAdvice.map((a, i) => <li key={i}>{a}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}

              {report.stats.weakQuestions.length > 0 && (
                <div className="iv-report-weak">
                  <span>🔁 低分 / 超时 / 未回应追问的题,值得再练一遍</span>
                  <button className="btn-ghost" onClick={addWeakToFavorites}>
                    ☆ 一键送进收藏夹({report.stats.weakQuestions.length})
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 面试官资料徽标 */}
          {ctxBadge && (
            <div className="iv-ctx-badge">
              🎙️ 本次面试官已掌握：
              <b>职位「{ctxBadge.title}」</b>
              {ctxBadge.hasJd && <span className="iv-badge-chip">已读 JD</span>}
              {ctxBadge.resumeName && <span className="iv-badge-chip">已读简历「{ctxBadge.resumeName}」</span>}
            </div>
          )}

          {/* 题目导航 */}
          <div className="iv-nav">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
              第 {currentQuestionIndex + 1} / {questions.length}
              {timeLimitSec > 0 && !timeUp && timeLeft != null && (
                <span className={`iv-timer${timeLeft <= 15 ? ' warn' : ''}`}>⏱ {timerLabel}</span>
              )}
              {timeLimitSec > 0 && timeUp && <span className="iv-timer expired">⏰ 时间到</span>}
            </span>
            <div>
              <button className="btn-ghost" onClick={previousQuestion} disabled={currentQuestionIndex === 0}>← 上一题</button>
              <button className="btn-ghost" onClick={nextQuestion} disabled={currentQuestionIndex === questions.length - 1}>下一题 →</button>
            </div>
          </div>

          <div className="interview-card">
            <div className="iv-q-badges">
              <span className={`iv-q-type ${currentQuestion.type === 'behavioral' || currentQuestion.type === 'resume-drill' ? 'blue' : 'orange'}`}>
                {currentQuestion.type === 'resume-drill'
                  ? '深挖'
                  : currentQuestion.type === 'behavioral' ? '行为面' : currentQuestion.type === 'technical' ? '技术面' : '综合'}
              </span>
              <span className="iv-q-cat">{currentQuestion.category || '面试题'}</span>
              {DIFF_META[normDiff(currentQuestion.difficulty)] && (
                <span className={`iv-q-diff ${DIFF_META[normDiff(currentQuestion.difficulty)].cls}`}>
                  {DIFF_META[normDiff(currentQuestion.difficulty)].label}
                </span>
              )}
              {currentQuestion.fromExperience && (
                <span className="iv-q-exp">📌 针对「{currentQuestion.fromExperience}」</span>
              )}
              {tts.supported && (
                <button
                  type="button"
                  className="iv-tts-btn"
                  style={{ marginLeft: 'auto' }}
                  onClick={toggleReadQuestion}
                  title="让 AI 面试官朗读本题(浏览器本地语音合成)"
                >
                  {tts.speaking ? '⏹ 停止朗读' : '🔊 面试官读题'}
                </button>
              )}
              {!favSet.has(String(currentQuestion.question || '').trim()) && (
                <select
                  className="iv-fav-folder-select"
                  value={favFolder}
                  onChange={(e) => setFavFolder(e.target.value)}
                  title="选择收藏目标文件夹(在个人中心可自建收藏夹)"
                  aria-label="收藏目标文件夹"
                >
                  {listFolderNames().map((name) => (
                    <option key={name} value={name === DEFAULT_FOLDER ? "" : name}>{`📁 ${name}`}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                className={`iv-fav-btn${favSet.has(String(currentQuestion.question || '').trim()) ? ' on' : ''}`}
                style={{ marginLeft: tts.supported ? '0' : 'auto' }}
                onClick={toggleFavorite}
                title={favSet.has(String(currentQuestion.question || '').trim()) ? '取消收藏' : `收藏到「${favFolder || DEFAULT_FOLDER}」，可在个人中心反复再练`}
              >
                {favSet.has(String(currentQuestion.question || '').trim()) ? '★ 已收藏' : '☆ 收藏本题'}
              </button>
            </div>

            <p className="iv-q-text"><strong>问：</strong> {currentQuestion.question}</p>

            {currentQuestion.answerFramework && (
              <p className="muted iv-q-framework">💡 建议用 {currentQuestion.answerFramework} 结构组织你的回答</p>
            )}
            {currentQuestion.drillHint && (
              <p className="iv-q-drill">🔎 面试官可能继续追问：{currentQuestion.drillHint}</p>
            )}
            {refTips && (
              <div className="iv-ref">
                <button type="button" className="iv-ref-toggle" onClick={toggleReference}>
                  {revealedRef ? '收起参考思路 ▲' : '💡 参考思路（卡住了可先看，再试着用自己的话答）'}
                </button>
                {revealedRef && (
                  <div className="iv-ref-body">
                    {refTips.summary && (
                      <p className="iv-ref-sum"><strong>考察点：</strong>{refTips.summary}</p>
                    )}
                    {Array.isArray(refTips.keyPoints) && refTips.keyPoints.length > 0 && (
                      <div>
                        <strong>答题要点：</strong>
                        <ul>{refTips.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>
                      </div>
                    )}
                    {refTips.sample && (
                      <p className="iv-ref-sample"><strong>示范（先自答再对照）：</strong>{refTips.sample}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Answer Input:首答(提交后定稿,进入面试官追问) */}
          <div className="iv-answer">
            <label>你的回答{firstAnswerSubmitted ? ' · 已定稿' : ''}</label>
            <textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="可打字，或点下方「🎤 用语音作答」直接口述——识别结果会自动填入，可再修改..."
              rows={6}
              disabled={firstAnswerSubmitted}
            />

            {!firstAnswerSubmitted && renderVoicePanel("first")}

            {!firstAnswerSubmitted && (
              <div className="iv-answer-actions">
                <button
                  className="btn-primary"
                  onClick={submitFirstAnswer}
                  disabled={loading || followUpLoading || !userAnswer.trim() || voice.state !== 'idle'}
                >
                  {followUpLoading ? '⏳ 面试官思考追问中…' : '✅ 回答完毕 · 听面试官追问'}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => { track("interview_followup_skipped", {}); evaluateUserAnswer(); }}
                  disabled={loading || followUpLoading || !userAnswer.trim() || voice.state !== 'idle'}
                >
                  不看追问，直接获取反馈
                </button>
                <span className="iv-answer-side">行为题建议按 STAR：情境→任务→行动→结果</span>
              </div>
            )}
          </div>

          {/* Interviewer follow-up（P2 真人面试循环）:基于首答自动追问一层,补答后综合评估 */}
          {firstAnswerSubmitted && (followUpLoading || followUp) && (
            <div className="iv-followup">
              <div className="iv-followup-head">
                <span className="iv-followup-cap">🗣 面试官追问</span>
                {followUp?.angle && <span className="iv-followup-angle">{followUp.angle}</span>}
                {followUp && tts.supported && (
                  <button
                    type="button"
                    className="iv-tts-btn"
                    style={{ marginLeft: 'auto' }}
                    onClick={toggleReadFollowUp}
                    title="让 AI 面试官念出追问"
                  >
                    {tts.speaking ? '⏹ 停止朗读' : '🔊 念出追问'}
                  </button>
                )}
              </div>
              {followUpLoading && <p className="iv-followup-text muted">面试官正在针对你的回答组织追问…</p>}
              {followUp && (
                <>
                  <p className="iv-followup-text">{followUp.question}</p>
                  <label className="iv-followup-label">你的补充回答（会与首答一起综合评估，可留空）</label>
                  <textarea
                    className="iv-followup-answer"
                    value={followUpAnswer}
                    onChange={(e) => setFollowUpAnswer(e.target.value)}
                    placeholder="例如：补充数据来源、你个人的具体动作、当时没来得及说的细节…"
                    rows={4}
                  />
                  {renderVoicePanel("followup")}
                </>
              )}
            </div>
          )}

          {/* 评估按钮(追问阶段):获取综合反馈 / 返回修改首答 */}
          {firstAnswerSubmitted && (
            <div className="iv-answer-actions" style={{ marginBottom: '20px' }}>
              <button className="btn-primary" onClick={evaluateUserAnswer} disabled={loading || followUpLoading || voice.state !== 'idle'}>
                {loading ? '⏳ 正在评估...' : '获取 AI 反馈'}
              </button>
              <button
                className="btn-ghost"
                onClick={() => { setFirstAnswerSubmitted(false); setFollowUp(null); setError(null); }}
                disabled={loading || followUpLoading}
              >
                ← 返回修改我的回答
              </button>
              {followUp && (
                <span className="iv-answer-side">不想回应追问？可直接点「获取 AI 反馈」，评估会提示你补练接话</span>
              )}
            </div>
          )}

          {/* Evaluation Results(Tab 化:反馈/简历对照/追问应对/参考答案) */}
          {evaluation && (
            <div className="iv-eval">
              <div className="iv-eval-tabs" role="tablist" aria-label="评估结果分组">
                <button type="button" role="tab" aria-selected={evalTab === 'feedback'} className={`iv-eval-tab${evalTab === 'feedback' ? ' active' : ''}`} onClick={() => setEvalTab('feedback')}>
                  📊 反馈{typeof evaluation.score === 'number' ? ` · ${evaluation.score}` : ''}
                </button>
                {ctxRef.current?.resumeBrief && (
                  <button type="button" role="tab" aria-selected={evalTab === 'consistency'} className={`iv-eval-tab${evalTab === 'consistency' ? ' active' : ''}`} onClick={() => setEvalTab('consistency')}>
                    🔍 简历对照{consistency ? ` · ${(CONS_VERDICT[consistency.verdict] || CONS_VERDICT.minor).text}` : ''}
                  </button>
                )}
                {(followUp?.question || curRecord?.followUp) && (
                  <button type="button" role="tab" aria-selected={evalTab === 'followup'} className={`iv-eval-tab${evalTab === 'followup' ? ' active' : ''}`} onClick={() => setEvalTab('followup')}>
                    🗣 追问应对
                  </button>
                )}
                {evaluation.improvedAnswer && (
                  <button type="button" role="tab" aria-selected={evalTab === 'reference'} className={`iv-eval-tab${evalTab === 'reference' ? ' active' : ''}`} onClick={() => setEvalTab('reference')}>
                    🌟 参考答案
                  </button>
                )}
              </div>

              {evalTab === 'feedback' && (
                <>
                  {evaluation.feedback && (
                    <p className="iv-eval-feedback"><strong>整体反馈：</strong>{evaluation.feedback}</p>
                  )}

                  {evaluation.authenticityNote && (
                    <div className="iv-eval-auth">🧾 真实性核查：{evaluation.authenticityNote}</div>
                  )}

                  {evaluation.strengths?.length > 0 && (
                    <div className="iv-eval-sec">
                      <strong className="iv-eval-ok">✅ 回答亮点：</strong>
                      <ul>{evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </div>
                  )}

                  {evaluation.improvements?.length > 0 && (
                    <div className="iv-eval-sec">
                      <strong className="iv-eval-impr">💡 待改进之处：</strong>
                      <ul>{evaluation.improvements.map((im, i) => <li key={i}>{im}</li>)}</ul>
                    </div>
                  )}

                  {evaluation.starCompliance !== undefined && (
                    <div className={`iv-eval-star ${evaluation.starCompliance ? 'ok' : 'warn'}`}>
                      <strong>STAR 结构符合度：</strong>{' '}
                      {evaluation.starCompliance ? '✅ 符合' : '⚠️ 可再加强'}
                    </div>
                  )}
                </>
              )}

              {evalTab === 'consistency' && ctxRef.current?.resumeBrief && (
                <>
                  <div className="iv-cons-actions">
                    <button className="btn-ghost" onClick={runConsistencyCheck} disabled={consistencyLoading}>
                      {consistencyLoading ? '⏳ 正在对照简历…' : consistency ? '🔄 重新对照' : '🔍 与简历对照矛盾点'}
                    </button>
                    <span className="iv-answer-side">把你的回答与简历原文逐点比对：提到但简历没有 / 声明了但说不清 / 明显矛盾</span>
                  </div>
                  {consistency && (
                    <div className={`iv-consistency v-${consistency.verdict}`}>
                      <div className="iv-cons-head">
                        <strong>{(CONS_VERDICT[consistency.verdict] || CONS_VERDICT.minor).icon} {(CONS_VERDICT[consistency.verdict] || CONS_VERDICT.minor).text}</strong>
                        {consistency.summary && <span className="iv-cons-summary">{consistency.summary}</span>}
                      </div>
                      {(consistency.items || []).map((it, i) => {
                        const kind = CONS_KIND[it.kind] || CONS_KIND.unclear;
                        return (
                          <div key={i} className="iv-cons-item">
                            <div className="iv-cons-item-head">
                              <span className="iv-cons-kind" style={{ color: kind.fg, background: kind.bg }}>{kind.label}</span>
                              <b>{it.point}</b>
                            </div>
                            {it.detail && <p className="iv-cons-detail">{it.detail}</p>}
                            {it.advice && <p className="iv-cons-advice">→ {it.advice}</p>}
                          </div>
                        );
                      })}
                      {(consistency.items || []).length === 0 && (
                        <p className="iv-cons-detail">没有发现明显矛盾点 —— 回答与简历内容吻合，继续保持。</p>
                      )}
                      <p className="iv-cons-note">护栏：对照只提示「核实或补充」，绝不建议编造；简历没写全的经历可以补进简历，但面试里说的必须是真的。</p>
                    </div>
                  )}
                </>
              )}

              {evalTab === 'followup' && (() => {
                const fu = followUp?.question ? followUp : curRecord?.followUp;
                if (!fu) return null;
                return (
                  <div className="iv-eval-sec">
                    <div className="iv-followup">
                      <p style={{ margin: 0, fontWeight: 600 }}>🗣 面试官追问{fu.angle ? `（${fu.angle}）` : ""}：{fu.question}</p>
                      {fu.answer ? (
                        <p style={{ margin: '6px 0 0' }}><strong>我的补答：</strong>{fu.answer}</p>
                      ) : (
                        <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>（未回应追问——真实面试里接不住追问很扣分，建议补练「被追问时如何接话」）</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {evalTab === 'reference' && evaluation.improvedAnswer && (
                <div className="iv-eval-sec">
                  <strong>🌟 参考答案示例：</strong>
                  <p className="iv-eval-ref">{evaluation.improvedAnswer}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 侧栏 · 会话仪表盘:全部题目进度 + 跳题 + 倒计时 */}
        <aside className="iv-practice-side">
          <div className="iv-side-card">
            <p className="iv-side-cap">会话进度</p>
            {questions.map((q, i) => {
              const rec = sessionRecords.find((r) => r.question === q.question);
              const isCur = i === currentQuestionIndex;
              let dotCls = "todo";
              let right = isCur ? "作答中" : "—";
              if (rec) {
                right = typeof rec.score === "number" ? rec.score.toFixed(1) : "已答";
                dotCls = typeof rec.score === "number"
                  ? (rec.score >= 7 ? "good" : rec.score >= 5 ? "mid" : "bad")
                  : "done";
                if (isCur && typeof rec.score !== "number") right = "作答中";
              }
              const catLabel = q.category
                || (q.type === 'technical' ? '技术面' : q.type === 'behavioral' ? '行为面' : q.type === 'resume-drill' ? '深挖' : '题目');
              return (
                <button key={i} type="button" className={`iv-side-item${isCur ? " cur" : ""}`} onClick={() => jumpToQuestion(i)} aria-current={isCur ? "step" : undefined}>
                  <span className={`iv-dot ${dotCls}`} />
                  <span className="iv-side-item-label">Q{i + 1} {catLabel.length > 6 ? `${catLabel.slice(0, 6)}…` : catLabel}</span>
                  <span className="iv-side-item-score">{right}</span>
                </button>
              );
            })}
          </div>

          {timeLimitSec > 0 && (
            <div className="iv-side-card iv-side-timer">
              <p className="iv-side-cap">作答倒计时</p>
              <b className={`iv-side-clock${timeLeft != null && timeLeft <= 15 ? " danger" : ""}`}>
                {timerLabel || TIME_LIMIT_LABEL(timeLimitSec)}
              </b>
            </div>
          )}

          <div className="iv-side-card">
            <p className="iv-side-cap">题目导航</p>
            <div className="iv-side-nav">
              <button className="btn-ghost" onClick={previousQuestion} disabled={currentQuestionIndex === 0}>← 上一题</button>
              <button className="btn-ghost" onClick={nextQuestion} disabled={currentQuestionIndex === questions.length - 1}>下一题 →</button>
            </div>
            <p className="iv-side-note">已答 {sessionRecords.length}/{questions.length} 题{sessionSaved ? " · ✅ 已保存" : ""}</p>
          </div>
        </aside>
        </div>
      )}

      {questions.length === 0 && !loading && (
        <div className="empty-state">
          <p>设定职位与资料包，点击「开始面试」生成题目。结合 JD 与简历的模拟面试最接近真实投递。</p>
        </div>
      )}
    </section>
  );
}
