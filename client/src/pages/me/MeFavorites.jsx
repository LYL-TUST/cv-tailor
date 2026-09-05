import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  listFavorites, listFolders, listFolderNames, countByFolder, folderOf,
  addFolder, renameFolder, deleteFolder, moveFavoriteToFolder,
  removeFavoriteById, clearFavorites, DEFAULT_FOLDER,
} from "../../utils/favoritesStore";
import { track } from "../../utils/analytics";
import { SectionTitle, cardBase, ghostBtn, dangerBtn, fmtDate, favTypeLabel, FAV_DIFF, chipStyle, EmptyState } from "./meUi";

/** 收藏夹 —— 面试题「再练银行」:自建收藏夹分夹管理,支持一键再练 */
export default function MeFavorites() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState([]);
  const [folders, setFolders] = useState([]); // 用户自建收藏夹
  const [counts, setCounts] = useState({});
  const [active, setActive] = useState("all"); // "all" | DEFAULT_FOLDER | 自定义夹名

  const reload = () => {
    setFavorites(listFavorites());
    setFolders(listFolders());
    setCounts(countByFolder());
  };
  useEffect(() => { reload(); }, []);

  /** 按当前 tab 过滤 */
  const visible = favorites.filter((f) => {
    if (active === "all") return true;
    return folderOf(f) === active;
  });

  const createFolder = () => {
    const name = window.prompt("新建收藏夹名称(如:「大厂真题」「行为面薄弱项」):");
    if (name == null) return;
    const res = addFolder(name);
    if (!res.added) {
      const msg = { empty: "名称不能为空", dup: "已有同名收藏夹", max: `最多 ${20} 个收藏夹` }[res.error] || "创建失败";
      window.alert(msg);
      return;
    }
    reload();
    setActive(res.folder.name);
  };

  const doRename = (folder) => {
    const name = window.prompt("重命名收藏夹:", folder.name);
    if (name == null) return;
    const res = renameFolder(folder.id, name);
    if (!res.ok) {
      window.alert({ empty: "名称不能为空", dup: "已有同名收藏夹", notfound: "收藏夹不存在" }[res.error] || "重命名失败");
      return;
    }
    if (active === folder.name) setActive(res.folder.name);
    reload();
  };

  const doDelete = (folder) => {
    const n = counts[folder.name] || 0;
    if (!window.confirm(`删除收藏夹「${folder.name}」？其中 ${n} 道题会移回「${DEFAULT_FOLDER}」，不会被删除。`)) return;
    deleteFolder(folder.id);
    if (active === folder.name) setActive("all");
    reload();
  };

  const moveCard = (fav, target) => {
    moveFavoriteToFolder(fav.id, target === DEFAULT_FOLDER ? "" : target);
    reload();
  };

  const folderActions = (folder) => (
    <span style={{ display: "inline-flex", gap: 4, marginLeft: "auto" }}>
      <button style={{ ...ghostBtn, fontSize: "11px", padding: "2px 8px" }} onClick={() => doRename(folder)}>✎ 重命名</button>
      <button style={{ ...dangerBtn, fontSize: "11px", padding: "2px 8px" }} onClick={() => doDelete(folder)}>🗑 删除</button>
    </span>
  );

  return (
    <div>
      <SectionTitle text="收藏夹 · 值得再练的题" badge={favorites.length} marginTop={0} />

      {/* 收藏夹 tab 行:全部 / 各收藏夹(含计数)+ 新建 */}
      <div className="me-fav-tabs">
        {["all", ...listFolderNames()].map((name) => {
          const label = name === "all" ? "全部" : name;
          const n = name === "all" ? favorites.length : (counts[name] || 0);
          return (
            <button key={name} type="button" className={`me-fav-tab${active === name ? " active" : ""}`} onClick={() => setActive(name)}>
              {name !== "all" && "📁 "}{label} <i>{n}</i>
            </button>
          );
        })}
        <button type="button" className="me-fav-tab me-fav-tab-add" onClick={createFolder}>＋ 新建收藏夹</button>
      </div>

      {/* 当前自定义夹的管理操作 */}
      {folders.find((f) => f.name === active) && (
        <div className="me-fav-manage">
          <span>📁 {active}</span>
          {folderActions(folders.find((f) => f.name === active))}
        </div>
      )}

      {favorites.length === 0 ? (
        <EmptyState
          icon="⭐"
          title="还没有收藏的题目"
          desc="模拟面试时点题卡右上角「☆ 收藏本题」，可用自建收藏夹归类整理；你筛出的高频题 / 薄弱题会集中在这里，随时再练。"
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="📁"
          title={`「${active === "all" ? "全部" : active}」暂时是空的`}
          desc="切换到其他收藏夹，或在模拟面试页收藏新题。"
        />
      ) : (
        <>
          {visible.map((f) => {
            const d = FAV_DIFF[f.difficulty];
            const inFolder = folderOf(f);
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
                <div style={{ display: "flex", gap: "8px", marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="btn-primary" style={{ fontSize: "12px", padding: "4px 14px" }} onClick={() => navigate("/interview", { state: { replayFavorite: f } })}>
                    🎤 再练一次
                  </button>
                  <select
                    className="me-fav-move"
                    value={inFolder}
                    onChange={(e) => moveCard(f, e.target.value)}
                    title="移动到其他收藏夹"
                    aria-label="移动到其他收藏夹"
                  >
                    {listFolderNames().map((name) => (
                      <option key={name} value={name}>{`📁 ${name}`}</option>
                    ))}
                  </select>
                  <button style={{ ...ghostBtn, marginLeft: "auto" }} onClick={() => { removeFavoriteById(f.id); reload(); track("interview_favorite_remove", {}); }}>删除</button>
                </div>
              </div>
            );
          })}
          <button style={dangerBtn} onClick={() => { if (window.confirm("清空全部收藏题目？收藏夹结构会保留。")) { clearFavorites(); reload(); } }}>清空全部收藏</button>
        </>
      )}
    </div>
  );
}
