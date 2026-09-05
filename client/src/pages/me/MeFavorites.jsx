import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  listFavorites, removeFavoriteById, clearFavorites,
} from "../../utils/favoritesStore";
import { track } from "../../utils/analytics";
import { SectionTitle, cardBase, ghostBtn, dangerBtn, fmtDate, favTypeLabel, FAV_DIFF, chipStyle, EmptyState } from "./meUi";

/** 收藏夹 —— 面试题「再练银行」:筛选出的高频/薄弱题,支持一键再练 */
export default function MeFavorites() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState([]);

  const reload = () => setFavorites(listFavorites());
  useEffect(() => { reload(); }, []);

  return (
    <div>
      <SectionTitle text="收藏夹 · 值得再练的题" badge={favorites.length} marginTop={0} />
      {favorites.length === 0 ? (
        <EmptyState
          icon="⭐"
          title="还没有收藏的题目"
          desc="模拟面试时点题卡右上角「☆ 收藏本题」，你筛出的高频题 / 薄弱题会集中在这里，随时再练。"
        />
      ) : (
        <>
          {favorites.map((f) => {
            const d = FAV_DIFF[f.difficulty];
            return (
              <div key={f.id} className="me-card" style={cardBase}>
                <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: 6, lineHeight: 1.55 }}>{f.question}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span style={chipStyle("#334155", "#e2e8f0")}>{favTypeLabel(f.type)}</span>
                  {f.category && <span style={chipStyle("#334155", "#e2e8f0")}>{f.category}</span>}
                  {d && <span style={chipStyle(d.fg, d.bg)}>{d.label}</span>}
                  {f.fromExperience && <span style={chipStyle("#1e40af", "#dbeafe")}>📌 {f.fromExperience}</span>}
                  {f.sourceJobTitle && <span style={chipStyle("#065f46", "#d1fae5")}>🎯 来自「{f.sourceJobTitle}」</span>}
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>收藏于 {fmtDate(f.ts)}</span>
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: 10 }}>
                  <button className="btn-primary" style={{ fontSize: "12px", padding: "4px 14px" }} onClick={() => navigate("/interview", { state: { replayFavorite: f } })}>
                    🎤 再练一次
                  </button>
                  <button style={ghostBtn} onClick={() => { removeFavoriteById(f.id); reload(); track("interview_favorite_remove", {}); }}>删除</button>
                </div>
              </div>
            );
          })}
          <button style={dangerBtn} onClick={() => { if (window.confirm("清空全部收藏题目？")) { clearFavorites(); reload(); } }}>清空全部收藏</button>
        </>
      )}
    </div>
  );
}
