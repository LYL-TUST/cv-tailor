import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../utils/api";
import { track } from "../utils/analytics";
import { writeImportedResume, listVersions } from "../utils/resumeStore";
import PageHead from "../components/PageHead";

/**
 * 简历导入 —— 上传已有简历（PDF / DOCX）
 * 流程：上传文件 → 后端提取文本 → LLM 结构化（Zod 校验）→ 预填编辑器
 * 隐私：文件仅在解析请求中传输，不在本地或服务端留存原文。
 */
export default function Import() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | extracting | structuring | done
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { resumeData, meta }
  const [elapsed, setElapsed] = useState(0); // 解析已用时（秒）
  const [dragging, setDragging] = useState(false);

  // 解析进行中时启动计时器，让用户知道系统在工作
  const parsing = status === "extracting" || status === "structuring";
  useEffect(() => {
    if (!parsing) { setElapsed(0); return; }
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [parsing]);

  const handleFile = async (file) => {
    if (!file) return;

    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!validTypes.includes(file.type)) {
      setError("仅支持 PDF 或 .docx 文件（旧版 .doc 请先用 Word 另存为 .docx）");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("文件超过 5MB，请压缩后重试");
      return;
    }

    setError(null);
    setStatus("extracting");
    track("resume_import", { status: "start", fileType: file.type === "application/pdf" ? "pdf" : "docx" });
    const startedAt = Date.now();

    try {
      setStatus("structuring");
      const { resumeData, meta } = await api.importResume(file);

      // 写入当前激活版本（覆盖），并写穿 resumeData
      writeImportedResume(resumeData, { replace: true });

      setStatus("done");
      setResult({ resumeData, meta });
      track("resume_import", {
        status: "success",
        fileType: meta.fileType,
        warnings: meta.warnings?.length || 0,
        ms: Date.now() - startedAt,
      });
    } catch (err) {
      setStatus("idle");
      setError(err.message || "导入失败，请重试");
      track("resume_import", {
        status: "fail",
        reason: String(err.message || err).slice(0, 120),
      });
    }
  };

  const goEditor = () => navigate("/editor");

  const r = result?.resumeData;
  const expCount = r?.experience?.length || 0;
  const skillCount = r?.skills?.length || 0;
  const eduCount = r?.education?.length || 0;

  return (
    <div className="imp">
      <PageHead
        kicker="开始创作"
        title="导入已有简历"
        icon="📥"
        sub="上传你现有的简历（PDF / Word），AI 自动提取内容并填入编辑器，再基于它优化。"
      />

      <div className="imp-card">
        {/* 隐私说明 */}
        <div className="notice notice-ok">
          🔒 <strong>隐私承诺</strong>：文件仅用于本次解析，不会存储在服务器；解析结果只保存在你自己的浏览器本地。
        </div>

        {/* 上传区 */}
        {status !== "done" && (
          <div
            className={`dropzone${dragging ? " dropzone-over" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
          >
            {parsing ? (
              <>
                <span className="dz-spinner" aria-hidden="true" />
                <p className="dz-title">
                  {status === "extracting" ? "正在提取简历文本…" : "AI 正在结构化你的简历内容…"}
                </p>
                <p className="dz-muted">已用时 {elapsed} 秒 · 通常需要 10~60 秒，请勿关闭页面</p>
                {elapsed >= 90 && (
                  <p className="dz-warn">⏳ 用时偏长（AI 正在处理较长内容），建议再等待 1 分钟；超过 2 分钟仍未完成可重新上传。</p>
                )}
              </>
            ) : (
              <>
                <span className="dz-ico" aria-hidden="true">📄</span>
                <p className="dz-title">点击选择文件，或把文件拖到这里</p>
                <p className="dz-muted">支持 PDF / .docx，最大 5MB</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: "none" }}
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = ""; // 允许重复选同一文件
              }}
            />
          </div>
        )}

        {error && (
          <div className="notice notice-err" role="alert">
            ⚠️ {error}
          </div>
        )}

        {/* 结果预览 */}
        {status === "done" && result && (
          <div className="imp-result">
            <div className="imp-result-head">
              <span className="imp-result-badge">✅ 解析完成</span>
              <span className="imp-result-meta">
                {result.meta?.fileType?.toUpperCase?.() ?? ""}
                {result.meta?.truncated && " · 已截断"}
              </span>
            </div>

            <p className="imp-summary">
              识别到姓名 <strong>{r?.personalInfo?.name || "（未识别）"}</strong>
              ，{expCount} 段工作经历，{skillCount} 项技能，{eduCount} 条教育背景。
            </p>

            {result.meta?.warnings?.length > 0 && (
              <div className="notice notice-warn">
                <strong>AI 提示（进入编辑器后请核对）：</strong>
                <ul>
                  {result.meta.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            <div className="imp-actions">
              <button className="btn btn-primary" onClick={goEditor}>
                进入编辑器继续完善 →
              </button>
              <button className="btn btn-ghost" onClick={() => { setStatus("idle"); setResult(null); }}>
                重新上传
              </button>
            </div>

            <p className="imp-foot">
              当前共 {listVersions().length} 个简历版本，导入内容已写入当前版本（可用编辑器顶部版本条切换）。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}