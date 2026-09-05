/**
 * useVoiceInput —— 语音输入封装（Web Speech API, P1 语音作答）
 *
 * 产品背景：模拟面试答题支持「口述 → 自动转写 → 可编辑填入回答框」。
 * 设计要点（与产品「本地优先 / 隐私」叙事一致）：
 *  1. 识别走浏览器内置 SpeechRecognition（Chrome / Edge 中文识别），纯前端；
 *     本 hook 不保存、不上传任何音频，只产出转写文本；
 *  2. 浏览器不支持时返回 supported=false，调用方保留文字输入即可，静默降级；
 *  3. 错误码归一化为面向用户的中文文案，不把 ASR 原始错误甩给用户猜；
 *  4. 状态机：idle →（start）→ listening →（用户 stop）→ busy → idle；
 *
 * 连续聆听（核心体验）：
 *  - 底层 continuous=false + onend 自动重启：Chrome 在句中停顿也会自动结束单次
 *    会话，若就此提交会丢话；本 hook 把"自然结束"与"用户结束"区分开——
 *    * 自然结束（停顿/静音导致的 onend）→ 自动重启续听，已确认内容跨段累积；
 *    * 用户点击「完成作答」(stop) 才提交一次 onFinal(完整文本)；
 *    * 用户点击「取消」(cancel) 丢弃本次全部内容。
 *  - 因此口述中间停顿、思考、换气都不会中断体验，也不会丢已说内容；
 *  - 防呆：连续静音（从未识别到任何内容）2 段后停止并提示；单次聆听超过
 *    maxSessionSec 自动结束并提交，避免忘关一直监听。
 *
 * 用法：
 *   const voice = useVoiceInput({ lang:'zh-CN', onFinal:(text)=>setAnswer(text) });
 *   // voice.state: idle | listening | busy
 *   // voice.accumulated: 已确认的累积文本（跨自动续听），voice.interim: 当前实时片段
 *   // UI 预览可拼 accumulated + interim；voice.error: { code,title,hint } | null
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** 当前浏览器是否支持语音识别（Chrome / Edge 系返回 true） */
export function isSpeechSupported() {
  if (typeof window === "undefined") return false;
  const w = window;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** 归一化错误码 → 面向用户的中文提示 */
export function describeVoiceError(code) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return { title: "麦克风权限被拒绝", hint: "请在浏览器地址栏的网站设置中允许「麦克风」后重试" };
    case "audio-capture":
      return { title: "无法使用麦克风", hint: "请确认已连接并启用麦克风设备后重试" };
    case "no-speech":
      return { title: "没有听到声音", hint: "请靠近麦克风、清晰说出你的回答后再试一次" };
    case "network":
      return { title: "识别服务连接失败", hint: "语音识别需要联网，可稍后重试，或直接打字作答" };
    case "language-not-supported":
      return { title: "当前语言不受支持", hint: "请改用文字输入" };
    case "aborted":
      return { title: "识别被中断", hint: "请重新开始" };
    default:
      return { title: "语音识别出错", hint: "可重试，或直接打字作答" };
  }
}

/** 需要停止且提示用户的错误（不自动续听） */
const FATAL_CODES = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "network",
  "language-not-supported",
]);

export function useVoiceInput({ lang = "zh-CN", onFinal, maxSessionSec = 150 } = {}) {
  const [supported] = useState(() => isSpeechSupported());
  const [state, setState] = useState("idle"); // idle | listening | busy
  const [accumulated, setAccumulated] = useState(""); // 已确认累积（跨自动续听）
  const [interim, setInterim] = useState(""); // 当前实时片段
  const [error, setError] = useState(null); // { code, title, hint } | null

  const recRef = useRef(null); // 当前实例
  const stopReqRef = useRef(false); // 用户是否点了「完成作答」（stop）
  const cancelledRef = useRef(false); // 是否被取消（丢弃）
  const silentEndsRef = useRef(0); // 连续"无任何内容"的自然结束次数（防呆）
  const startedAtRef = useRef(0);
  const finalBufRef = useRef(""); // 已确认(final)片段累积
  const interimBufRef = useRef(""); // 当前一轮的实时片段（自然结束时并入累积，防丢）
  const lastErrorRef = useRef(null); // 最近一次 onerror 码（onend 时决策用）
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const langRef = useRef(lang);
  langRef.current = lang;
  const maxSecRef = useRef(maxSessionSec);
  maxSecRef.current = maxSessionSec;

  /** 把累积写回 React state（供 UI 展示累积进度） */
  const syncAccumulated = useCallback((t) => {
    finalBufRef.current = t;
    setAccumulated(t);
  }, []);

  /** 开始一轮识别（首次由 start 调，之后由 onend 自动续听调） */
  const openSession = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || recRef.current) return;
    const rec = new SR();
    rec.lang = langRef.current;
    rec.interimResults = true;
    rec.continuous = false; // 靠 onend 重启实现"伪连续"，兼容性与可控性最好
    rec.maxAlternatives = 1;

    recRef.current = rec;
    interimBufRef.current = "";
    setInterim("");
    setError(null);

    rec.onresult = (ev) => {
      let interimText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const seg = res[0]?.transcript || "";
        if (res.isFinal) {
          finalBufRef.current += seg;
          interimText = "";
        } else {
          interimText += seg;
        }
      }
      interimBufRef.current = interimText;
      if (interimText) setInterim(interimText);
      // 有确认内容时同步累积展示
      if (finalBufRef.current) setAccumulated(finalBufRef.current);
    };

    rec.onerror = (ev) => {
      const code = ev?.error || "unknown";
      lastErrorRef.current = code;
      if (code === "aborted" && cancelledRef.current) return;
      if (code === "no-speech") return; // 静音结束，由 onend 决策是否续听
      if (FATAL_CODES.has(code)) {
        // 致命错误：停在这里，onend 会收尾（保留本提示不续听）
        setError({ code, ...describeVoiceError(code) });
      }
    };

    rec.onend = () => {
      if (recRef.current !== rec) return; // 已被 stop/cancel/卸载接管
      recRef.current = null;

      // 未确认的实时片段并入累积，防止自然结束时丢最后一句
      if (interimBufRef.current) {
        finalBufRef.current += interimBufRef.current;
        interimBufRef.current = "";
      }
      setAccumulated(finalBufRef.current);
      setInterim("");

      const errCode = lastErrorRef.current;
      lastErrorRef.current = null;
      const fatal = errCode && FATAL_CODES.has(errCode);

      // 1) 用户主动 stop：提交
      if (stopReqRef.current) {
        stopReqRef.current = false;
        const text = finalBufRef.current.trim();
        setState("idle");
        if (text) {
          try { onFinalRef.current?.(text); } catch { /* noop */ }
        } else if (!fatal && !cancelledRef.current) {
          setError({ code: "no-speech", ...describeVoiceError("no-speech") });
        }
        return;
      }

      // 2) 已取消 / 致命错误：停下并（若致命）保留错误提示
      if (cancelledRef.current) {
        setState("idle");
        return;
      }
      if (fatal) {
        setState("idle");
        return;
      }

      // 3) 自然结束（停顿/静音）：看是否需要续听
      if (finalBufRef.current.trim()) {
        silentEndsRef.current = 0; // 有内容：静音计数清零，随时续听
      } else {
        silentEndsRef.current += 1;
      }
      const overLimit = Date.now() - startedAtRef.current > maxSecRef.current * 1000;

      if (silentEndsRef.current >= 2) {
        // 从未识别到任何内容且连续两段静音 → 判定为没在说话
        setError({ code: "no-speech", ...describeVoiceError("no-speech") });
        setState("idle");
        return;
      }
      if (overLimit && !finalBufRef.current.trim()) {
        setError({ code: "no-speech", ...describeVoiceError("no-speech") });
        setState("idle");
        return;
      }
      if (overLimit) {
        // 已超最长聆听：自动定稿提交
        const text = finalBufRef.current.trim();
        setState("idle");
        if (text) {
          try { onFinalRef.current?.(text); } catch { /* noop */ }
        }
        return;
      }
      // 静默续听（保持 listening 状态不变，对用户无感）
      openSession();
    };

    try {
      rec.start();
    } catch {
      recRef.current = null;
      setError({ code: "unknown", ...describeVoiceError("unknown") });
      setState("idle");
    }
  }, []);

  /** 开始聆听（需在用户手势内调用；麦克风权限由浏览器弹窗处理） */
  const start = useCallback(() => {
    if (!supported) return;
    if (recRef.current) return; // 已在聆听
    stopReqRef.current = false;
    cancelledRef.current = false;
    silentEndsRef.current = 0;
    finalBufRef.current = "";
    startedAtRef.current = Date.now();
    setAccumulated("");
    setError(null);
    setState("listening");
    openSession();
  }, [supported, openSession]);

  /** 手动完成：停止聆听并提交累积文本（点「完成作答」） */
  const stop = useCallback(() => {
    if (!recRef.current) return;
    stopReqRef.current = true;
    setState("busy"); // 等待浏览器 flush 最终结果
    try { recRef.current.stop(); } catch { /* noop */ }
  }, []);

  /** 取消本次识别：丢弃全部内容，不回调 */
  const cancel = useCallback(() => {
    const r = recRef.current;
    if (!r) {
      stopReqRef.current = false;
      setAccumulated("");
      setInterim("");
      setError(null);
      setState("idle");
      return;
    }
    cancelledRef.current = true;
    recRef.current = null; // 使迟到的 onend 失效
    try { r.abort(); } catch { /* noop */ }
    stopReqRef.current = false;
    finalBufRef.current = "";
    setAccumulated("");
    setInterim("");
    setError(null);
    setState("idle");
  }, []);

  // 卸载时清理（丢弃未完成识别）
  useEffect(() => {
    return () => {
      const r = recRef.current;
      if (r) {
        cancelledRef.current = true;
        try { r.abort(); } catch { /* noop */ }
      }
      recRef.current = null;
    };
  }, []);

  return { supported, state, accumulated, interim, error, start, stop, cancel };
}

export default useVoiceInput;
