# 抖音直播流获取工具

> 🎬 一个优雅的网页工具，用于快速获取抖音直播间的直播流链接，并支持抖音视频下载

![Node.js](https://img.shields.io/badge/Node.js-16+-green) ![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Mac%20%7C%20Linux-blue) ![Version](https://img.shields.io/badge/Version-3.0.0-orange) ![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ 功能特性

### 直播流获取
- 🎯 **智能解析** — 自动识别抖音直播间链接，多策略并发解析
- 📡 **多清晰度** — 支持原画、超清、高清、标清、流畅多条直播流
- 📋 **一键复制** — 快速复制直播流链接
- 🎮 **在线预览** — 页面内直接播放直播流（支持 FLV / HLS）
- 🔑 **Cookie 支持** — 登录后可获取更多码率和限定内容

### 视频下载
- 🎬 **单视频解析** — 输入视频链接解析并下载无水印视频
- 📦 **批量下载** — 输入用户主页链接获取作品列表，批量下载

### 登录与认证
- 🤖 **一键自动登录** — 通过 Puppeteer 打开浏览器，扫码或账号登录后自动保存 Cookie
- ✏️ **手动 Cookie** — 支持手动粘贴 Cookie 字符串（适用于所有部署场景）
- 🛡️ **本地安全** — Cookie 仅存储在本地 `cookies.json`，不上传任何服务器

### 界面特性
- 📱 **响应式设计** — 完美支持手机端和 PC 端
- 🌙 **深色主题** — 护眼的深色界面设计，沉浸式体验
- 📊 **访客统计** — 内置悬浮访客统计窗口

---

## 🚀 快速开始

### 环境要求

- Node.js `>= 16.0.0`
- npm

### 安装

```bash
# 克隆项目
git clone <项目地址>
cd douyin-live-stream-fetcher

# 安装依赖
npm install
```

### 启动

```bash
# 启动服务（默认端口 3000）
npm start

# 自定义端口
PORT=8080 npm start
```

启动后访问 `http://localhost:3000` 即可使用。

---

## 🐧 Linux 部署

### 方式一：直接运行（开发 / 测试）

```bash
# 安装 Node.js（推荐 nvm）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 18 && nvm use 18

# 安装依赖并启动
npm install --production
npm start
```

### 方式二：PM2 守护进程（**推荐**）

```bash
npm install -g pm2
pm2 start server.js --name "douyin-live"
pm2 startup && pm2 save      # 设置开机自启

# 常用命令
pm2 status                    # 查看状态
pm2 logs douyin-live          # 实时日志
pm2 restart douyin-live       # 重启服务
```

### 方式三：Docker 容器

**Dockerfile**（在项目根目录创建）：

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t douyin-live .
docker run -d \
  --name douyin-live \
  -p 3000:3000 \
  --restart unless-stopped \
  douyin-live
```

### Nginx 反向代理（可选）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

> **注意**：一键登录功能（Puppeteer）需要本地桌面环境，Linux 服务器端建议使用**手动 Cookie** 方式。

---

## 🔑 登录 / Cookie 说明

获取 Cookie 可解锁更多码率和内容，有以下两种方式：

### 方式一：一键自动登录（本地推荐）

在页面顶部点击 **"🎯 一键登录抖音"**，服务端自动打开浏览器，在浏览器中完成扫码登录，Cookie 自动保存。

也可在命令行运行：

```bash
npm run login
```

### 方式二：手动粘贴 Cookie（服务器推荐）

1. 在浏览器打开 [https://www.douyin.com](https://www.douyin.com) 并登录
2. 按 `F12` → **Application** → **Cookies** → `https://www.douyin.com`
3. 在控制台执行 `document.cookie` 复制结果
4. 在页面顶部点击登录按钮 → 粘贴到弹窗中保存

---

## 📖 支持的链接格式

| 类型 | 示例 |
|------|------|
| 直播间完整链接 | `https://live.douyin.com/123456789` |
| 抖音直播链接 | `https://www.douyin.com/live/123456789` |
| 短链接 | `https://v.douyin.com/xxxxx` |
| 视频链接 | `https://www.douyin.com/video/123456789` |
| 用户主页 | `https://www.douyin.com/user/MS4wL...` |

---

## 🎮 播放器推荐

| 平台 | 推荐播放器 |
|------|-----------|
| Windows | PotPlayer、VLC |
| Mac | IINA、VLC |
| Android | MX Player |
| iOS | nPlayer |
| 命令行 | `ffplay <直播流地址>` |

---

## 🔧 API 接口

### 解析直播间

```
POST /api/parse
Content-Type: application/json

{
  "url": "https://live.douyin.com/123456789",
  "cookie": "（可选，手动传入Cookie）"
}
```

**响应示例：**

```json
{
  "success": true,
  "roomId": "123456789",
  "title": "直播间标题",
  "anchor": "主播名称",
  "cover": "https://...",
  "status": 1,
  "streams": [
    { "quality": "原画", "url": "https://.../live.flv", "type": "flv" },
    { "quality": "高清", "url": "https://.../live_HD.flv", "type": "flv" },
    { "quality": "高清(HLS)", "url": "https://.../live.m3u8", "type": "hls" }
  ]
}
```

> `status: 1` 表示正在直播，`status: 0` 表示未开播。

### 解析单个视频

```
POST /api/video/info
Content-Type: application/json

{ "url": "https://www.douyin.com/video/123456789" }
```

### 获取用户作品列表

```
POST /api/video/list
Content-Type: application/json

{ "url": "https://www.douyin.com/user/MS4wL..." }
```

### 下载视频

```
POST /api/video/download
Content-Type: application/json

{ "videoId": "123456789", "playUrl": "https://..." }
```

### 登录相关

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/login/start` | GET | 启动 Puppeteer 浏览器登录 |
| `/api/login/status` | GET | 查询当前登录状态 |
| `/api/login/save-cookies` | POST | 保存手动粘贴的 Cookie |
| `/api/login/logout` | POST | 退出登录（清除 Cookie） |

### 健康检查

```
GET /health
```

响应：`{ "status": "ok", "version": "3.0.0", "mode": "pure-api" }`

---

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Node.js + Express 5 |
| 前端 | 原生 HTML5 + CSS3 + JavaScript（无框架） |
| 自动登录 | Puppeteer（devDependency，按需安装） |
| 直播流解析 | 第三方 API + 直播页面抓取（双策略兜底） |
| 安全 | Helmet.js + CORS |
| 存储 | 无数据库，Cookie 本地 JSON 存储 |

---

## 📁 项目结构

```
douyin-live-stream-fetcher/
├── public/
│   └── index.html          # 前端页面（单页应用）
├── scripts/
│   └── get-cookies.js      # Cookie 自动获取脚本（npm run login）
├── server.js               # 后端主服务
├── cookies.json            # Cookie 存储文件（运行时生成，勿提交）
├── package.json
└── README.md
```

---

## ⚠️ 注意事项

1. **直播间状态** — 直播间必须正在直播，否则可能无法获取直播流
2. **直播流时效** — 直播流链接有时效性（通常数小时），请及时使用
3. **Cookie 安全** — `cookies.json` 包含登录凭证，请勿上传至公开代码仓库（已在 .gitignore 中忽略）
4. **Puppeteer 依赖** — 一键登录功能是 devDependency，服务器环境使用 `npm install --production` 不会安装，需手动 Cookie
5. **反爬限制** — 若频繁请求可能触发验证码，建议使用 Cookie 登录态

---

## 🔄 更新日志

### v3.0.0
- ✨ 新增视频下载功能（单视频 + 用户作品批量下载）
- ✨ 新增一键登录（Puppeteer 自动保存 Cookie）
- ✨ 新增手动 Cookie 弹窗（服务器端友好）
- ✨ 新增登录状态栏，支持退出登录
- ✨ 新增折叠式功能菜单（直播流 / 视频下载）
- ✨ 新增悬浮访客统计窗口
- 🔧 双策略解析：第三方 API + 页面抓取兜底
- 🎨 全新响应式 UI，优化移动端体验

### v1.0.0 (2026-05-08)
- 🎉 首次发布，支持直播间链接解析与多清晰度直播流获取

---

## 📝 License

MIT License — 欢迎使用和修改

---

> 💡 **提示**：工具仅用于学习和个人使用，请遵守抖音平台使用条款。
