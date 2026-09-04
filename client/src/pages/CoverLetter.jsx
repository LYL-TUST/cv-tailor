/**
 * 求职信(Cover Letter)生成 —— 投递闭环的一环
 *
 * 数据来源:编辑器里保存的简历(localStorage resumeData),字段可即时覆盖。
 * 生成规则:后端基于简历真实内容 + 可选目标岗位 JD 撰写,不虚构经历与数据。
 * 输出:预览 + 一键复制 + TXT 下载(UTF-8 BOM,记事本不乱码)。
 */
import { useState, useEffect } from "react";
import PageHead from "../components/PageHead";
import * as api from "../utils/api";
import { track } from "../utils/analytics";

export default function CoverLetter() {
  const [resumeData, setResumeData] = useState(null);
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [jd, setJd] = useState("");
  const [letter, setLetter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("resumeData");
      if (saved) {
        const data = JSON.parse(saved);
        setResumeData(data);
        setPosition(data.personalInfo?.title || "");
      }
    } catch (err) {
      console.error("读取简历数据失败:", err);
    }
  }, []);

  const name = resumeData?.personalInfo?.name || "";
  const summary = resumeData?.summary || "";
  const skills = (resumeData?.skills || []).join(", ");
  // 把真实经历压缩成「职位 @ 公司(时间)— 前 3 条要点」,供 LLM 引用
  const experienceBrief = (resumeData?.experience || [])
    .slice(0, 4)
    .map((exp) => {
      const bullets = (exp.bullets || []).filter((b) => b.trim()).slice(0, 3).join("；");
      return `${exp.position || "职位"} @ ${exp.company || "公司"}${exp.duration ? `（${exp.duration}）` : ""} — ${bullets || "无要点"}`;
    });

  const generate = async () => {
    if (!resumeData) {
      setError("未找到简历数据,请先在「简历编辑器」填写并保存。");
      return;
    }
    setLoading(true);
    setError(null);
    const startedAt = Date.now();
    track("ai_generate_click", { feature: "cover_letter" });
    try {
      const resp = await api.generateCoverLetter({
        fullName: name,
        title: position.trim() || undefined,
        company: company.trim() || undefined,
        jd: jd.trim() || undefined,
        summary,
        skills,
        experienceBrief,
      });
      setLetter(resp.letter);
      setCopied(false);
      track("ai_generate_success", { feature: "cover_letter", ms: Date.now() - startedAt });
    } catch (err) {
      track("ai_generate_fail", { feature: "cover_letter", reason: String(err.message || err).slice(0, 120) });
      setError(`求职信生成失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyLetter = async () => {
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      /* 剪贴板不可用时静默 */
    }
  };

  const downloadTxt = () => {
    const blob = new Blob(["\uFEFF" + letter], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(company || "cover-letter").replace(/[\\/:*?"<>|\s]+/g, "_")}_CoverLetter.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    track("txt_export", { status: "success", feature: "cover_letter" });
  };

  return (
    <section style={{ maxWidth: "1120px", margin: "0 auto", padding: "0 4px 32px" }}>
      <PageHead
        kicker="打磨优化"
        title="求职信"
        icon="✉️"
        sub="针对目标公司与岗位写一封正式的 Cover Letter —— 只基于你简历里的真实经历,不会替你编造项目与数据;粘贴 JD 可获得针对性回应。"
      />

      {!resumeData && (
        <div className="notice notice-warn" style={{ marginBottom: "18px" }}>
          ⚠️ 未找到简历数据。请先到「简历编辑器」填写并保存简历,再回来生成求职信。
        </div>
      )}

      <div className="cl-grid">
        {/* 左:输入 */}
        <div className="cl-card">
          <div className="cl-card-title">① 目标信息</div>

          <div className="cl-row">
            <div className="cl-field">
              <label className="cl-label" htmlFor="cl-company">目标公司</label>
              <input
                id="cl-company"
                className="cl-input"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="如:腾讯科技"
              />
            </div>
            <div className="cl-field">
              <label className="cl-label" htmlFor="cl-position">目标职位</label>
              <input
                id="cl-position"
                className="cl-input"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="已自动带入简历目标职位"
              />
            </div>
          </div>

          <div className="cl-field">
            <label className="cl-label" htmlFor="cl-jd">岗位描述 JD(可选,建议粘贴)</label>
            <textarea
              id="cl-jd"
              className="cl-input cl-textarea"
              rows={6}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="把招聘 JD 粘到这里,AI 会围绕 JD 要求挑选你简历中对应能力来展开…"
            />
          </div>

          <div className="cl-note">
            <strong>生成说明</strong><br />
            信中将引用:姓名「{name || "未填写"}」· 简介 / 技能 / 至多 4 段经历的真实要点;称呼根据公司名自动调整。
          </div>

          {error && <div className="notice notice-err" style={{ margin: "10px 0 0" }}>{error}</div>}

          <button
            className="cl-generate"
            onClick={generate}
            disabled={loading || !resumeData}
          >
            {loading ? "⏳ 生成中(约 5~20 秒)…" : "✨ 生成求职信"}
          </button>
        </div>

        {/* 右:预览 */}
        <div className="cl-card cl-preview">
          <div className="cl-card-title">② 成稿预览</div>
          {letter ? (
            <>
              <div className="cl-letter">{letter}</div>
              <div className="cl-actions">
                <button className="btn-ghost" onClick={copyLetter}>
                  {copied ? "✓ 已复制" : "📋 复制全文"}
                </button>
                <button className="btn-ghost" onClick={downloadTxt}>
                  ⤓ 下载 TXT
                </button>
              </div>
            </>
          ) : (
            <div className="cl-empty">
              <div className="cl-empty-ico">✉️</div>
              <p>填写左侧信息后点击「生成求职信」,成稿会显示在这里。</p>
              <p className="cl-empty-sub">AI 只改写表达与组织结构,不替你编造经历与数字 —— 可直接粘贴到邮件或投递系统。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
