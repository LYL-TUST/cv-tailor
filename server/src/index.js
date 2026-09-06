import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
dotenv.config();

import aiRoutes from "./routes/ai.js";
import templateRoutes from "./routes/templates.js";
import pdfRoutes from "./routes/pdf.js";
import atsRoutes from "./routes/ats.js";
import interviewRoutes from "./routes/interview.js";
import importRoutes from "./routes/import.js";
import authRoutes from "./routes/auth.js";
import vaultRoutes from "./routes/vault.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowedOrigins = ['http://localhost:5173', 'https://aimycv.vercel.app'];
    if (allowedOrigins.includes(origin) || origin.includes('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(morgan("dev"));
// 请求体上限提到 2MB:ATS/面试等端点会整份提交简历数据(含排版 settings、
// 照片 base64、自定义模块),默认 100KB 会直接 413(PayloadTooLargeError)
app.use(express.json({ limit: "2mb" }));

// API Routes
app.use("/api/ai", aiRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/ats", atsRoutes);
app.use("/api/interview", interviewRoutes);
app.use("/api/import", importRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/vault", vaultRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "AI Resume Builder API is running" });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 API endpoints:`);
  console.log(`   - AI Resume Writing: /api/ai/*`);
  console.log(`   - ATS Analyzer: /api/ats/*`);
  console.log(`   - Templates: /api/templates`);
  console.log(`   - Mock Interview: /api/interview/*`);
  console.log(`   - PDF Export: /api/pdf/*`);
  console.log(`   - Resume Import: /api/import/*`);
  console.log(`   - Auth: /api/auth/*`);
  console.log(`   - Encrypted Vault Sync: /api/vault/*`);
});

// 端口被占用时给出清晰指引，而不是静默退出
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ 端口 ${PORT} 已被占用。可能有一个旧的后端进程还在运行。`);
    console.error(`   解决：执行以下命令找到并结束占用进程后重试：`);
    console.error(`     netstat -ano | findstr :${PORT}`);
    console.error(`     taskkill /PID <上方查到的PID> /F`);
    process.exit(1);
  }
  throw err;
});
