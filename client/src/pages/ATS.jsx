import PageHead from "../components/PageHead";
import ResumePicker from "../components/ResumePicker";
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import * as api from "../utils/api";
import { track } from "../utils/analytics";
import { addAtsRecord } from "../utils/historyStore";
import { getActiveVersion, listVersions, updateVersionData } from "../utils/resumeStore";
import { loadDraft, saveDraft, clearDraft } from "../utils/draftStore";

// 语义匹配级别的展示配置
const LEVEL_META = {
  full:    { label: '完全匹配', color: '#155724', bg: '#d4edda' },
  partial: { label: '部分匹配', color: '#856404', bg: '#fff3cd' },
  missing: { label: '未体现',   color: '#721c24', bg: '#f8d7da' },
};

/** 文本归一化:去空白/标点/大小写,用于证据原文 → bullet 的宽松定位 */
const normText = (s) => String(s || '').toLowerCase().replace(/[\s,，。;；:：''""()（）·、.!！?？\-—]+/g, '');/** 语义诊断的 evidence → 简历 bullet 坐标:归一化后双向包含即认为命中;找不到返回 null */
function findBulletByEvidence(resumeData, evidence) {
  if (!resumeData || !evidence) return null;
  const ev = normText(evidence);
  if (ev.length < 4) return null;
  const exps = Array.isArray(resumeData.experience) ? resumeData.experience : [];
  for (let ei = 0; ei < exps.length; ei++) {
    const bullets = exps[ei]?.bullets || [];
    for (let bi = 0; bi < bullets.length; bi++) {
      const b = normText(bullets[bi]);
      if (b && (b.includes(ev) || ev.includes(b))) return { expIndex: ei, bulletIndex: bi };
    }
  }
  return null;
}

export default function ATS() {
  const navigate = useNavigate();
  const [jobDesc, setJobDesc] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [analysis, setAnalysis] = useState(null);      // 基础分析（关键词 + 分数）
  const [semantic, setSemantic] = useState(null);      // 增量1：语义匹配
  const [verification, setVerification] = useState(null); // 增量2：建议 verifier
  const [error, setError] = useState(null);
  const [resumeData, setResumeData] = useState(null);
  const [resumeVersion, setResumeVersion] = useState(null); // 本次诊断基于的简历版本
  const [restoredTip, setRestoredTip] = useState(false);    // 恢复草稿后的一次性提示
  const [stage, setStage] = useState({ basic: 'idle', semantic: 'idle' }); // 两层分析执行状态:idle|running|done|failed
  const [rewriteModal, setRewriteModal] = useState(null); // 改写模态:{ req, target, exp, bullet, rewritten, busy, error }
  const [appliedTip, setAppliedTip] = useState(false);    // 改写写回成功后的一次性提示
  const [resultTab, setResultTab] = useState('requirements'); // 结果分层 Tab:requirements|actions|keywords

  const hasWork = !!(jobDesc.trim() || analysis || semantic || verification);

  // Load resume data on mount：优先恢复上次未完成的诊断草稿（静默），否则用激活版本
  useEffect(() => {
    try {
      const versions = listVersions();
      const active = getActiveVersion();
      const useVersion = (v) => {
        if (v && v.data && !v.data.empty) {
          setResumeVersion(v);
          setResumeData(v.data);
        }
      };

      // 1) 有草稿 → 恢复现场（JD 输入 + 诊断结果 + 当时所用简历版本）
      const draft = loadDraft("ats");
      if (draft && (draft.jobDesc || draft.analysis)) {
        if (draft.jobDesc) setJobDesc(draft.jobDesc);
        const target = versions.find((x) => x.id === draft.resumeId) || active;
        useVersion(target);
        if (draft.analysis) setAnalysis(draft.analysis);
        if (draft.semantic) setSemantic(draft.semantic);
        if (draft.verification) setVerification(draft.verification);
        if (draft.jobDesc || draft.analysis) setRestoredTip(true);
        return;
      }

      // 2) 无草稿 → 优先当前激活版本，其次旧的单版本字段
      useVersion(active);
      const saved = localStorage.getItem('resumeData');
      if (saved) {
        const data = JSON.parse(saved);
        if (!data.empty && !resumeData) setResumeData(data);
      }
    } catch (err) {
      console.error('读取本地简历数据失败:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 防抖自动保存工作区：输入与任一结果变化后 600ms 落盘；全空则清除草稿
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasWork) {
        clearDraft("ats");
        return;
      }
      saveDraft("ats", {
        resumeId: resumeVersion?.id || "",
        resumeName: resumeVersion?.name || "",
        jobDesc,
        analysis,
        semantic,
        verification,
      });
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobDesc, analysis, semantic, verification, resumeVersion, hasWork]);

  /** 清空本页工作区，开始一次新诊断（个人中心历史不受影响） */
  const clearWorkspace = () => {
    if (hasWork && !window.confirm("清空本页的 JD 与诊断结果，重新开始？已保存的个人中心历史不受影响。")) return;
    setJobDesc("");
    setAnalysis(null);
    setSemantic(null);
    setVerification(null);
    setError(null);
    setRestoredTip(false);
    const active = getActiveVersion();
    if (active && active.data && !active.data.empty) {
      setResumeVersion(active);
      setResumeData(active.data);
    } else {
      setResumeVersion(null);
      setResumeData(null);
    }
    clearDraft("ats");
  };

  // 用户在顶部切换「本次诊断基于哪份简历」：只影响本次，不写穿激活版本
  const handleVersionChange = (v) => {
    setResumeVersion(v);
    if (v && v.data && !v.data.empty) {
      setResumeData(v.data);
      setError(null);
    } else {
      setResumeData(null);
      setError('该版本尚未填写内容，请先在「编辑器」中完善后再做诊断。');
    }
  };

  /** 结果区入口：带着当前 JD 与简历去模拟面试（面试页自动预填） */
  const goInterviewWithJd = () => {
    navigate('/interview', {
      state: {
        jd: jobDesc,
        resumeId: resumeVersion?.id || "",
        resumeName: resumeVersion?.name || "",
      },
    });
  };

  const analyze = async () => {
    if (!jobDesc.trim()) {
      setError("请先粘贴职位描述");
      return;
    }
    if (!resumeData) {
      setError("未找到简历数据，请先在「编辑器」中创建简历");
      return;
    }

    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    setSemantic(null);
    setVerification(null);
    setAppliedTip(false);
    setStage({ basic: 'running', semantic: 'running' });

    // 分阶段呈现:两个请求独立 resolve,谁先回来谁先上屏,不再等最慢的
    const basicPromise = api.analyzeATS({ resumeData, jobDescription: jobDesc })
      .then((basicResult) => {
        const score = basicResult.atsScore ?? basicResult.overallScore ?? basicResult.score ?? 0;
        setAnalysis({ ...basicResult, displayScore: score });
        setStage((s) => ({ ...s, basic: 'done' }));
        track("ats_analyze", { score });
        return basicResult;
      })
      .catch((err) => {
        setStage((s) => ({ ...s, basic: 'failed' }));
        throw err;
      });

    const semanticPromise = api.semanticMatch({ resumeData, jobDescription: jobDesc })
      .then((semanticResult) => {
        setSemantic(semanticResult);
        setStage((s) => ({ ...s, semantic: 'done' }));
        return semanticResult;
      })
      .catch((err) => {
        setStage((s) => ({ ...s, semantic: 'failed' }));
        throw err;
      });

    const settled = await Promise.allSettled([basicPromise, semanticPromise]);
    const basicResult = settled[0].status === 'fulfilled' ? settled[0].value : null;
    const semanticResult = settled[1].status === 'fulfilled' ? settled[1].value : null;
    setAnalyzing(false);

    if (!basicResult && !semanticResult) {
      const reason = settled.find((x) => x.status === 'rejected')?.reason;
      track("ats_analyze_fail", { reason: String(reason?.message || reason || '').slice(0, 120) });
      setError(`分析失败: ${reason?.message || reason || '未知错误'}`);
      return;
    }
    if (!basicResult) {
      setError('关键词层分析失败(语义层结果正常),可稍后重新诊断补齐。');
    }

    // 建议质量校验:后台执行,不阻塞结果展示(「校验中…」状态已在卡片上呈现)
    const suggestionsToVerify = (semanticResult?.priorityActions || []).filter(Boolean);
    if (suggestionsToVerify.length > 0) {
      (async () => {
        try {
          setVerifying(true);
          // verifier 聚焦「必须项」缺失:bonus 加分项不作为补强重点
          const missingKw = Array.isArray(basicResult?.missingKeywordTiers) && basicResult.missingKeywordTiers.length > 0
            ? basicResult.missingKeywordTiers.filter((x) => x.tier !== 'bonus').map((x) => x.term)
            : (basicResult?.missingKeywords)
              || (semanticResult?.requirements || []).filter((r) => r.matchLevel === 'missing').map((r) => r.requirement);
          const verifyResult = await api.verifySuggestions({
            resumeData,
            jobDescription: jobDesc,
            suggestions: suggestionsToVerify,
            missingKeywords: missingKw,
          });
          setVerification(verifyResult);
          // 建议质量校验通过率（AI 诚实性护栏的运行证据）
          if (verifyResult && Array.isArray(verifyResult.results) && verifyResult.results.length > 0) {
            const passed = verifyResult.results.filter((r) => r.verified === true).length;
            track("ats_verify", {
              total: verifyResult.results.length,
              passed,
              flagged: verifyResult.results.length - passed,
            });
          }
        } catch (vErr) {
          console.error('建议校验失败:', vErr);
          setVerification(null);
        } finally {
          setVerifying(false);
        }
      })();
    }

    // 自动保存到历史记录(基础层成功才记,避免失败轮污染分数趋势;verifier 后台跑,summary 先留空)
    if (basicResult) {
      try {
        const jdFirstLine = (jobDesc || "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) || "";
        const record = addAtsRecord({
          jdTitle: jdFirstLine.slice(0, 40),
          jdPreview: (jobDesc || "").trim().slice(0, 80),
          resumeId: resumeVersion?.id || "",
          resumeName: resumeVersion?.name || "",
          score: basicResult.displayScore,
          categoryScores: basicResult.categoryScores || null,
          missingKeywords: Array.isArray(basicResult.missingKeywords) ? basicResult.missingKeywords
            : (semanticResult?.requirements || []).filter((r) => r.matchLevel === 'missing').map((r) => r.requirement),
          matchedKeywords: basicResult.matchedKeywords || [],
          priorityActions: semanticResult?.priorityActions || [],
          overallAssessment: semanticResult?.overallAssessment || "",
          verifySummary: "",
        });
        track("ats_history_save", { score: record?.score ?? basicResult.displayScore });
      } catch (saveErr) {
        console.error('保存 ATS 历史失败:', saveErr);
      }
    }
  };

  /** 打开改写模态:req 为语义诊断条目,target 为 evidence 定位到的 bullet 坐标 */
  const openRewrite = (req, target) => {
    const exp = resumeData?.experience?.[target.expIndex];
    const bullet = exp?.bullets?.[target.bulletIndex] || "";
    if (!bullet.trim()) return;
    setRewriteModal({ req, target, exp, bullet, rewritten: '', busy: false, error: null });
    track("ats_rewrite_open", { matchLevel: req.matchLevel });
  };

  /** 调 AI 护栏改写:只重写措辞,不新增事实 */
  const runRewrite = async () => {
    const rm = rewriteModal;
    if (!rm || rm.busy) return;
    setRewriteModal({ ...rm, busy: true, error: null });
    try {
      const startedAt = Date.now();
      const r = await api.rewriteForJd({
        bullet: rm.bullet,
        requirement: rm.req.requirement,
        suggestion: rm.req.suggestion,
        jobDescription: jobDesc,
      });
      setRewriteModal((prev) => ({ ...prev, rewritten: r.rewritten || '', busy: false }));
      track("ats_rewrite_generate", { ms: Date.now() - startedAt });
    } catch (err) {
      setRewriteModal((prev) => ({ ...prev, busy: false, error: `改写失败: ${err.message}` }));
      track("ats_rewrite_fail", { reason: String(err.message || err).slice(0, 120) });
    }
  };

  /** 应用改写:写回该简历版本的对应 bullet(resumeStore 定向更新),本地状态同步 */
  const applyRewrite = () => {
    const rm = rewriteModal;
    if (!rm || !rm.rewritten) return;
    const updated = updateVersionData(resumeVersion?.id, (data) => {
      const exps = Array.isArray(data.experience) ? [...data.experience] : [];
      if (exps[rm.target.expIndex]) {
        const bullets = [...(exps[rm.target.expIndex].bullets || [])];
        bullets[rm.target.bulletIndex] = rm.rewritten;
        exps[rm.target.expIndex] = { ...exps[rm.target.expIndex], bullets };
      }
      return { ...data, experience: exps };
    });
    setRewriteModal(null);
    if (updated) {
      setResumeData(updated.data);
      setResumeVersion((v) => (v ? { ...v, data: updated.data } : v));
      setAppliedTip(true);
      track("ats_rewrite_apply", {});
    } else {
      setError('写回简历失败:未找到对应简历版本,请重试。');
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#FF9800';
    return '#f44336';
  };

  const categoryLabels = {
    technicalSkills: '专业技能',
    experience: '经验匹配',
    keywords: '关键词覆盖',
  };

  // 把 verifier 结果按 index 映射到 priorityActions
  const verifiedMap = {};
  if (verification && Array.isArray(verification.results)) {
    verification.results.forEach((r) => { verifiedMap[r.index] = r; });
  }

  // 结果 Tab:仅展示有数据的层;当前 Tab 无数据时自动回落到第一个可用层
  const tabsAvailable = [];
  if (semantic?.requirements?.length > 0) tabsAvailable.push('requirements');
  if (semantic?.priorityActions?.length > 0) tabsAvailable.push('actions');
  if (analysis) tabsAvailable.push('keywords');
  const effectiveTab = tabsAvailable.includes(resultTab) ? resultTab : (tabsAvailable[0] || 'requirements');
  const actionsMeta = verifying
    ? '校验中…'
    : (verification?.results?.length > 0
      ? `${verification.results.filter((r) => r.verified === true).length}/${verification.results.length} 通过`
      : `${semantic?.priorityActions?.length || 0} 条`);

  return (
    <section>
      <PageHead
        kicker="打磨优化"
        title="JD 匹配诊断"
        icon="🎯"
        sub="左侧粘贴 JD,右侧实时呈现:关键词层 + 语义逐条诊断 + 建议质量校验,发现缺口可直接一键改写。"
      />

      {/* 恢复提示（一次性、可关闭） */}
      {restoredTip && (
        <div className="notice notice-ok" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <span>🔄 已恢复上次离开时的内容 —— 本页现场会自动保存在本机，随时可以放心切换页面。</span>
          <button className="btn-ghost" style={{ fontSize: '12px', padding: '2px 10px', flexShrink: 0 }} onClick={() => setRestoredTip(false)}>知道了</button>
        </div>
      )}

      {/* 改写写回提示(一次性、可关闭) */}
      {appliedTip && (
        <div className="notice notice-ok" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span>✏️ 改写已写回简历「{resumeVersion?.name || '当前简历'}」——可去编辑器查看,或重新诊断验证效果。</span>
          <span style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button className="btn-ghost" style={{ fontSize: '12px', padding: '2px 10px' }} onClick={() => navigate('/editor')}>去编辑器 →</button>
            <button className="btn-ghost" style={{ fontSize: '12px', padding: '2px 10px' }} onClick={() => setAppliedTip(false)}>知道了</button>
          </span>
        </div>
      )}

      {!resumeData && (
        <div className="notice notice-warn" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <span>⚠️ 未找到可用的简历数据，请先在「编辑器」中创建或完善简历。</span>
          <Link to="/import" className="btn-ghost" style={{ fontSize: '12px', padding: '4px 12px', flexShrink: 0 }}>
            📥 去导入简历
          </Link>
        </div>
      )}

      {/* ===== 双栏诊断工作台:左输入(sticky) / 右结果仪表盘 ===== */}
      <div className="ats-workbench">
        <aside className="ats-input-panel">
          <div className="ats-panel">
            <div className="ats-panel-title">
              <span>🎯 诊断输入</span>
              {hasWork && (
                <button className="btn-ghost" style={{ fontSize: '12px', padding: '2px 8px' }} onClick={clearWorkspace}>🗑 清空</button>
              )}
            </div>

            {/* 匹配对象:本次诊断基于哪份简历(多版本下显式声明,消除歧义) */}
            {resumeVersion && (
              <div style={{ marginTop: '12px' }}>
                <ResumePicker version={resumeVersion} onChange={handleVersionChange} label="本次诊断基于的简历" />
              </div>
            )}

            <div style={{ marginTop: '12px' }}>
              <div className="ats-box-head" style={{ marginBottom: '8px' }}>
                <span>📋 职位描述（JD）</span>
                <span className="ats-box-hint">{jobDesc.trim() ? `${jobDesc.trim().length} 字` : '粘贴完整 JD 更准'}</span>
              </div>
              <textarea
                className="ats-input"
                placeholder="在此粘贴职位描述（JD）..."
                value={jobDesc}
                onChange={(e) => setJobDesc(e.target.value)}
                rows={10}
              />
            </div>

            <button className="btn btn-primary" style={{ marginTop: '12px', width: '100%' }} onClick={analyze} disabled={analyzing || !resumeData}>
              {analyzing ? '⏳ 分析中…' : '🎯 开始匹配诊断'}
            </button>
            {!resumeData && (
              <span className="ats-box-hint" style={{ marginTop: '8px' }}>需要先在编辑器或导入页准备一份简历</span>
            )}

            {/* 分层进度:idle 灰 / running 橙脉冲 / done 绿 / failed 红 */}
            {(analyzing || verifying) && (
              <div className="ats-stage-list" style={{ marginTop: '14px' }}>
                <div className={`ats-stage-item ${stage.basic}`}><span className="ats-stage-dot" />关键词层匹配</div>
                <div className={`ats-stage-item ${stage.semantic}`}><span className="ats-stage-dot" />语义逐条诊断</div>
                {verifying && <div className="ats-stage-item running"><span className="ats-stage-dot" />建议质量校验</div>}
              </div>
            )}
          </div>
        </aside>

        <div style={{ minWidth: 0 }}>
          {error && (
            <div className="notice notice-err" style={{ marginBottom: '14px' }}>{error}</div>
          )}

          {(analysis || semantic) ? (
            <div className="ats-result">

          {/* 得分 hero:环形匹配分 + 分维度 + 语义总评 */}
          {(analysis || semantic?.overallAssessment) && (
            <div className="ats-hero" style={{ marginBottom: '4px' }}>
              {analysis && (
                <div className="ats-score-ring">
                  <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">
                    <circle cx="46" cy="46" r="40" fill="none" stroke="#E8ECF1" strokeWidth="8" />
                    <circle
                      cx="46" cy="46" r="40" fill="none"
                      stroke={getScoreColor(analysis.displayScore)} strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${(analysis.displayScore / 100) * 251.3} 251.3`}
                    />
                  </svg>
                  <div className="ats-score-ring-value">
                    <strong style={{ fontSize: '24px', color: getScoreColor(analysis.displayScore) }}>{analysis.displayScore}</strong>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>匹配分</span>
                  </div>
                </div>
              )}
              <div style={{ flex: 1, minWidth: '220px' }}>
                {analysis?.categoryScores && (
                  <div className="ats-cat-chips" style={{ marginBottom: semantic?.overallAssessment ? '10px' : 0 }}>
                    {Object.entries(analysis.categoryScores).map(([key, value]) => (
                      <div key={key} className="ats-cat-chip">
                        {categoryLabels[key] || key}
                        <strong style={{ color: getScoreColor(value) }}>{value}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {semantic?.overallAssessment && (
                  <p style={{ fontSize: '13.5px', lineHeight: 1.7, color: '#334155', margin: 0 }}>
                    🧭 {semantic.overallAssessment}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 分层 Tab:逐条诊断 / 改进建议 / 关键词 */}
          <div className="ats-tabs" role="tablist">
            {tabsAvailable.includes('requirements') && (
              <button
                className={`ats-tab${effectiveTab === 'requirements' ? ' active' : ''}`}
                onClick={() => setResultTab('requirements')}
                role="tab"
                aria-selected={effectiveTab === 'requirements'}
              >
                📋 逐条诊断<span className="ats-tab-meta">{semantic.requirements.length} 条</span>
              </button>
            )}
            {tabsAvailable.includes('actions') && (
              <button
                className={`ats-tab${effectiveTab === 'actions' ? ' active' : ''}`}
                onClick={() => setResultTab('actions')}
                role="tab"
                aria-selected={effectiveTab === 'actions'}
              >
                ✅ 改进建议<span className="ats-tab-meta">{actionsMeta}</span>
              </button>
            )}
            {tabsAvailable.includes('keywords') && (
              <button
                className={`ats-tab${effectiveTab === 'keywords' ? ' active' : ''}`}
                onClick={() => setResultTab('keywords')}
                role="tab"
                aria-selected={effectiveTab === 'keywords'}
              >
                🔑 关键词<span className="ats-tab-meta">{analysis.matchedKeywords?.length || 0} 命中 · {analysis.missingKeywords?.length || 0} 缺失</span>
              </button>
            )}
          </div>

          {/* Tab 1:逐条职责语义匹配 */}
          {effectiveTab === 'requirements' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
              {semantic.requirements.map((req, i) => {
                const meta = LEVEL_META[req.matchLevel] || LEVEL_META.partial;
                // 有 evidence 且能定位到具体 bullet 才提供「去改写」;完全缺失(无证据)时改写无从下手,保持诚实
                const target = req.matchLevel !== 'full' && req.evidence ? findBulletByEvidence(resumeData, req.evidence) : null;
                const bonusHint = req.priority === 'bonus' && req.matchLevel === 'missing' ? '(加分项,不必为凑分硬编。)' : '';
                return (
                  <div key={i} style={{ padding: '14px 16px', background: '#fff', border: '1px solid #e0e0e0', borderLeft: `4px solid ${meta.color}`, borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span style={{ padding: '2px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: '600', background: meta.bg, color: meta.color }}>
                            {meta.label}
                          </span>
                          {req.priority === 'bonus' ? (
                            <span style={{ padding: '2px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: '600', background: '#ECEFF1', color: '#546E7A' }}>加分项</span>
                          ) : req.priority === 'must' ? (
                            <span style={{ padding: '2px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: '600', background: '#E8EAF6', color: '#3949AB' }}>必须项</span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: '500', lineHeight: 1.5 }}>{req.requirement}</div>
                      </div>
                      {target && (
                        <button
                          className="btn-ghost"
                          style={{ fontSize: '12px', padding: '4px 12px', flexShrink: 0 }}
                          onClick={() => openRewrite(req, target)}
                          title="AI 按护栏改写对应经历要点:只重写措辞,不新增事实"
                        >
                          ✏️ 去改写
                        </button>
                      )}
                    </div>
                    {req.evidence && (
                      <p style={{ fontSize: '13px', color: '#555', margin: '6px 0 0' }}>
                        <strong>证据：</strong>「{req.evidence}」
                      </p>
                    )}
                    {req.reasoning && (
                      <p style={{ fontSize: '13px', color: '#666', margin: '4px 0 0' }}>
                        <strong>判定理由：</strong>{req.reasoning}
                      </p>
                    )}
                    {req.suggestion && (
                      <p style={{ fontSize: '13px', color: '#0d47a1', margin: '6px 0 0', background: '#e3f2fd', padding: '6px 10px', borderRadius: '6px' }}>
                        💡 补强建议：{req.suggestion}{bonusHint}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 2:改进建议 + 质量独立校验 */}
          {effectiveTab === 'actions' && (
            <div style={{ marginTop: '16px' }}>
              <p style={{ fontSize: '13px', color: '#888', margin: '0 0 12px' }}>
                每条建议经独立校验：是否相关、是否具体可执行、是否诚实（不诱导编造经历）。
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {semantic.priorityActions.map((action, i) => {
                  const v = verifiedMap[i];
                  const pass = v?.verified === true;
                  return (
                    <li key={i} style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      borderLeft: `4px solid ${v ? (pass ? '#4CAF50' : '#f57c00') : '#9e9e9e'}`,
                      background: v ? (pass ? '#f1f8f4' : '#fff8e1') : '#f8f9fa',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: '14px', lineHeight: '1.6', flex: 1 }}>{action}</div>
                        {v && (
                          <span style={{
                            flexShrink: 0,
                            fontSize: '12px',
                            fontWeight: '600',
                            padding: '2px 10px',
                            borderRadius: '16px',
                            background: pass ? '#d4edda' : '#f8d7da',
                            color: pass ? '#155724' : '#721c24',
                          }}>
                            {pass ? '✓ 通过校验' : '⚠ 需人工复核'}
                          </span>
                        )}
                      </div>
                      {v?.reason && (
                        <p style={{ fontSize: '12px', color: '#777', margin: '6px 0 0' }}>{v.reason}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {verification?.summary && (
                <p style={{ fontSize: '13px', color: '#666', marginTop: '10px', fontStyle: 'italic' }}>
                  校验小结：{verification.summary}
                </p>
              )}
            </div>
          )}

          {/* Tab 3:关键词层匹配(命中 / 缺失,缺失按必须/加分分级) */}
          {effectiveTab === 'keywords' && (
            <div className="ats-metrics" style={{ marginTop: '16px' }}>
              <div>
                <strong style={{ fontSize: '15px', marginBottom: '8px', display: 'block' }}>✅ 已匹配关键词</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {analysis.matchedKeywords?.length > 0 ? (
                    analysis.matchedKeywords.map((keyword, i) => (
                      <span key={i} style={{ padding: '4px 12px', background: '#d4edda', color: '#155724', borderRadius: '16px', fontSize: '14px' }}>{keyword}</span>
                    ))
                  ) : (
                    <p style={{ color: '#666' }}>暂无已匹配关键词</p>
                  )}
                </div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <strong style={{ fontSize: '15px', marginBottom: '8px', display: 'block' }}>❌ 缺失关键词 / 能力</strong>
                {(() => {
                  // 优先用分级明细(必须/加分);旧结果无明细时全部按必须项展示
                  const tiers = Array.isArray(analysis.missingKeywordTiers) && analysis.missingKeywordTiers.length > 0
                    ? analysis.missingKeywordTiers
                    : (analysis.missingKeywords || []).map((t) => ({ term: t, tier: 'must' }));
                  if (tiers.length === 0) {
                    return <p style={{ color: '#666' }}>所有关键词均已匹配！</p>;
                  }
                  const must = tiers.filter((t) => t.tier !== 'bonus');
                  const bonus = tiers.filter((t) => t.tier === 'bonus');
                  return (
                    <>
                      {must.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {must.map((t, i) => (
                            <span key={`m${i}`} style={{ padding: '4px 12px', background: '#f8d7da', color: '#721c24', borderRadius: '16px', fontSize: '14px' }}>{t.term}</span>
                          ))}
                        </div>
                      )}
                      {bonus.length > 0 && (
                        <div style={{ marginTop: must.length > 0 ? '12px' : 0 }}>
                          <p style={{ fontSize: '13px', color: '#546E7A', margin: '0 0 8px' }}>
                            ☑ 以下为 JD 标注的「优先/加分」项 —— 不必为凑分硬编,可在面试中用学习路径自然补足:
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {bonus.map((t, i) => (
                              <span key={`b${i}`} style={{ padding: '4px 12px', background: '#ECEFF1', color: '#546E7A', borderRadius: '16px', fontSize: '14px' }}>{t.term}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* 入口：带着这份 JD 去模拟面试（演练闭环） */}
          <div style={{
            marginTop: '20px', padding: '14px 16px', background: '#f0f7ff',
            border: '1px solid #bfdbfe', borderRadius: '8px',
            display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '14px', color: '#1e40af', lineHeight: '1.6', flex: 1 }}>
              💡 诊断出的缺口,最好在面试前演练一遍 —— 带着这份 JD 和简历「{resumeVersion?.name || '当前简历'}」去模拟面试,让 AI 面试官按 JD 提问并深挖你的经历。
            </span>
            <button className="btn btn-primary" onClick={goInterviewWithJd}>
              🎤 去模拟面试 →
            </button>
          </div>
            </div>
          ) : analyzing ? (
            <div className="ats-result" style={{ textAlign: 'center', padding: '48px 22px' }}>
              <p style={{ fontSize: '15px', color: '#475569', margin: 0 }}>⏳ 正在深度分析 —— 结果将分层实时呈现</p>
            </div>
          ) : !error && (
            <div className="empty-state">
              <p>尚未分析。在左侧粘贴职位描述后点击「开始匹配诊断」。</p>
            </div>
          )}
        </div>
      </div>

      {/* ========== 一键改写模态:原 bullet vs AI 护栏改写 ========== */}
      {rewriteModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => { if (!rewriteModal.busy) setRewriteModal(null); }}
        >
          <div
            style={{ background: '#fff', borderRadius: '12px', maxWidth: '680px', width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '20px 22px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 6px', fontSize: '18px' }}>✏️ 按 JD 改写这条经历</h3>
            <p style={{ fontSize: '13px', color: '#666', margin: '0 0 14px' }}>
              改写护栏:AI 只重写措辞,把已有经历中与 JD 相关的部分讲得更清楚;不会新增任何事实。
            </p>

            <p style={{ fontSize: '13px', margin: '0 0 4px' }}>
              <strong>职位要求:</strong>{rewriteModal.req.requirement}
            </p>
            {rewriteModal.req.suggestion && (
              <p style={{ fontSize: '13px', color: '#0d47a1', margin: '0 0 12px' }}>💡 {rewriteModal.req.suggestion}</p>
            )}

            <div style={{ fontSize: '13px', margin: '0 0 4px', color: '#555' }}>
              <strong>原文</strong>(来自「{rewriteModal.exp?.position || '经历'} · {rewriteModal.exp?.company || ''}」):
            </div>
            <div style={{ fontSize: '14px', lineHeight: '1.6', background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
              {rewriteModal.bullet}
            </div>

            {rewriteModal.rewritten && (
              <>
                <div style={{ fontSize: '13px', margin: '0 0 4px', color: '#0d47a1' }}><strong>AI 改写</strong>:</div>
                <div style={{ fontSize: '14px', lineHeight: '1.6', background: '#e3f2fd', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                  {rewriteModal.rewritten}
                </div>
              </>
            )}

            {rewriteModal.busy && (
              <p style={{ fontSize: '13px', color: '#666', margin: '0 0 12px' }}>⏳ AI 正在按护栏改写…</p>
            )}
            {rewriteModal.error && (
              <p className="notice notice-err" style={{ margin: '0 0 12px' }}>{rewriteModal.error}</p>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {!rewriteModal.rewritten ? (
                <button className="btn btn-primary" onClick={runRewrite} disabled={rewriteModal.busy}>
                  {rewriteModal.busy ? '⏳ 改写中…' : '🪄 AI 按护栏改写'}
                </button>
              ) : (
                <>
                  <button className="btn-ghost" style={{ fontSize: '13px', padding: '6px 14px' }} onClick={runRewrite} disabled={rewriteModal.busy}>
                    🔄 换一版
                  </button>
                  <button className="btn btn-primary" onClick={applyRewrite} disabled={rewriteModal.busy}>
                    ✅ 应用到简历
                  </button>
                </>
              )}
              <button className="btn-ghost" style={{ fontSize: '13px', padding: '6px 14px' }} onClick={() => setRewriteModal(null)} disabled={rewriteModal.busy}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
