# Vercel 部署指南 - AI 简历创作助手

## ✅ 当前部署状态

前端已部署在 Vercel 上,以下是需要核对的事项:

---

## 🔍 Vercel 部署核对清单

### 1. 前端部署(Vercel)

✅ **配置文件已就绪:**
- `vercel.json` - Vercel 构建配置
- `.gitignore` - 排除 node_modules
- `README.md` - 项目文档

**Vercel 配置:**
```
Framework Preset: Vite
Root Directory: client
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

---

### 2. 后端部署

⚠️ **后端默认不部署在 Vercel 上**

后端需要单独部署,可选方案:

#### 方案 A:Render(推荐)
1. 打开 [render.com](https://render.com)
2. 创建新的 "Web Service"
3. 关联你的 GitHub 仓库
4. 配置项:
   - **Root Directory**:`server`
   - **Build Command**:`npm install`
   - **Start Command**:`npm start`
   - **Environment**:Node
5. 添加环境变量:
   ```
   OPENAI_API_KEY=你的真实API密钥
   ```

#### 方案 B:Railway
1. 打开 [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. 设置根目录:`server`
4. 添加环境变量:`OPENAI_API_KEY`

#### 方案 C:Vercel Serverless(进阶)
把 Express 路由改造为 Vercel Serverless 函数。

---

### 3. 连接前端与后端

后端部署完成后,更新前端的 API 地址:

**创建** `client/.env.production`:
```env
VITE_API_URL=https://你的后端地址.com
```

**确认** 组件中的 API 调用使用该变量:
```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

fetch(`${API_URL}/api/ai/generate-summary`, {
  method: 'POST',
  // ...
});
```

---

## 🚀 部署更新

修改代码后:

```bash
# 添加改动
git add .

# 提交
git commit -m "添加 Vercel 配置与 README"

# 推送到 GitHub
git push origin main
```

推送到 GitHub 后 Vercel 会自动重新部署。

---

## 🔧 故障排查

### 问题:Vercel 构建失败

**方案 1:** 在 Vercel 控制台查看构建日志
**方案 2:** 确认 `package.json` 的 scripts 配置正确:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### 问题:路由刷新出现 404

**方案:** SPA 需要配置路由重写。

检查 `vercel.json`:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

### 问题:API 调用失败

**方案:**
1. 先部署后端
2. 更新 `server/src/index.js` 中的 CORS 配置:
```javascript
app.use(cors({
  origin: ["http://localhost:5173", "https://你的-vercel-应用.vercel.app"],
  credentials: true
}));
```

### 问题:环境变量不生效

**方案:**
1. 在 Vercel 控制台添加:Settings → Environment Variables
2. 前端变量必须以 `VITE_` 为前缀
3. 添加变量后需重新部署

---

## 📊 当前可用与不可用的功能

### ✅ 目前可用(仅前端)
- 落地页
- 导航
- 静态内容
- 页面间路由

### ⚠️ 尚不可用(需要后端)
- AI 简历生成
- ATS 匹配诊断
- 模板数据获取
- 模拟面试
- PDF 导出

以上功能都需要后端完成部署并连通。

---

## 🎯 下一步

1. **部署后端** → 选择 Render 或 Railway
2. **获取后端地址** → 复制部署后的 URL
3. **更新前端** → 把后端地址写入环境变量
4. **测试 API** → 确认所有接口可用
5. **更新 CORS** → 后端放行你的 Vercel 域名

---

## 📝 常用部署命令

```bash
# 把 node_modules 移出 git 追踪(如果误提交过)
git rm -r --cached client/node_modules server/node_modules
git commit -m "Remove node_modules"
git push

# 部署到 Vercel
cd client
vercel --prod

# 或者交给 GitHub 自动部署
git add .
git commit -m "更新部署配置"
git push origin main
```

---

**需要帮助?** 查看 Vercel 部署日志或后端托管平台日志中的报错信息。
