import OpenAI from "openai";
import dotenv from "dotenv";
// override:true —— 本地存在 .env 时以其为准（防系统/Shell 预设的 OPENAI_BASE_URL 与 .env 的 KEY 错配导致 401）。
// 云端(Render/无 .env 文件):dotenv 找不到文件不写入任何值,注入的环境变量照常生效,PORT 也不会被覆盖。
dotenv.config({ override: true });

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});

export const MODEL_NAME = process.env.OPENAI_MODEL || "gpt-4o-mini";
