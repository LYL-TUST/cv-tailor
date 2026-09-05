/**
 * analytics.js —— 本地隐私埋点（Local-first, privacy-preserving analytics）
 *
 * 设计原则（与产品"隐私优先"承诺一致）:
 *  1. 所有事件只写入当前浏览器本地存储，绝不自动上报云端；
 *  2. 不采集任何个人身份信息（姓名/邮箱/电话/简历正文均不入事件）；
 *  3. 用"设备本地随机假 ID"区分访问，无账号体系也能识别同一台设备；
 *  4. 提供手动"导出 JSON / 清空数据"，把数据所有权完全交给用户；
 *  5. 事件上限保护（FIFO 淘汰），避免无限增长。
 *
 * 事件命名规范（与 docs/PRD 中"埋点事件表"保持一致）:
 *  - page_view            路由访问        { page, referrer }
 *  - resume_editor_view   进入编辑器      { template, hasResume }
 *  - ai_generate_click    点击 AI 生成     { feature: summary|bullets|star }
 *  - ai_generate_success  AI 生成成功     { feature, ms }
 *  - ai_generate_fail     AI 生成失败     { feature, reason }
 *  - ats_analyze          ATS 匹配完成     { score }
 *  - ats_analyze_fail     ATS 匹配失败     { reason }
 *  - ats_verify           建议质量校验     { total, passed, flagged }
 *  - pdf_export           PDF 导出         { status: success|fail }
 *  - txt_export           纯文本导出       { status: success|fail }
 *  - interview_voice_start 语音作答开始     { }
 *  - interview_voice_fill  语音转写填入回答 { chars, target: first|followup }   (P1 语音作答 / P2 补答)
 *  - interview_voice_edited 语音填入后被改  { }          (编辑率指标)
 *  - interview_voice_error 语音识别出错     { code }     (no-speech/network/not-allowed…)
 *  - interview_tts_play   面试官语音读题/念追问 { kind: question|followup, auto, chars } (P2)
 *  - interview_tts_stop   停止面试官朗读     { }                                (P2)
 *  - interview_timer_expire 每题限时到       { limit }                          (P2 限时作答)
 *  - interview_followup_generate 面试官追问生成成功 { ctx }                     (P2 追问)
 *  - interview_followup_answered 用户回应追问并评估 { }                         (P2 追问)
 *  - interview_followup_skipped 用户跳过追问直接评估 { }                        (P2 追问)
 */

const EVENTS_KEY = "arb_analytics_events_v1";
const DEVICE_KEY = "arb_device_id";
const SESSION_KEY = "arb_session_id";
const MAX_EVENTS = 1500; // 单机上限，超出按 FIFO 淘汰

function readLS(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 隐私模式等场景静默降级 */ }
}

function genId() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
  } catch { /* fallthrough */ }
  // 兜底：随机十六进制串
  const rand = () => Math.random().toString(16).slice(2);
  return `${rand()}${rand()}-${rand()}-${rand()}-${Date.now().toString(16)}`;
}

/**
 * 设备本地随机假 ID —— 首次访问生成并永久保存在本机。
 * 它不等同于任何个人身份，只用于在本机聚合时区分"是否同一台设备"。
 */
export function getDeviceId() {
  let id = readLS(DEVICE_KEY);
  if (!id) {
    id = genId();
    writeLS(DEVICE_KEY, id);
  }
  return id;
}

/**
 * 会话 ID —— 存在 sessionStorage，关闭标签页即更换（近似一次"访问"）。
 */
function getSessionId() {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = genId();
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return "unknown";
  }
}

export function getEvents() {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveEvents(list) {
  try {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(list.slice(-MAX_EVENTS)));
  } catch { /* 空间不足时静默降级 */ }
}

let _lastGuard = null;

/**
 * 记录一条匿名事件。
 * @param {string} event  事件名（见文件头规范）
 * @param {object} props  业务属性（禁止放入任何个人身份信息）
 */
export function track(event, props = {}) {
  try {
    const now = Date.now();
    // 去抖：React StrictMode 会双触发 effect/handler，500ms 内同名同参只记一次
    if (
      _lastGuard &&
      _lastGuard.event === event &&
      _lastGuard.props === JSON.stringify(props || {}) &&
      now - _lastGuard.t < 500
    ) {
      return;
    }
    const evt = {
      e: event,
      t: now,
      d: getDeviceId(),
      s: getSessionId(),
      p: props || {},
    };
    const list = getEvents();
    list.push(evt);
    saveEvents(list);
    _lastGuard = { event, t: now, props: JSON.stringify(props || {}) };
  } catch { /* 埋点绝不影响主流程 */ }
}

/** 导出全部事件为 JSON 文件（数据所有权归用户） */
export function exportEvents() {
  const list = getEvents();
  const payload = {
    meta: {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      deviceId: getDeviceId(),
      note: "本地隐私埋点导出：不含任何个人身份信息。",
    },
    events: list,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `resume-analytics-${date}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** 清空本地全部事件（保留设备 ID，可再次累计） */
export function clearEvents() {
  try { localStorage.removeItem(EVENTS_KEY); } catch { /* noop */ }
}

/** 设备概览信息（仅用于看板展示） */
export function getDeviceInfo() {
  const events = getEvents();
  const first = events.length ? Math.min(...events.map((x) => x.t)) : null;
  const last = events.length ? Math.max(...events.map((x) => x.t)) : null;
  const activeDays = new Set(
    events.map((x) => new Date(x.t).toISOString().slice(0, 10))
  ).size;
  return { deviceId: getDeviceId(), total: events.length, first, last, activeDays };
}

export default {
  track,
  getEvents,
  exportEvents,
  clearEvents,
  getDeviceInfo,
};
