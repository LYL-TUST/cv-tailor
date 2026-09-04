# ⚠️ 重要:Node.js 版本过旧

## 问题
你的 Node.js 版本(v12.22.9)太旧了。本项目最低要求 **Node.js 14+**,推荐 **Node.js 18+**。

Node 12 的限制:
- ❌ 不支持可选链操作符(`?.`)
- ❌ 与 OpenAI SDK v4 不兼容
- ❌ 与许多现代依赖不兼容

## 快速解决:升级 Node.js

### 方式 1:使用 NVM(推荐 - 最简单)

```bash
# 如果没装过 NVM,先安装
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 关闭并重新打开终端,然后:
nvm install 20
nvm use 20
nvm alias default 20

# 验证
node --version  # 应显示 v20.x.x
```

### 方式 2:使用 apt(Ubuntu/Pop!_OS)

```bash
# 卸载旧版 Node
sudo apt remove nodejs

# 添加 NodeSource 的 Node 20 软件源
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# 安装 Node 20
sudo apt install -y nodejs

# 验证
node --version  # 应显示 v20.x.x
```

### 升级 Node 之后:

1. **重装依赖:**
```bash
cd ~/Documents/ai_resume_builder-main/server
rm -rf node_modules package-lock.json
npm install

cd ../client
rm -rf node_modules package-lock.json
npm install
```

2. **启动后端:**
```bash
cd ~/Documents/ai_resume_builder-main/server
npm run dev
```

应看到:✅ `🚀 Server running on http://localhost:5000`

3. **启动前端(新终端):**
```bash
cd ~/Documents/ai_resume_builder-main/client
npm run dev
```

应看到:✅ `Local: http://localhost:5173/`

## 备选方案:使用 Docker(如果升级困难)

如果实在无法升级 Node,可以改用 Docker 打包固定版本的环境运行项目。
