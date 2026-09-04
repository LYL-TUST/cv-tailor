# CV-Tailor · 简历智造

> 一个**本地优先**的全栈 AI 简历产品:导入旧简历 → AI 打磨 → 按 JD 逐条诊断 → 模拟面试 → 导出投递。
> 不做账号也能完整使用;登录仅用于端到端加密的跨设备云同步。

[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
![Node](https://img.shields.io/badge/Node-%3E%3D18-339933)
![React](https://img.shields.io/badge/React-19-61dafb)
![Vite](https://img.shields.io/badge/Vite-7-646cff)
![Express](https://img.shields.io/badge/Express-4-000)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003b57)
![AI](https://img.shields.io/badge/LLM-OpenAI_Compatible-2563eb)

---

## 🧭 一句话定位

**AI 不替你编,只帮你把经历裁剪得正好贴合目标 JD。**

市面上的简历工具,要么是"填空模板",要么是"AI 代写"——前者不会帮你表达,后者会替你编造。
CV-Tailor 走第三条路:**导入你的真实经历 → AI 只做结构化、量化、措辞打磨 → 贴住岗位 JD 逐条诊断 → 每条建议都经过真实性校验**。数据默认只存在你的浏览器里。

---

## ✨ 核心功能

| 模块 | 说明 |
|---|---|
| 📥 **简历导入** `/import` | 上传 PDF / Word,AI 自动结构化提取并预填编辑器;文件仅驻内存解析,不落盘、不存服务器 |
| ✏️ **AI 编辑器** `/editor` | 左右分屏实时预览;**多版本管理**(按公司/岗位各存一版);AI 生成个人简介、量化经历要点、STAR 结构化 |
| 🎨 **模板与主题** `/templates` | 4 套 ATS 友好模板(React 组件动态渲染,空区块自动隐藏)× 8 主色 × 3 字体族,实时预览 |
| 🎯 **JD 匹配诊断** `/ats` | 关键词层 + **语义级逐条职责**双栈分析;建议经独立 verifier 校验"相关 / 可执行 / 不诱导编造" |
| 🎤 **模拟面试** `/interview` | 按目标岗位出题,AI 逐题评估答案质量,历史会话可回看 |
| 📄 **导出投递** `/download` | 所见即所得 PDF(html2canvas + jsPDF)、真实 DOCX(后端 `docx` 库)、纯文本 |
| 👤 **个人中心** `/me` | 本地历史管理、加密备份导出/恢复、**登录后端到端加密云同步**(服务器只存密文) |
| 📊 **数据看板** `/analytics` | 本地隐私埋点(设备假 ID、零上传),演示"埋点 → 漏斗 → 决策"数据闭环 |

---

## 🏗️ 关键设计

1. **隐私优先是产品定位,不是功能点**
   默认零注册、数据全在 `localStorage`;登录是**可选项**,仅用于跨设备同步,上传前在浏览器端用密码派生密钥加密(PBKDF2 + AES-GCM),服务器无法解密;密码即钥匙,忘记无法找回。

2. **对抗"AI 简历造假"——真实性护栏**
   - 导入的 Prompt 温度 0.1 + Zod 强校验,严禁编造原文不存在的信息,缺字段输出核对清单
   - ATS 的每条改进建议都经独立模型校验是否"诚实",不诱导用户无中生有
   - 前端所有生成按钮旁都标注"需你确认事实"

3. **分层可演进的架构**
   前端以组件驱动的多版本 store 为中心,主题用 CSS 变量注入实现预览/导出一致;后端路由与 LLM/解析逻辑解耦,便于替换模型供应商(OpenAI 兼容协议,实测可跑 DeepSeek)。

---

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · Vite 7 · React Router · 纯 CSS 设计系统(mobile-first,零 UI 框架依赖) |
| 后端 | Node.js · Express · Helmet · CORS · express-rate-limit |
| AI | OpenAI 兼容客户端(`/v1/chat/completions`),供应商可替换 |
| 解析/导出 | pdf-parse · mammoth · multer · docx |
| 数据 | 浏览器 localStorage + better-sqlite3(WAL) |
| 安全 | scrypt 密码哈希 · HMAC-SHA256 无状态令牌 · AES-GCM 端到端加密 |

---

## 🚀 本地快速开始

```bash
# 1. 后端(端口 5000)
cd server
npm install
cp .env.example .env        # 填入 OPENAI_API_KEY(OpenAI 兼容供应商均可)
npm run dev

# 2. 前端(端口 5173)
cd ../client
npm install
npm run dev
```

浏览器打开 **http://localhost:5173** 即可。后端 `.env` 示例见 `server/.env.example`;不登录即完整可用,登录仅用于云同步。

---

## 📁 目录结构

```
.
├── client/src
│   ├── components/
│   │   ├── Layout.jsx        # 左侧边栏应用壳(分组导航 + 移动端抽屉)
│   │   ├── PageHead.jsx      # 内页统一页头
│   │   └── templates/        # 4 套简历模板(React 组件)
│   ├── pages/
│   │   ├── Dashboard.jsx     # 首页工作台(欢迎区 + 快捷入口)
│   │   ├── Editor.jsx        # 简历编辑器(多版本 + AI 写作)
│   │   ├── Import.jsx        # 简历导入(拖拽上传 + AI 结构化)
│   │   ├── Templates.jsx     # 模板与主题定制
│   │   ├── ATS.jsx           # JD 匹配诊断
│   │   ├── Interview.jsx     # 模拟面试
│   │   ├── Download.jsx      # PDF / DOCX / TXT 导出
│   │   ├── Me.jsx            # 个人中心(历史/备份/云同步)
│   │   └── Analytics.jsx     # 本地数据看板
│   ├── utils/
│   │   ├── resumeStore.js    # 多版本简历本地存储
│   │   ├── historyStore.js   # ATS / 面试历史
│   │   ├── theme.js          # 主题定制(CSS 变量)
│   │   ├── analytics.js      # 本地隐私埋点
│   │   ├── backup.js         # AES-GCM 加密备份/恢复
│   │   └── api.js            # 后端 API 客户端
│   └── styles.css            # 设计系统(CSS 变量 + 应用壳 + 组件)
└── server/src
    ├── index.js              # Express 入口(错误/启动诊断)
    ├── db.js                 # SQLite(WAL, users / vault)
    ├── security.js           # scrypt + HMAC 令牌 + requireAuth
    ├── routes/
    │   ├── ai.js             # AI 写作(简介/要点/STAR/补空)
    │   ├── ats.js            # ATS 诊断(基础/语义/建议校验)
    │   ├── import.js         # 简历导入解析
    │   ├── interview.js      # 模拟面试
    │   ├── pdf.js            # DOCX 导出
    │   ├── auth.js           # 注册/登录/me
    │   └── vault.js          # 加密云同步(只存密文)
    └── services/
        └── openaiClient.js   # OpenAI 兼容客户端
```

---

## 📄 文档

| 文档 | 内容 |
|---|---|
| [PRD](docs/PRD.md) | 产品需求文档:定位 / Persona / 竞品 / MoSCoW / 失败模式 / 事件规范 |
| [架构与数据模型](docs/ER_DIAGRAM.md) | 前后端模块、存储键、多版本迁移 |
| [方法论与框架](docs/METHODOLOGIES_AND_FRAMEWORKS.md) | 用到的产品/AI 方法论(面试可讲) |
| [演示讲解脚本](docs/PRESENTATION_GUIDE.md) | 给面试官演示时的叙事脚本与问答准备 |
| [功能测试报告](docs/功能测试报告-20260904.md) | 真实简历端到端测试:12/12 通过 |
| [本地快速启动与排障](docs/QUICKSTART.md) | AI 配置、端口冲突排查 |
| [部署说明](docs/DEPLOYMENT.md) | Render / Vercel 部署 |
| [后端部署](docs/BACKEND_DEPLOYMENT.md) | 后端上线配置与故障排查 |
| [Node 升级说明](docs/NODE_UPGRADE.md) | 环境升级记录 |

---

## 🗺️ 路线图

- [x] AI 写作(简介 / 要点 / STAR)+ 4 套模板与主题
- [x] PDF / DOCX 真实导出
- [x] 本地隐私埋点 + 数据看板
- [x] PDF / Word 导入 → AI 结构化
- [x] 多版本简历管理
- [x] ATS 双栈诊断(关键词 + 语义)+ 建议真实性校验
- [x] 个人中心:历史 / 加密备份 / 一键清空
- [x] Phase 2:可选账号 + 端到端加密云同步(SQLite)
- [ ] 求职信(Cover Letter)生成
- [ ] 2 页以上长简历支持

---

## 🔒 隐私与安全

- 默认本地:简历、ATS 记录、面试历史只存在于浏览器
- 可选云同步:服务器只存 AES-GCM 密文,无解密能力
- 埋点零上报、无 PII;一键导出/清空
- 详见 [docs/PRD.md](docs/PRD.md) 隐私原则章节

## 📄 许可证

MIT License
