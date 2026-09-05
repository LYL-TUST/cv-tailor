/**
 * useTTS —— 面试官语音合成封装（Web Speech API SpeechSynthesis, P2 面试官读题/追问）
 *
 * 产品背景：P2「真人面试循环」——面试官读题（TTS）、念追问，让模拟面试从
 * 「看题作答」升级为「听题作答」。与 P1 语音识别（useVoiceInput）对称：
 *  识别 = 用户开口（输入），合成 = 面试官开口（输出）。
 *
 * 设计要点（与产品「本地优先 / 隐私」叙事一致）：
 *  1. 合成走浏览器内置 speechSynthesis，纯前端、零成本、零上传；
 *  2. 音色优先选系统本地中文语音（zh-CN localService，如 Microsoft Huihui），
 *     无本地音色时退回任意 zh 音色（如 Google 普通话）；
 *  3. 浏览器不支持时 supported=false，调用方只显示文字题目，静默降级；
 *  4. 自动播放限制：speechSynthesis 需要用户手势激活。本项目只在两类时机
 *     自动朗读——① 换题（在「上一题/下一题」点击手势栈内同步调用 speak）；
 *     ② 其余场景一律由用户点按钮触发（题卡「面试官读题」/追问卡「念出追问」），
 *     避免网络请求返回后无手势导致的静音问题；
 *  5. 切题/开始语音作答时由调用方 stop()，避免声音串场。
 *
 * 用法：
 *   const tts = useTTS({ lang: 'zh-CN' });
 *   tts.speak('第 1 题。' + question);          // 返回 boolean（是否成功进入朗读）
 *   tts.speaking;                               // 朗读中（UI 显示停止按钮）
 *   tts.stop();                                 // 手动停止
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** 当前浏览器是否支持语音合成 */
export function isTTSSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function useTTS({ lang = "zh-CN" } = {}) {
  const [supported] = useState(isTTSSupported);
  const [speaking, setSpeaking] = useState(false);
  const voiceRef = useRef(null); // 已选中的中文音色（缓存，voices 异步加载后刷新）

  /** 选择中文音色：优先本地（离线可用、无网络抖动），否则任意 zh 音色 */
  const pickVoice = useCallback(() => {
    if (!isTTSSupported()) return null;
    if (voiceRef.current) return voiceRef.current;
    try {
      const voices = window.speechSynthesis.getVoices() || [];
      const zh = voices.filter((v) => String(v.lang || "").toLowerCase().startsWith("zh"));
      voiceRef.current = zh.find((v) => v.localService) || zh[0] || null;
    } catch {
      voiceRef.current = null;
    }
    return voiceRef.current;
  }, []);

  // 音色列表是异步加载的：首次与 voiceschanged 时刷新缓存；卸载时停止朗读
  useEffect(() => {
    if (!supported) return;
    const syn = window.speechSynthesis;
    voiceRef.current = null;
    pickVoice();
    const onVoices = () => {
      voiceRef.current = null;
      pickVoice();
    };
    try { syn.onvoiceschanged = onVoices; } catch { /* 老浏览器忽略 */ }
    return () => {
      try { syn.onvoiceschanged = null; } catch { /* noop */ }
      try { syn.cancel(); } catch { /* noop */ }
    };
  }, [supported, pickVoice]);

  /** 停止朗读（幂等） */
  const stop = useCallback(() => {
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    setSpeaking(false);
  }, []);

  /**
   * 朗读一段文本。
   * @param {string} text 朗读内容
   * @returns {boolean} 是否成功进入朗读（不支持/空文本返回 false）
   * 说明：speak 前先 cancel 清队列（避免多段叠加）；Chrome 上 cancel 后立即
   * speak 偶发失声，此时用户点一次「读题」按钮即可重试，不做复杂规避。
   */
  const speak = useCallback((text) => {
    if (!supported || !text || !String(text).trim()) return false;
    const syn = window.speechSynthesis;
    try { syn.cancel(); } catch { /* noop */ }
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = lang;
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1;
    u.pitch = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    try {
      syn.speak(u);
    } catch {
      setSpeaking(false);
      return false;
    }
    setSpeaking(true);
    return true;
  }, [supported, lang, pickVoice]);

  return { supported, speaking, speak, stop };
}

export default useTTS;
