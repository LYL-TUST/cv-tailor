
# AI 简历创作助手 🚀

一个现代化的全栈 AI 简历制作应用,帮助学生与求职者在几分钟内产出 **ATS 友好**的专业简历。技术栈:**React 19** + **Node.js** + **OpenAI GPT-4**。

![项目状态](https://img.shields.io/badge/Status-Complete-success)
![技术栈](https://img.shields.io/badge/Stack-MERN-blue)

## 🌟 项目概述

本项目解决简历创作中的两大痛点:**"无从下笔"** 与 **"排版噩梦"**。用生成式 AI 负责内容产出、React 负责实时渲染,用户无需再与 Word 格式搏斗,即可生成专业、能通过 ATS 机器初筛的简历。

**核心理念:隐私优先。** 所有用户数据仅存于浏览器 `LocalStorage`,不落任何中央数据库,隐私完全由用户掌控。

---

## 🚀 核心功能

### 1. 简历导入(`/import`)
- **冷启动加速:** 上传已有的 PDF / Word(.docx)简历,自动提取文本。
- **AI 结构化抽取:** LLM 将简历原文解析为结构化数据(temperature 0.1 + Zod 强校验),一键预填编辑器。
- **诚实性护栏:** Prompt 严禁编造原文不存在的信息,识别缺失字段时给出核对清单。

### 2. 智能 AI 编辑器(`/editor`)
- **实时预览:** 分屏布局,所见即所得。
- **多版本管理:** 按公司/岗位各存一版简历,支持新建空白版、复制当前版、切换、重命名、删除。
- **AI 能力:**
    - **个人简介生成:** 基于目标职位生成专业简介。
    - **经历要点生成:** 产出量化、成就导向的要点。
    - **STAR 结构化:** 把流水账职责改写为 STAR 结构。
    - **履历空白补充:** AI 为职业空窗期提供专业的解释建议。

### 3. 智能模板(支持主题定制)
- **动态渲染:** 模板不是静态图片,而是随内容长度自适应的 **React 组件**。
- **条件渲染:** 智能隐藏空区块(如"工作经历"为空时,对应标题一并隐藏)。
- **主题定制:** 8 种主色调 × 3 种字体族(CSS 变量全局生效),编辑器预览与导出同步。
- **内置 4 套模板:**
    - 👔 **商务双栏(Professional):** 双栏布局,侧边栏联系方式。
    - 🎩 **经典居中(Classy):** 传统居中版式,优雅衬线字体。
    - 📝 **极简单栏(Simple):** 简约高可读性排版。
    - 🎨 **优雅深蓝(Stylish):** 深蓝页眉搭配金色点缀的现代设计。

### 4. ATS 匹配诊断(`/ats`)
- 将简历与目标 JD 对比分析,输出"匹配分"与缺失关键词建议。
- **语义级匹配:** 逐条 JD 职责做语义分析,而非仅关键词比对。
- **建议质量校验(verify-suggestions):** 独立校验 AI 建议是否相关/具体/诚实,防止简历造假导向。

### 5. 模拟面试(`/interview`)
- 按目标岗位生成面试题,评估用户答案,并给出面试技巧。

### 6. 多格式导出(`/download`)
- **所见即所得 PDF:** 基于 `html2canvas` + `jsPDF` 捕获 DOM 渲染结果,下载的 PDF 与预览**完全一致**(字体、配色、排版)。
- **Word(DOCX)导出:** 后端 `docx` 库真实生成,可继续编辑。
- **纯文本导出:** 兜底格式。

### 7. 本地数据看板(`/analytics`)
- **隐私埋点:** 设备假 ID + 匿名事件,数据仅存本地、零上传、可一键清空/导出。
- **漏斗视图:** 页面访问 → AI 生成 → ATS 分析 → 导出 PDF 的全链路转化。

---

## 🛠️ 技术架构

### 前端(Client)
- **框架:** React 19 + Vite(原生 ES Module,启动快)。
- **状态管理:**
    - **状态提升:** `Editor` 组件作为唯一数据源(Source of Truth),向表单与预览组件单向传递。
    - **LocalStorage:** 通过 `useEffect` 在挂载时加载、变更时持久化;多版本数据由 `resumeStore.js` 统一管理(含旧数据自动迁移与写穿兼容)。
- **样式:**
    - **纯 CSS:** 不依赖 Bootstrap/Tailwind,使用现代 CSS Grid 与 Flexbox 构建轻量自定义设计系统。
    - **响应式:** 移动优先 + 媒体查询。
    - **主题系统:** CSS 变量注入(`theme.js`),模板层与页面层解耦。

### 后端(Server)
- **运行时:** Node.js + Express。
- **安全:**
    - **Helmet:** 设置安全的 HTTP 响应头。
    - **CORS:** 限制 API 仅可从前端域名访问。
    - **限流:** 防止 API 滥用。
- **AI 引擎:**
    - 精心设计的 System Prompt 强制 OpenAI 返回合法 JSON Schema。
    - 使用 `Zod` 校验 AI 响应,防止脏数据导致前端崩溃。
- **文档解析:** `pdf-parse`(PDF 文本提取)+ `mammoth`(DOCX 文本提取),文件仅驻内存、不落盘。

---

## 💻 安装与启动

### 前置要求
- Node.js 18+
- OpenAI API Key

### 1. 克隆仓库
```bash
git clone https://github.com/jkj05/ai_resume_builder.git
cd ai_resume_builder
```

### 2. 启动后端
```bash
cd server
npm install
# 创建 .env 文件
echo "PORT=5000\nOPENAI_API_KEY=你的API密钥" > .env
npm run dev
```

### 3. 启动前端
```bash
cd client
npm install
npm run dev
```

打开 [http://localhost:5173](http://localhost:5173) 即可使用。

---

## 📁 目录结构

```
client/src/
├── components/
│   ├── templates/       # 4 套核心简历模板(React 组件)
│   │   ├── ProfessionalTemplate.jsx
│   │   ├── ClassyTemplate.jsx
│   │   ├── SimpleTemplate.jsx
│   │   └── StylishTemplate.jsx
│   └── Navbar.jsx
├── pages/
│   ├── Editor.jsx       # 简历编辑器(状态中枢 + 多版本管理条)
│   ├── Import.jsx       # 简历导入(上传 → AI 结构化 → 预填)
│   ├── Analytics.jsx    # 本地数据看板(漏斗/事件)
│   ├── Download.jsx     # PDF / DOCX / TXT 导出
│   └── Landing.jsx      # 落地页
├── utils/
│   ├── analytics.js     # 本地隐私埋点(设备假 ID + 事件存储)
│   ├── resumeStore.js   # 多版本简历存储(迁移/切换/写穿)
│   ├── theme.js         # 主题定制(CSS 变量注入)
│   └── api.js           # 后端 API 客户端
└── App.jsx              # 路由配置

server/src/
├── routes/
│   ├── ai.js            # AI 生成(简介/要点/STAR/补空)
│   ├── ats.js           # ATS 诊断(基础分/语义匹配/建议校验)
│   ├── import.js        # 简历导入(multer + pdf-parse/mammoth + LLM 结构化)
│   ├── interview.js     # 模拟面试
│   ├── pdf.js           # DOCX 真实生成
│   └── templates.js     # 模板元数据
└── services/
    └── openaiClient.js  # OpenAI 客户端
```

---

## 🔮 路线图

- [x] **核心:** AI 简历生成 + PDF 导出
- [x] **模板:** 4 套专业模板 + 主题定制(主色调 × 字体)
- [x] **隐私:** 纯 LocalStorage 实现,零数据上传
- [x] **导入:** PDF/DOCX 上传 → AI 结构化 → 预填编辑器
- [x] **多版本:** 按公司/岗位管理多份简历
- [x] **数据闭环:** 本地隐私埋点 + 数据看板
- [ ] **云端:** 可选云同步(opt-in,默认仍本地)
- [ ] **多页:** 支持 2 页以上简历
- [ ] **求职信:** AI 求职信(Cover Letter)生成器

---

## 📄 许可证

MIT License,可自由用于学习用途。
