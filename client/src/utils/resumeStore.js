/**
 * 多版本简历存储 —— localStorage 之上的版本管理层
 *
 * 数据结构：
 * - resume_versions_v1: [{ id, name, createdAt, updatedAt, data }]  data 为 ATS 格式简历
 * - resume_active_v1: 当前激活版本 id
 * - resumeData: 向后兼容的写穿镜像（ATS/Interview 等页面仍直接读它）
 */

const VERSIONS_KEY = "resume_versions_v1";
const ACTIVE_KEY = "resume_active_v1";
const LEGACY_KEY = "resumeData";

function uid() {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readVersions() {
  try {
    const raw = localStorage.getItem(VERSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeVersions(list) {
  localStorage.setItem(VERSIONS_KEY, JSON.stringify(list));
}

/**
 * 迁移：老用户只有裸 resumeData 时，自动生成首个版本「我的简历」。
 * 幂等：只在版本列表为空且存在旧数据时执行一次。
 */
export function migrateIfNeeded() {
  const versions = readVersions();
  if (versions.length > 0) return versions;

  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return [];

  try {
    const data = JSON.parse(legacy);
    const now = new Date().toISOString();
    const v = { id: uid(), name: "我的简历", createdAt: now, updatedAt: now, data };
    writeVersions([v]);
    localStorage.setItem(ACTIVE_KEY, v.id);
    return [v];
  } catch {
    return [];
  }
}

/** 版本列表（自动触发迁移） */
export function listVersions() {
  return migrateIfNeeded();
}

/** 当前激活版本（无则取第一个；仍无则返回 null） */
export function getActiveVersion() {
  const versions = migrateIfNeeded();
  if (versions.length === 0) return null;
  const activeId = localStorage.getItem(ACTIVE_KEY);
  return versions.find((v) => v.id === activeId) || versions[0];
}

/** 把 ATS 格式简历写入当前激活版本 + 写穿 resumeData 兼容旧读取方 */
export function writeThrough(data) {
  const versions = readVersions();
  if (versions.length === 0) {
    // 不应发生（Editor 加载时会先迁移/建版），兜底创建
    const now = new Date().toISOString();
    const v = { id: uid(), name: "我的简历", createdAt: now, updatedAt: now, data };
    writeVersions([v]);
    localStorage.setItem(ACTIVE_KEY, v.id);
  } else {
    const activeId = localStorage.getItem(ACTIVE_KEY);
    const idx = versions.findIndex((v) => v.id === activeId);
    const target = idx >= 0 ? idx : 0;
    versions[target] = { ...versions[target], data, updatedAt: new Date().toISOString() };
    writeVersions(versions);
    if (idx < 0) localStorage.setItem(ACTIVE_KEY, versions[0].id);
  }
  // 写穿：其他页面（ATS/Interview 等）仍直接读 resumeData
  localStorage.setItem(LEGACY_KEY, JSON.stringify(data));
}

/** 新建空版本并激活，返回新版本 */
export function createVersion(name = "未命名简历", data = null) {
  const versions = readVersions();
  const now = new Date().toISOString();
  const v = { id: uid(), name, createdAt: now, updatedAt: now, data: data || { empty: true } };
  writeVersions([...versions, v]);
  localStorage.setItem(ACTIVE_KEY, v.id);
  return v;
}

/** 复制版本并激活（用于"以 A 公司版为底改 B 公司版"） */
export function duplicateVersion(id) {
  const versions = readVersions();
  const src = versions.find((v) => v.id === id);
  if (!src) return null;
  const now = new Date().toISOString();
  const v = { id: uid(), name: `${src.name} - 副本`, createdAt: now, updatedAt: now, data: src.data };
  writeVersions([...versions, v]);
  localStorage.setItem(ACTIVE_KEY, v.id);
  return v;
}

/** 切换激活版本，返回该版本 */
export function switchTo(id) {
  const versions = readVersions();
  const target = versions.find((v) => v.id === id);
  if (!target) return null;
  localStorage.setItem(ACTIVE_KEY, id);
  // 切换即写穿，保证其他页面读到的是当前版本
  localStorage.setItem(LEGACY_KEY, JSON.stringify(target.data));
  return target;
}

/** 重命名 */
export function renameVersion(id, name) {
  const versions = readVersions();
  const idx = versions.findIndex((v) => v.id === id);
  if (idx < 0) return null;
  versions[idx] = { ...versions[idx], name, updatedAt: new Date().toISOString() };
  writeVersions(versions);
  return versions[idx];
}

/** 删除版本；若删的是激活版则自动切到剩余第一个，返回 {versions, active} */
export function deleteVersion(id) {
  let versions = readVersions().filter((v) => v.id !== id);
  writeVersions(versions);
  const activeId = localStorage.getItem(ACTIVE_KEY);
  if (activeId === id) {
    if (versions.length > 0) {
      localStorage.setItem(ACTIVE_KEY, versions[0].id);
      localStorage.setItem(LEGACY_KEY, JSON.stringify(versions[0].data));
    } else {
      localStorage.removeItem(ACTIVE_KEY);
      localStorage.removeItem(LEGACY_KEY);
    }
  }
  return { versions, active: localStorage.getItem(ACTIVE_KEY) || null };
}

/**
 * 定向更新某个版本的数据(不切换激活版本)。
 * mutator: (data) => newData;若目标版本是激活版,同步写穿 resumeData 兼容镜像。
 * 用于 ATS 诊断「一键改写」等跨页写入场景。返回更新后的版本,版本不存在返回 null。
 */
export function updateVersionData(id, mutator) {
  const versions = readVersions();
  const idx = versions.findIndex((v) => v.id === id);
  if (idx < 0) return null;
  const next = mutator(JSON.parse(JSON.stringify(versions[idx].data)));
  versions[idx] = { ...versions[idx], data: next, updatedAt: new Date().toISOString() };
  writeVersions(versions);
  if (localStorage.getItem(ACTIVE_KEY) === id) {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(next));
  }
  return versions[idx];
}

/**
 * 导入简历结果写入：默认覆盖当前激活版本；
 * replace=false 时新建「导入简历」版本（不覆盖已有内容）。
 */
export function writeImportedResume(data, { replace = true } = {}) {
  if (replace) {
    writeThrough(data);
    return getActiveVersion();
  }
  const versions = readVersions();
  const now = new Date().toISOString();
  const v = { id: uid(), name: `导入简历 ${new Date().toLocaleDateString()}`, createdAt: now, updatedAt: now, data };
  writeVersions([...versions, v]);
  localStorage.setItem(ACTIVE_KEY, v.id);
  localStorage.setItem(LEGACY_KEY, JSON.stringify(data));
  return v;
}
