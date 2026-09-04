# 🚀 快速排查:启用 AI 功能

## 问题
AI 功能不可用,通常是因为后端服务未启动,或没有配置有效的 OpenAI API Key。

## 解决方案 - 3 步搞定

### 第 1 步:获取 OpenAI API Key

1. 打开 https://platform.openai.com/api-keys
2. 登录(或注册免费账号)
3. 点击 **"Create new secret key"**
4. 复制密钥(以 `sk-proj-...` 或 `sk-...` 开头)

### 第 2 步:把 API Key 配置到后端

编辑 `server` 文件夹下的 `.env` 文件:

```bash
cd server
nano .env
```

将内容替换为:
```
PORT=5000
OPENAI_API_KEY=sk-proj-你的真实密钥
NODE_ENV=development
```

保存并退出(nano 编辑器:Ctrl+X,然后 Y,然后回车)

### 第 3 步:启动前后端服务

**终端 1 - 后端:**
```bash
cd server
npm run dev
```

看到 `🚀 Server running on http://localhost:5000` 即启动成功。

**终端 2 - 前端:**
```bash
cd client
npm run dev
```

看到 `Local: http://localhost:5173/` 即启动成功。

### 第 4 步:验证

1. 浏览器打开 http://localhost:5173
2. 进入**编辑器**页面
3. 填写:
   - 姓名:"张三"
   - 目标职位:"软件工程师"
   - 技能:"React, Node.js, Python"
4. 点击 **"AI 生成个人简介 ✨"**
5. 应能看到 AI 生成的简介出现在输入框中!

---

## 还是不能用?

### 查看后端日志
观察终端 1(后端)的报错,常见问题:
- ❌ `Error: Invalid API key` → OpenAI Key 填错了
- ❌ `EADDRINUSE` → 5000 端口被占用(可能有旧服务没关)
- ❌ `MODULE_NOT_FOUND` → 在 server 目录重新执行 `npm install`

### 直接测试后端
```bash
curl http://localhost:5000/api/templates
```

应返回包含模板信息的 JSON。

### 检查前端控制台
1. 打开浏览器开发者工具(F12)
2. 切到 Console 标签
3. 留意以下报错:
   - `Failed to fetch` → 后端没启动
   - `CORS error` → 前后端域名配置不匹配

---

## 下一步:部署到 Render

本地跑通后,可以部署到 Render 让应用上线:

1. 把代码推到 GitHub ✅(已完成)
2. 打开 https://render.com
3. 用 GitHub 注册/登录
4. 点击 **"New +" → "Web Service"**
5. 关联你的 `ai_resume_builder` 仓库
6. 配置项:
   - **Name:** ai-resume-builder-api
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
7. 添加环境变量:
   - **Key:** `OPENAI_API_KEY`
   - **Value:** 你的 OpenAI 密钥
8. 点击 **"Create Web Service"**

等待 5-10 分钟完成部署,你会得到类似这样的地址:
`https://ai-resume-builder-api.onrender.com`

然后把这个地址配置到前端的 API URL 即可上线!
