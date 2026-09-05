// API client utilities for Resume Builder

// Base API URL - switches between dev and production
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// ==================== AI Resume Writing APIs ====================

/**
 * Generate professional resume summary
 */
export async function generateSummary({ fullName, title, skills, tone = 'professional' }) {
  return fetchAPI('/api/ai/generate-summary', {
    method: 'POST',
    body: JSON.stringify({ fullName, title, skills, tone }),
  });
}

/**
 * Generate bullet points for experience
 */
export async function generateBullets({ jobTitle, company, responsibilities, tone = 'professional' }) {
  return fetchAPI('/api/ai/generate-bullets', {
    method: 'POST',
    body: JSON.stringify({ jobTitle, company, responsibilities, tone }),
  });
}

/**
 * Improve existing bullet point
 */
export async function improveBullet({ bulletPoint, addMetrics = false }) {
  return fetchAPI('/api/ai/improve-bullet', {
    method: 'POST',
    body: JSON.stringify({ bulletPoint, addMetrics }),
  });
}

/**
 * Convert experience to STAR format
 */
export async function convertToStar({ experience, bullets }) {
  return fetchAPI('/api/ai/convert-to-star', {
    method: 'POST',
    body: JSON.stringify({ experience, bullets }),
  });
}

/**
 * Generate employment gap explanation
 */
export async function fillGaps({ gapPeriod, reason }) {
  return fetchAPI('/api/ai/fill-gaps', {
    method: 'POST',
    body: JSON.stringify({ gapPeriod, reason }),
  });
}

/**
 * Field-level polish: rewrite language/structure only, keep facts intact
 */
export async function polishText({ text, kind = 'bullet' }) {
  return fetchAPI('/api/ai/polish-text', {
    method: 'POST',
    body: JSON.stringify({ text, kind }),
  });
}

// ==================== ATS Analyzer APIs ====================

/**
 * Analyze resume against job description
 */
export async function analyzeATS({ resumeData, jobDescription }) {
  return fetchAPI('/api/ats/analyze', {
    method: 'POST',
    body: JSON.stringify({ resumeData, jobDescription }),
  });
}

/**
 * Get keyword suggestions for job title
 */
export async function getATSKeywords({ jobTitle, industry }) {
  return fetchAPI('/api/ats/keywords', {
    method: 'POST',
    body: JSON.stringify({ jobTitle, industry }),
  });
}

/**
 * [增量] 语义级 JD 匹配诊断：逐条职责语义分析
 */
export async function semanticMatch({ resumeData, jobDescription }) {
  return fetchAPI('/api/ats/semantic-match', {
    method: 'POST',
    body: JSON.stringify({ resumeData, jobDescription }),
  });
}

/**
 * [增量] 建议质量 verifier：独立校验建议是否相关/具体/诚实
 */
export async function verifySuggestions({ resumeText, jobDescription, suggestions, missingKeywords }) {
  return fetchAPI('/api/ats/verify-suggestions', {
    method: 'POST',
    body: JSON.stringify({ resumeText, jobDescription, suggestions, missingKeywords }),
  });
}

// ==================== Template APIs ====================

/**
 * Get all templates
 */
export async function getTemplates() {
  return fetchAPI('/api/templates');
}

/**
 * Get specific template by ID
 */
export async function getTemplate(id) {
  return fetchAPI(`/api/templates/${id}`);
}

// ==================== Interview APIs ====================

/**
 * Generate interview questions
 */
export async function generateInterviewQuestions({
  jobTitle,
  jobDescription,
  resumeBrief,
  interviewType = 'mixed',
  count = 5,
  difficulty = 'progressive',
  focusCategories = [],
  style = 'standard',
}) {
  return fetchAPI('/api/interview/generate', {
    method: 'POST',
    body: JSON.stringify({ jobTitle, jobDescription, resumeBrief, interviewType, count, difficulty, focusCategories, style }),
  });
}

/**
 * Answer-vs-resume consistency check (回答-简历矛盾点对照)
 * 把回答与简历原文逐点比对:回答提到但简历没有 / 简历声明但回答说不清 / 明显矛盾
 */
export async function consistencyCheck({ question = '', userAnswer, resumeBrief, followUpAnswer = '' }) {
  return fetchAPI('/api/interview/consistency-check', {
    method: 'POST',
    body: JSON.stringify({ question, userAnswer, resumeBrief, followUpAnswer }),
  });
}

/**
 * Evaluate interview answer
 * P2 追问：followUpQuestion / followUpAnswer 可选——有追问时评估综合首答与补答
 */
export async function evaluateAnswer({ question, userAnswer, questionType = 'behavioral', jobTitle = '', jobDescription = '', resumeBrief = '', followUpQuestion = '', followUpAnswer = '', style = 'standard' }) {
  return fetchAPI('/api/interview/evaluate', {
    method: 'POST',
    body: JSON.stringify({ question, userAnswer, questionType, jobTitle, jobDescription, resumeBrief, followUpQuestion, followUpAnswer, style }),
  });
}

/**
 * Generate interviewer follow-up question (P2 真人面试循环)
 * 基于候选人对某题的首答，生成 1 条追问
 */
export async function generateFollowUp({ question, userAnswer, questionType = 'behavioral', jobTitle = '', jobDescription = '', resumeBrief = '', style = 'standard' }) {
  return fetchAPI('/api/interview/follow-up', {
    method: 'POST',
    body: JSON.stringify({ question, userAnswer, questionType, jobTitle, jobDescription, resumeBrief, style }),
  });
}

/**
 * Generate whole-session review report (整场复盘:LLM 跨题归纳;追问命中率等统计由前端本地计算)
 */
export async function generateSessionReport({ jobTitle = '', records = [] }) {
  return fetchAPI('/api/interview/session-report', {
    method: 'POST',
    body: JSON.stringify({ jobTitle, records }),
  });
}

/**
 * Get interview tips
 */
export async function getInterviewTips({ jobTitle, interviewType = 'general' }) {
  return fetchAPI('/api/interview/tips', {
    method: 'POST',
    body: JSON.stringify({ jobTitle, interviewType }),
  });
}

// ==================== PDF Export APIs ====================

/**
 * Generate and download PDF resume
 */
export async function generatePDF({ resumeData, templateId = 'ats-optimized' }) {
  const response = await fetch(`${API_URL}/api/pdf/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeData, templateId }),
  });

  if (!response.ok) {
    throw new Error('PDF generation failed');
  }

  // For now, return JSON until PDF generation is implemented
  return await response.json();
}

/**
 * Generate DOCX resume
 */
export async function generateDOCX({ resumeData }) {
  return fetchAPI('/api/pdf/generate-docx', {
    method: 'POST',
    body: JSON.stringify({ resumeData }),
  });
}

/**
 * 下载 DOCX 文件：后端返回二进制流，前端转 Blob 触发保存
 */
export async function downloadDOCX({ resumeData }) {
  const response = await fetch(`${API_URL}/api/pdf/generate-docx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeData }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'DOCX 生成失败' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${resumeData?.personalInfo?.name?.replace(/\s+/g, '_') || 'Resume'}_Resume.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 简历导入：上传 PDF/DOCX 文件 → 后端解析 + LLM 结构化
 * 注意：FormData 请求不能手动设置 Content-Type（浏览器需自动生成 boundary）
 */
export async function importResume(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/api/import/parse-resume`, {
    method: 'POST',
    body: formData,
  });

  const result = await response.json().catch(() => ({ error: '导入请求失败' }));
  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result;
}

// ==================== Auth & Cloud Sync APIs (Phase 2) ====================

function authHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

/**
 * 注册（账号为可选增值：跨设备云同步）
 */
export async function registerUser({ email, password, nickname }) {
  return fetchAPI('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, nickname }),
  });
}

export async function loginUser({ email, password }) {
  return fetchAPI('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function fetchMe(token) {
  return fetchAPI('/api/auth/me', { headers: authHeaders(token) });
}

/** 读取云端密文（端到端加密，服务器只存密文） */
export async function fetchVault(token) {
  return fetchAPI('/api/vault', { headers: authHeaders(token) });
}

/** 上传/覆盖云端密文 */
export async function pushVault(token, blob) {
  return fetchAPI('/api/vault', {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ blob }),
  });
}

/** 删除云端备份 */
export async function deleteVault(token) {
  return fetchAPI('/api/vault', {
    method: 'DELETE',
    headers: authHeaders(token),
  });
}

export default {
  // AI Resume Writing
  generateSummary,
  generateBullets,
  improveBullet,
  convertToStar,
  fillGaps,
  
  // ATS Analyzer
  analyzeATS,
  getATSKeywords,
  semanticMatch,
  verifySuggestions,
  
  // Templates
  getTemplates,
  getTemplate,
  
  // Interview
  generateInterviewQuestions,
  evaluateAnswer,
  generateFollowUp,
  generateSessionReport,
  consistencyCheck,
  getInterviewTips,
  
  // PDF Export
  generatePDF,
  generateDOCX,
  downloadDOCX,

  // Resume Import
  importResume,

  // Auth & Cloud Sync
  registerUser,
  loginUser,
  fetchMe,
  fetchVault,
  pushVault,
  deleteVault,
};
