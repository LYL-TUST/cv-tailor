import PageHead from "../components/PageHead";
import { useMemo, useState } from "react";
import { getEvents, exportEvents, clearEvents, getDeviceInfo } from "../utils/analytics";

/**
 * Analytics —— 本地隐私数据看板
 * 只展示本机浏览器里累积的匿名事件（无账号、无云端），
 * 是产品"最小埋点 → 本地聚合 → 迭代决策"闭环的演示入口。
 * AnalyticsContent 供独立页与「能力画像」面板嵌入共用;路由 /analytics 已重定向到 /me/radar。
 */

const FEATURE_LABEL = { summary: "个人简介", bullets: "经历要点", star: "STAR 结构化" };
const EVENT_LABEL = {
  page_view: "页面访问",
  resume_editor_view: "进入编辑器",
  ai_generate_click: "点击 AI 生成",
  ai_generate_success: "AI 生成成功",
  ai_generate_fail: "AI 生成失败",
  ats_analyze: "ATS 匹配分析",
  ats_analyze_fail: "ATS 匹配失败",
  ats_verify: "建议质量校验",
  pdf_export: "导出 PDF",
  txt_export: "导出纯文本",
};

const FALLBACK_EVENT = "其他事件";

const fmtTime = (t) => (t ? new Date(t).toLocaleString("zh-CN", { hour12: false }) : "-");
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function Bar({ label, value, base, color = "#2563eb" }) {
  const width = base > 0 ? Math.max(2, Math.round((value / base) * 100)) : 0;
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
        <span>{label}</span>
        <span style={{ fontWeight: 500 }}>{value}</span>
      </div>
      <div style={{ background: "#eef2f7", borderRadius: "6px", height: "10px" }}>
        <div style={{ background: color, borderRadius: "6px", height: "10px", width: `${width}%` }} />
      </div>
    </div>
  );
}

function FunnelRow({ label, count, base, overall, suffix }) {
  const stepPct = pct(count, base);
  const overallPct = pct(count, overall);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
      <div style={{ width: "150px", fontSize: "14px", flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, background: "#eef2f7", borderRadius: "6px", height: "16px", overflow: "hidden" }}>
        <div
          style={{
            height: "16px",
            borderRadius: "6px",
            background: "#2563eb",
            width: `${overall > 0 ? Math.max(2, Math.round((count / overall) * 100)) : 0}%`,
          }}
        />
      </div>
      <div style={{ width: "60px", textAlign: "right", fontSize: "14px", fontWeight: 500, flexShrink: 0 }}>
        {count}{suffix || ""}
      </div>
      <div style={{ width: "86px", textAlign: "right", fontSize: "12px", color: "#64748b", flexShrink: 0 }}>
        {base > 0 ? `${stepPct}% (较上步)` : "-"} · {overallPct}%
      </div>
    </div>
  );
}

/** 看板主体(不含页头)—— 独立页与能力画像面板共用 */
export function AnalyticsContent() {
  const [version, setVersion] = useState(0);
  const events = useMemo(() => {
    const list = getEvents().slice().sort((a, b) => b.t - a.t);
    void version; // 清空/刷新时重算
    return list;
  }, [version]);

  const stats = useMemo(() => {
    const count = (name, pred) =>
      events.filter((e) => e.e === name && (pred ? pred(e) : true)).length;

    const aiScores = events.filter((e) => e.e === "ats_analyze").map((e) => Number(e.p?.score));
    const validScores = aiScores.filter((n) => Number.isFinite(n));

    const dist = { lt60: 0, s60: 0, s70: 0, s80: 0, s90: 0 };
    validScores.forEach((s) => {
      if (s >= 90) dist.s90 += 1;
      else if (s >= 80) dist.s80 += 1;
      else if (s >= 70) dist.s70 += 1;
      else if (s >= 60) dist.s60 += 1;
      else dist.lt60 += 1;
    });

    const verify = events.filter((e) => e.e === "ats_verify");
    const verifyTotal = verify.reduce((n, e) => n + Number(e.p?.total || 0), 0);
    const verifyPassed = verify.reduce((n, e) => n + Number(e.p?.passed || 0), 0);

    const featureStats = Object.keys(FEATURE_LABEL).map((f) => ({
      feature: f,
      label: FEATURE_LABEL[f],
      click: count("ai_generate_click", (e) => e.p?.feature === f),
      success: count("ai_generate_success", (e) => e.p?.feature === f),
      fail: count("ai_generate_fail", (e) => e.p?.feature === f),
    }));

    return {
      editorView: count("resume_editor_view"),
      genClick: count("ai_generate_click"),
      genSuccess: count("ai_generate_success"),
      genFail: count("ai_generate_fail"),
      pdfSuccess: count("pdf_export", (e) => e.p?.status === "success"),
      pdfFail: count("pdf_export", (e) => e.p?.status === "fail"),
      txtSuccess: count("txt_export", (e) => e.p?.status === "success"),
      atsCount: count("ats_analyze"),
      atsFail: count("ats_analyze_fail"),
      avgScore: validScores.length
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : null,
      lastScore: validScores.length ? validScores[validScores.length - 1] : null,
      dist,
      validScoresCount: validScores.length,
      verifyTotal,
      verifyPassed,
      featureStats,
    };
  }, [events]);

  const device = useMemo(() => getDeviceInfo(), [version]);

  const handleExport = () => {
    exportEvents();
  };
  const handleClear = () => {
    if (window.confirm("确定清空本机全部埋点数据吗？（设备 ID 会保留，后续仍可继续累计）")) {
      clearEvents();
      setVersion((v) => v + 1);
    }
  };

  const showScores = stats.validScoresCount > 0;
  const genBase = stats.genClick; // 漏斗锚点：以"进入编辑器"为整体基数

  return (
    <>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
        <button className="btn-primary" onClick={handleExport}>导出事件 JSON</button>
        <button className="btn-ghost" onClick={handleClear}>清空本地数据</button>
      </div>

      {/* ===== 概览卡片 ===== */}
      <div className="dashboard-grid">
        <div className="dash-card">
          <h3>设备 ID</h3>
          <p style={{ fontFamily: "monospace", fontSize: "13px", wordBreak: "break-all" }}>
            {device.deviceId.slice(0, 8)}…（随机假 ID，非个人信息）
          </p>
        </div>
        <div className="dash-card">
          <h3>事件总数</h3>
          <p style={{ fontSize: "26px", fontWeight: 500, margin: "4px 0" }}>{device.total}</p>
        </div>
        <div className="dash-card">
          <h3>活跃天数</h3>
          <p style={{ fontSize: "26px", fontWeight: 500, margin: "4px 0" }}>{device.activeDays}</p>
        </div>
        <div className="dash-card">
          <h3>首次 / 最近活跃</h3>
          <p style={{ fontSize: "13px", lineHeight: 1.8 }}>
            {fmtTime(device.first)}<br />{fmtTime(device.last)}
          </p>
        </div>
      </div>

      {/* ===== 核心漏斗 ===== */}
      <div className="dash-card" style={{ marginTop: "24px", padding: "20px" }}>
        <h3>核心转化漏斗：编辑器 → AI 生成 → 导出 PDF</h3>
        <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>
          整体口径：以"进入编辑器"为 100%，观察每一步流失 —— 用于定位用户卡在哪一环。
        </p>
        <FunnelRow label="① 进入编辑器" count={stats.editorView} base={stats.editorView} overall={stats.editorView} />
        <FunnelRow label="② 点击 AI 生成" count={stats.genClick} base={stats.editorView} overall={stats.editorView} />
        <FunnelRow label="③ AI 生成成功" count={stats.genSuccess} base={stats.genClick} overall={stats.editorView} />
        <FunnelRow label="④ 导出 PDF" count={stats.pdfSuccess} base={stats.genSuccess} overall={stats.editorView} />
        <div style={{ marginTop: "8px", fontSize: "13px", color: "#334155", lineHeight: 1.8 }}>
          端到端转化率：<strong>{pct(stats.pdfSuccess, stats.editorView)}%</strong>（{stats.pdfSuccess} / {stats.editorView}）
          ，AI 生成成功率：<strong>{pct(stats.genSuccess, stats.genClick)}%</strong>，失败 {stats.genFail} 次。
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginTop: "24px" }}>
        {/* AI 功能使用构成 */}
        <div className="dash-card" style={{ padding: "20px" }}>
          <h3>AI 功能使用构成</h3>
          {stats.featureStats.map((f) => (
            <Bar key={f.feature} label={`${f.label}（成功 ${f.success} / 失败 ${f.fail}）`} value={f.success} base={Math.max(1, ...stats.featureStats.map((x) => x.success))} />
          ))}
          <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "8px" }}>
            哪类内容用户最需要 AI 代写 —— 决定后续 Prompt 与模板资源的投入优先级。
          </p>
        </div>

        {/* ATS 匹配分布 */}
        <div className="dash-card" style={{ padding: "20px" }}>
          <h3>ATS 匹配分（共 {stats.atsCount} 次）</h3>
          {showScores ? (
            <>
              <div style={{ display: "flex", gap: "24px", marginBottom: "12px", fontSize: "14px" }}>
                <span>平均：<strong>{stats.avgScore}</strong>/100</span>
                <span>最近：<strong>{stats.lastScore}</strong>/100</span>
              </div>
              <Bar label="< 60（需大幅补强）" value={stats.dist.lt60} base={stats.validScoresCount} color="#e24b4a" />
              <Bar label="60 - 69" value={stats.dist.s60} base={stats.validScoresCount} color="#ef9f27" />
              <Bar label="70 - 79" value={stats.dist.s70} base={stats.validScoresCount} color="#f5c542" />
              <Bar label="80 - 89" value={stats.dist.s80} base={stats.validScoresCount} color="#4caf50" />
              <Bar label="90+" value={stats.dist.s90} base={stats.validScoresCount} color="#0f6e56" />
            </>
          ) : (
            <p style={{ color: "#94a3b8", fontSize: "14px" }}>尚未做过匹配分析，去「JD 匹配诊断」跑一次即可在此看到分数分布。</p>
          )}
          {stats.atsFail > 0 && <p style={{ fontSize: "12px", color: "#c2410c", marginTop: "8px" }}>另有 {stats.atsFail} 次分析失败（用于监控接口稳定性）。</p>}
        </div>
      </div>

      {/* AI 建议质量校验 */}
      <div className="dash-card" style={{ marginTop: "24px", padding: "20px" }}>
        <h3>AI 建议质量校验（诚实性护栏）</h3>
        <p style={{ fontSize: "14px", margin: "8px 0 0" }}>
          {stats.verifyTotal > 0 ? (
            <>累计校验 <strong>{stats.verifyTotal}</strong> 条建议，通过 <strong>{stats.verifyPassed}</strong> 条（
            {pct(stats.verifyPassed, stats.verifyTotal)}%），{stats.verifyTotal - stats.verifyPassed} 条被标记"需人工复核"——验证 AI 输出并非全盘可信，产品以独立校验兜底。
            </>
          ) : (
            <span style={{ color: "#94a3b8" }}>暂无校验记录。该模块独立复核每条建议是否相关、具体、诚实，防止诱导编造经历。</span>
          )}
        </p>
      </div>

      {/* 导出统计 */}
      <div className="dash-card" style={{ marginTop: "24px", padding: "20px" }}>
        <h3>导出行为</h3>
        <p style={{ fontSize: "14px", margin: "8px 0 0" }}>
          PDF 导出成功 <strong>{stats.pdfSuccess}</strong> 次 / 失败 <strong>{stats.pdfFail}</strong> 次；
          纯文本导出成功 <strong>{stats.txtSuccess}</strong> 次。PDF 成功率 ={" "}
          <strong>{pct(stats.pdfSuccess, stats.pdfSuccess + stats.pdfFail)}%</strong>。
        </p>
      </div>

      {/* 最近事件 */}
      <div className="dash-card" style={{ marginTop: "24px", padding: "20px" }}>
        <h3>最近事件（最多展示 12 条）</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ padding: "6px 8px" }}>时间</th>
              <th style={{ padding: "6px 8px" }}>事件</th>
              <th style={{ padding: "6px 8px" }}>属性</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr><td colSpan={3} style={{ padding: "12px 8px", color: "#94a3b8" }}>暂无事件。访问任意页面、点击 AI 生成或导出 PDF 后会出现在这里。</td></tr>
            )}
            {events.slice(0, 12).map((ev, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "6px 8px", whiteSpace: "nowrap", color: "#64748b" }}>{fmtTime(ev.t)}</td>
                <td style={{ padding: "6px 8px", fontWeight: 500 }}>{EVENT_LABEL[ev.e] || ev.e}</td>
                <td style={{ padding: "6px 8px", color: "#475569", wordBreak: "break-all" }}>
                  {ev.p && Object.keys(ev.p).length > 0 ? JSON.stringify(ev.p) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "16px", lineHeight: 1.7 }}>
        说明：事件命名规范与统计口径详见仓库 docs/PRD_AI_Resume_Builder.md「埋点事件表」。该看板服务于产品演示与迭代复盘；
        若未来接入可选云同步/账号体系，同一套事件可无缝切换到服务端分析。
      </p>
    </>
  );
}

/** 独立页包装(当前路由已重定向到 /me/radar,保留以便需要时恢复独立入口) */
export default function Analytics() {
  return (
    <section>
      <PageHead
        kicker="复盘"
        title="数据看板"
        icon="📊"
        sub="所有埋点仅保存在当前浏览器中：无账号、无云端上报、不采集个人信息。本页演示「埋点 → 漏斗 → 决策」的数据闭环。"
      />
      <AnalyticsContent />
    </section>
  );
}
