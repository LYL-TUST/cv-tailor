import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listInterviewSessions } from "../../utils/historyStore";
import {
  buildRadarProfile, lastSessionJobTitle,
  RADAR_WEAK_SCORE, RADAR_WEAK_LIMIT,
} from "../../utils/radarStats";
import { track } from "../../utils/analytics";
import { SectionTitle, ghostBtn, chipStyle, EmptyState } from "./meUi";
import CollapsibleSection from "../../components/CollapsibleSection";
import { AnalyticsContent } from "../Analytics";

/**
 * 能力雷达画像 —— 跨场次聚合(category × difficulty × score,纯本地计算)
 * 雷达图 + 难度档均值 + 维度明细;弱项维度支持「一键针对性再练」→ /interview 定向出题。
 */

/** 0-10 分配色(与 Interview.jsx 评估区 7/5 分界一致) */
const radarScoreColor = (s) => (s >= 7 ? "#16a34a" : s >= 5 ? "#d97706" : "#dc2626");

const DIFF_CHIP = {
  easy: { label: "简单", fg: "#15803d", bg: "#dcfce7" },
  medium: { label: "中等", fg: "#b45309", bg: "#fef3c7" },
  hard: { label: "困难", fg: "#b91c1c", bg: "#fee2e2" },
};

/** SVG 雷达图(维度 3-8 才画;少于 3 个维度只展示明细列表) */
function RadarChart({ dims }) {
  const N = dims.length;
  if (N < 3) return null;
  const CX = 230, CY = 150, R = 100;
  const angle = (i) => (Math.PI * 2 * i) / N - Math.PI / 2;
  const pt = (i, v) => `${(CX + Math.cos(angle(i)) * R * v).toFixed(1)},${(CY + Math.sin(angle(i)) * R * v).toFixed(1)}`;

  const ringLevels = [2, 4, 6, 8, 10];
  const dataPoints = dims.map((d, i) => pt(i, Math.max(d.avg, 0.5) / 10)).join(" ");

  return (
    <svg viewBox="0 0 460 300" width="100%" style={{ maxWidth: 520, display: "block", margin: "0 auto" }} role="img" aria-label="能力雷达图">
      {ringLevels.map((lv) => (
        <polygon key={lv} points={dims.map((_, i) => pt(i, lv / 10)).join(" ")} fill="none" stroke="#e2e8f0" strokeWidth="1" />
      ))}
      {dims.map((_, i) => (
        <line key={i} x1={CX} y1={CY} x2={CX + Math.cos(angle(i)) * R} y2={CY + Math.sin(angle(i)) * R} stroke="#e2e8f0" strokeWidth="1" />
      ))}
      <polygon points={dataPoints} fill="rgba(37,99,235,0.16)" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />
      {dims.map((d, i) => {
        const lx = CX + Math.cos(angle(i)) * R * 1.22;
        const ly = CY + Math.sin(angle(i)) * R * 1.22;
        const name = d.category.length > 8 ? `${d.category.slice(0, 8)}…` : d.category;
        return (
          <g key={d.category}>
            <text x={lx} y={ly - 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="#334155">{name}</text>
            <text x={lx} y={ly + 11} textAnchor="middle" fontSize="11" fontWeight="700" fill={radarScoreColor(d.avg)}>{d.avg}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** 维度明细行 */
function DimRow({ dim, onDrill }) {
  const color = radarScoreColor(dim.avg);
  return (
    <div className="me-radar-dim">
      <span className="me-radar-dim-name" title={dim.category}>{dim.category}</span>
      <div className="me-radar-bar">
        <div className="me-radar-bar-fill" style={{ width: `${Math.max(dim.avg * 10, 3)}%`, background: color }} />
      </div>
      <b style={{ fontSize: "13px", color, width: 34, textAlign: "right" }}>{dim.avg}</b>
      <span style={{ fontSize: "12px", color: "#94a3b8", width: 76, textAlign: "right" }}>{dim.attempts} 次{dim.weakCount > 0 ? ` · ⚠️${dim.weakCount}` : ""}</span>
      <span style={{ display: "inline-flex", gap: 4 }}>
        {["easy", "medium", "hard"].filter((k) => dim.diff[k]).map((k) => (
          <span key={k} style={chipStyle(DIFF_CHIP[k].fg, DIFF_CHIP[k].bg)} title={`${DIFF_CHIP[k].label} 均分 ${dim.diff[k].avg}(${dim.diff[k].n} 题)`}>
            {DIFF_CHIP[k].label} {dim.diff[k].avg}
          </span>
        ))}
      </span>
      <button className="btn-ghost" style={{ fontSize: "12px", padding: "3px 10px", marginLeft: "auto", flexShrink: 0 }} onClick={() => onDrill([dim.category])}>
        🎯 针对再练
      </button>
    </div>
  );
}

export default function MeRadar() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    setProfile(buildRadarProfile(listInterviewSessions()));
  }, []);

  /** 一键针对性再练:携带弱项维度跳转 /interview,定向出题 */
  const startWeakDrill = (categories) => {
    if (!profile || categories.length === 0) return;
    track("interview_weak_drill", { categories, source: "radar" });
    navigate("/interview", {
      state: { weakDrill: { categories: categories.slice(0, RADAR_WEAK_LIMIT), jobTitle: lastSessionJobTitle(listInterviewSessions()) } },
    });
  };

  if (!profile) return null;

  if (profile.questions === 0) {
    return (
      <div>
        <SectionTitle text="能力雷达 · 面试能力画像" badge="0 场" marginTop={0} />
        <EmptyState
          icon="📈"
          title="还没有可统计的面试练习"
          desc="完成模拟面试并保存到个人中心后,这里会按能力维度聚合你的得分,生成雷达画像与弱项定向练习。"
          cta={<button className="btn-primary" style={{ fontSize: "13px", padding: "6px 18px" }} onClick={() => navigate("/interview")}>🎤 去做一次模拟面试</button>}
        />
      </div>
    );
  }

  const { dims, radarDims, difficulty, weakCategories, sessions, questions, avg } = profile;

  return (
    <div>
      <SectionTitle text="能力雷达 · 面试能力画像" badge={`${sessions} 场 · ${questions} 题`} marginTop={0} />

      {/* 总览 + 雷达图 */}
      <div className="me-card" style={{ padding: "16px" }}>
        <div className="me-radar-stats">
          <div className="me-radar-stat"><b style={{ color: radarScoreColor(avg) }}>{avg}</b><span>总平均分(10 分制)</span></div>
          {difficulty.easy && <div className="me-radar-stat"><b style={{ color: radarScoreColor(difficulty.easy.avg) }}>{difficulty.easy.avg}</b><span>简单档均值 · {difficulty.easy.n} 题</span></div>}
          {difficulty.medium && <div className="me-radar-stat"><b style={{ color: radarScoreColor(difficulty.medium.avg) }}>{difficulty.medium.avg}</b><span>中等档均值 · {difficulty.medium.n} 题</span></div>}
          {difficulty.hard && <div className="me-radar-stat"><b style={{ color: radarScoreColor(difficulty.hard.avg) }}>{difficulty.hard.avg}</b><span>困难档均值 · {difficulty.hard.n} 题</span></div>}
        </div>
        {radarDims.length >= 3 ? (
          <>
            <RadarChart dims={radarDims} />
            <p style={{ fontSize: "12px", color: "#94a3b8", textAlign: "center", margin: "4px 0 0" }}>
              按能力维度聚合的平均分(0-10);图形越饱满 = 该维度越稳。取练习次数最多的 {radarDims.length} 个维度。
            </p>
          </>
        ) : (
          <p style={{ fontSize: "12px", color: "#94a3b8", textAlign: "center", margin: "8px 0 0" }}>至少覆盖 3 个能力维度后显示雷达图,当前先看下方明细。</p>
        )}
      </div>

      {/* 弱项定向练习 */}
      {weakCategories.length > 0 ? (
        <div className="me-radar-weak">
          <div>
            <b>⚠️ 弱项维度(均分 &lt; {RADAR_WEAK_SCORE})</b>
            <p style={{ margin: "4px 0 0", fontSize: "13px" }}>「{weakCategories.join("、")}」{weakCategories.length > 1 ? "等" : ""}拖了后腿 —— 可发起一场只围绕这些维度的定向练习。</p>
          </div>
          <button className="btn-primary" style={{ fontSize: "13px", padding: "6px 16px", flexShrink: 0 }} onClick={() => startWeakDrill(weakCategories)}>
            🎯 一键针对性再练({weakCategories.length} 项)
          </button>
        </div>
      ) : (
        <div className="me-radar-weak ok">
          <div>
            <b>✅ 暂无明显弱项(所有维度均分 ≥ {RADAR_WEAK_SCORE})</b>
            <p style={{ margin: "4px 0 0", fontSize: "13px" }}>保持练习节奏,或提高难度档位继续加压。</p>
          </div>
        </div>
      )}

      {/* 维度明细 */}
      <div className="me-card" style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: 6 }}>维度明细(弱项在前)</div>
        {dims.map((d) => <DimRow key={d.category} dim={d} onDrill={startWeakDrill} />)}
      </div>

      <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: 10 }}>
        📊 画像由本机全部面试记录聚合而来(含未保存场次不会计入,仅统计「保存到个人中心」的场次);「⚠️ n」为该维度弱题数(低分 / 超时 / 未回应追问)。
        <button style={{ ...ghostBtn, marginLeft: 8 }} onClick={() => navigate("/me/interviews")}>查看面试记录 →</button>
      </p>

      {/* 产品数据看板(本机埋点):原独立「数据看板」页并入此处,默认收起 */}
      <div style={{ marginTop: 16 }}>
        <CollapsibleSection
          icon="📊"
          title="产品数据看板(本机埋点)"
          meta="漏斗 · 转化 · 校验"
          defaultOpen={false}
        >
          <AnalyticsContent />
        </CollapsibleSection>
      </div>
    </div>
  );
}
