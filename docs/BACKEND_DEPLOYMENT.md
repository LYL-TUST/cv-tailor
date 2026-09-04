# AI 简历创作助手 - 后端部署指南

## 🚀 快速开始 - 本地运行后端

### 1. 配置环境变量

后端需要 OpenAI API Key 才能调用 AI 能力。

**检查 .env 文件是否存在:**
```bash
cd server
ls -la .env
```

**如果 .env 存在但 AI 功能不可用:**
说明 `.env` 里缺少有效的 OpenAI API Key,编辑它:
```bash
nano .env  # 或使用任意文本编辑器
```

添加:
```
PORT=5000
OPENAI_API_KEY=sk-proj-你的真实OpenAI密钥
NODE_ENV=development
```

**获取 OpenAI API Key:**
1. 打开 https://platform.openai.com/api-keys
2. 登录或注册账号
3. 点击 "Create new secret key"
4. 复制密钥(以 `sk-proj-...` 开头)
5. 粘贴到 `.env` 文件中

### 2. 启动后端服务

```bash
cd server
npm run dev
```

应看到:
```
🚀 Server running on http://localhost:5000
```

### 3. 启动前端

在**新终端**中:
```bash
cd client
npm run dev
```

应看到:
```
VITE ready in XXX ms
➜  Local:   http://localhost:5173/
```

### 4. 验证 AI 功能

1. 浏览器打开 http://localhost:5173
2. 进入编辑器页面
3. 填写姓名、目标职位、技能
4. 点击 "AI 生成个人简介 ✨"
5. 成功的话即可看到 AI 生成的简介!

---

## ☁️ 部署后端到 Render(推荐)

### 第 1 步:部署前准备

**更新 package.json 脚本:**
文件已配置好 ✅

**创建 render.yaml:**
文件已创建好 ✅
