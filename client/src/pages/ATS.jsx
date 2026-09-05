import PageHead from "../components/PageHead";
import ResumePicker from "../components/ResumePicker";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../utils/api";
import { track } from "../utils/analytics";
import { addAtsRecord } from "../utils/historyStore";
import { getActiveVersion, listVersions } from "../utils/resumeStore";
import { loadDraft, saveDraft, clearDraft } from "../utils/draftStore";

// 语义匹配级别的展示配置
const LEVEL_META = {
  full:    { label: '完全匹配', color: '#155724', bg: '#d4edda' },
  partial: { label: '部分匹配', color: '#856404', bg: '#fff3cd' },
  missing: { label: '未体现',   color: '#721c24', bg: '#f8d7da' },
};

/** 结果区可折叠模块：标题行(标题 + 摘要徽标 + 箭头)整行可点，展开/收起内容 */
function AtsSection({ icon, title, meta, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`ats-sec${open ? " open" : ""}`}>
      <button
        type="button"
        className="ats-sec-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="ats-sec-title">{icon} {title}</span>
        {meta != null && meta !== "" && <span className="ats-sec-meta">{meta}</span>}
        <span className="ats-sec-arrow" aria-hidden="true">▸</span>
      </button>
      {open && <div className="ats-sec-body">{children}</div>}
    </div>
  );
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

    try {
      // 并行调用：基础关键词分析 + 语义级匹配诊断
      const [basicResult, semanticResult] = await Promise.all([
        api.analyzeATS({ resumeData, jobDescription: jobDesc }),
        api.semanticMatch({ resumeData, jobDescription: jobDesc }),
      ]);

      const score = basicResult.atsScore ?? basicResult.overallScore ?? basicResult.score ?? 0;
      setAnalysis({ ...basicResult, displayScore: score });
      setSemantic(semanticResult);
      track("ats_analyze", { score });

      // 自动对语义匹配给出的建议做质量校验（增量2）
      const suggestionsToVerify = (semanticResult.priorityActions || []).filter(Boolean);
      if (suggestionsToVerify.length > 0) {
        try {
          setVerifying(true);
          const missingKw = Array.isArray(basicResult.missingKeywords)
            ? basicResult.missingKeywords
            : (semanticResult.requirements || [])
                .filter(r => r.matchLevel === 'missing')
                .map(r => r.requirement);
          const verifyResult = await api.verifySuggestions({
            resumeText: JSON.stringify(resumeData),
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
      }

      // 自动保存到历史记录（个人中心可回看，含趋势数据）
      try {
        const jdFirstLine = (jobDesc || "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) || "";
        const record = addAtsRecord({
          jdTitle: jdFirstLine.slice(0, 40),
          jdPreview: (jobDesc || "").trim().slice(0, 80),
          resumeId: resumeVersion?.id || "",
          resumeName: resumeVersion?.name || "",
          score,
          categoryScores: basicResult.categoryScores || null,
          missingKeywords: Array.isArray(basicResult.missingKeywords) ? basicResult.missingKeywords
            : (semanticResult.requirements || []).filter((r) => r.matchLevel === 'missing').map((r) => r.requirement),
          matchedKeywords: basicResult.matchedKeywords || [],
          priorityActions: semanticResult?.priorityActions || [],
          overallAssessment: semanticResult?.overallAssessment || "",
          verifySummary: verification?.summary || "",
        });
        track("ats_history_save", { score: record?.score ?? score });
      } catch (saveErr) {
        console.error('保存 ATS 历史失败:', saveErr);
      }
    } catch (err) {
      track("ats_analyze_fail", { reason: String(err.message || err).slice(0, 120) });
      setError(`分析失败: ${err.message}`);
    } finally {
      setAnalyzing(false);
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

  return (
    <section>
      <PageHead
        kicker="打磨优化"
        title="JD 匹配诊断"
        icon="🎯"
        sub="粘贴目标职位描述，AI 将做两层分析：关键词层匹配 + 语义级逐条职责诊断，并对每条改进建议做独立质量校验。"
      />

      {/* 恢复提示（一次性、可关闭） */}
      {restoredTip && (
        <div className="notice notice-ok" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <span>🔄 已恢复上次离开时的内容 —— 本页现场会自动保存在本机，随时可以放心切换页面。</span>
          <button className="btn-ghost" style={{ fontSize: '12px', padding: '2px 10px', flexShrink: 0 }} onClick={() => setRestoredTip(false)}>知道了</button>
        </div>
      )}

      {/* 工作区工具行 */}
      {hasWork && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
          <button className="btn-ghost" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={clearWorkspace}>
            🗑 清空本页，重新开始
          </button>
        </div>
      )}

      {/* 匹配对象：本次诊断基于哪份简历（多版本下显式声明，消除歧义） */}
      {resumeVersion && (
        <div className="ats-context" style={{ marginBottom: '16px' }}>
          <ResumePicker version={resumeVersion} onChange={handleVersionChange} label="本次诊断基于的简历" />
        </div>
      )}

      {!resumeData && (
        <div className="notice notice-warn" style={{ marginBottom: '16px' }}>
          ⚠️ 未找到可用的简历数据，请先在「编辑器」中创建或完善简历。
        </div>
      )}

      <div className="ats-box">
        <div className="ats-box-head">
          <span>📋 职位描述（JD）</span>
          <span className="ats-box-hint">{jobDesc.trim() ? `${jobDesc.trim().length} 字` : "粘贴完整 JD 效果更准"}</span>
        </div>
        <textarea
          className="ats-input"
          placeholder="在此粘贴职位描述（JD）..."
          value={jobDesc}
          onChange={(e) => setJobDesc(e.target.value)}
          rows={8}
        />
        <div className="ats-box-actions">
          <button className="btn btn-primary" onClick={analyze} disabled={analyzing || !resumeData}>
            {analyzing ? '⏳ 正在深度分析…' : '🎯 开始匹配诊断'}
          </button>
          {!resumeData && (
            <span className="ats-box-hint">需要先在编辑器中准备一份简历</span>
          )}
        </div>
      </div>

      {error && (
        <div className="notice notice-err" style={{ marginTop: '14px' }}>
          {error}
        </div>
      )}

      {!analysis && !analyzing && !error && (
        <div className="empty-state">
          <p>尚未分析。粘贴职位描述后点击「开始匹配诊断」。</p>
        </div>
      )}

      {/* ========== 结果区 ========== */}
      {analysis && (
        <div className="ats-result">

          {/* 综合得分 + 语义总体评价 */}
          <h3 style={{ fontSize: '24px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            匹配得分：
            <strong style={{ color: getScoreColor(analysis.displayScore), fontSize: '32px' }}>
              {analysis.displayScore}
              <span style={{ fontSize: '20px' }}>/100</span>
            </strong>
          </h3>

          {semantic?.overallAssessment && (
            <div style={{ padding: '14px 16px', background: '#f0f7ff', borderLeft: '4px solid #2196F3', borderRadius: '4px', marginBottom: '24px', fontSize: '15px', lineHeight: '1.7' }}>
              <strong>🧭 语义总评：</strong> {semantic.overallAssessment}
            </div>
          )}

          {/* 分维度得分（基础层） */}
          {analysis.categoryScores && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              {Object.entries(analysis.categoryScores).map(([key, value]) => (
                <div key={key} style={{ padding: '12px', background: '#f5f5f5', borderRadius: '8px' }}>
                  <strong>{categoryLabels[key] || key}</strong>
                  <div style={{ fontSize: '20px', color: getScoreColor(value) }}>{value}/100</div>
                </div>
              ))}
            </div>
          )}

          {/* 增量1：逐条职责语义匹配 */}
          {semantic?.requirements && semantic.requirements.length > 0 && (
            <AtsSection
              icon="📋"
              title="逐条职责语义匹配"
              meta={(() => {
                const c = { full: 0, partial: 0, missing: 0 };
                semantic.requirements.forEach((r) => { if (c[r.matchLevel] != null) c[r.matchLevel] += 1; });
                return `${c.full} 完全 · ${c.partial} 部分 · ${c.missing} 未体现`;
              })()}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {semantic.requirements.map((req, i) => {
                  const meta = LEVEL_META[req.matchLevel] || LEVEL_META.partial;
                  return (
                    <div key={i} style={{ padding: '14px 16px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        <span style={{ fontSize: '15px', fontWeight: '500' }}>{req.requirement}</span>
                        <span style={{ padding: '2px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: '600', background: meta.bg, color: meta.color }}>
                          {meta.label}
                        </span>
                      </div>
                      {req.evidence && (
                        <p style={{ fontSize: '13px', color: '#555', margin: '4px 0' }}>
                          <strong>证据：</strong>「{req.evidence}」
                        </p>
                      )}
                      {req.reasoning && (
                        <p style={{ fontSize: '13px', color: '#666', margin: '4px 0' }}>
                          <strong>判定理由：</strong>{req.reasoning}
                        </p>
                      )}
                      {req.suggestion && (
                        <p style={{ fontSize: '13px', color: '#0d47a1', margin: '4px 0', background: '#e3f2fd', padding: '6px 10px', borderRadius: '6px' }}>
                          💡 补强建议：{req.suggestion}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </AtsSection>
          )}

          {/* 增量2：建议质量 verifier */}
          {semantic?.priorityActions && semantic.priorityActions.length > 0 && (
            <AtsSection
              icon="✅"
              title="建议质量独立校验"
              meta={(() => {
                if (verifying) return '校验中…';
                if (verification?.results?.length > 0) {
                  const passed = verification.results.filter((r) => r.verified === true).length;
                  return `${passed}/${verification.results.length} 通过`;
                }
                return '';
              })()}
            >
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
            </AtsSection>
          )}

          {/* 基础层：命中 / 缺失关键词 */}
          <AtsSection
            icon="🔑"
            title="关键词层匹配"
            meta={`${analysis.matchedKeywords?.length || 0} 命中 · ${analysis.missingKeywords?.length || 0} 缺失`}
          >
            <div className="ats-metrics">
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {analysis.missingKeywords?.length > 0 ? (
                    analysis.missingKeywords.map((keyword, i) => (
                      <span key={i} style={{ padding: '4px 12px', background: '#f8d7da', color: '#721c24', borderRadius: '16px', fontSize: '14px' }}>{keyword}</span>
                    ))
                  ) : (
                    <p style={{ color: '#666' }}>所有关键词均已匹配！</p>
                  )}
                </div>
              </div>
            </div>
          </AtsSection>

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
      )}
    </section>
  );
}
