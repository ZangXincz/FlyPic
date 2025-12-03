# FlyPic 飞图

主要飞牛 fnOS 设计的轻量、快速、稳定的图像素材检索浏览应用。

## ✨ 核心特性

- 🚀 **轻量快速** - 支持数十万级别图片流畅浏览，基于 SQLite 本地数据库，毫秒级响应
- 🛡️ **非侵入式** - 只在素材库目录创建 .flypic 文件夹存储索引和缩略图，不修改任何原始文件
- 🔄 **实时同步** - 基于 Worker Thread 的文件监控，自动检测新增、删除、修改
- 🌐 **远程访问** - 支持 FN Connect 远程访问，随时随地浏览管理图片素材库
- 🎨 **现代界面** - 固定行高瀑布流布局，支持亮色/暗色主题，响应式设计
- 🔍 **智能搜索** - 多关键词组合搜索，高级筛选（格式/大小/方向）
- 📱 **移动适配** - 响应式设计，手机上也能流畅使用
- 🆓 **开源免费** - 100% 开源，MIT 协议
- 其他平台

## 🛠️ 技术栈

**前端**：React 18 + Vite 5 + TailwindCSS + Zustand + react-window + react-photo-view

**后端**：Node.js + Express + Sharp + better-sqlite3 + Socket.IO

**架构**：三层架构（Config → Model → Service → Route）+ 模块化前端（Store → Hooks → API）

## 🚀 快速开始

### 开发环境

```bash
# 安装依赖
npm install

# 启动前端开发服务器
npm run dev:frontend
# 访问 http://localhost:5173

# 启动后端开发服务器
npm run dev:backend
# API 运行在 http://localhost:15002
```

### 构建部署

```bash
# 使用 Docker 构建（推荐）
# 包含 Linux 版本的依赖，上传后直接可用
npm run build:fpk:docker
```

## 📦 部署到飞牛 fnOS

详细步骤请查看：**[飞牛打包部署指南](./飞牛打包部署指南.md)**

### 快速部署

1. **构建**：`npm run build:fpk:docker`
2. **上传**：将 `flypic/` 目录上传到飞牛
3. **打包**：`fnpack build`
4. **安装**：`appcenter-cli install-fpk flypic.fpk`
5. **访问**：`http://你的飞牛IP:15002`（端口可在安装时自定义）

### 安装提示

- **自定义端口**：安装时可自定义应用端口（默认 15002），避免与其他应用冲突
- **素材库路径**：添加素材库时需输入飞牛文件系统的完整路径，如 `/vol1/1000/图片库`
- **文件夹权限**：请确保应用对素材库文件夹有读取权限，可在飞牛应用设置中配置授权目录

## 📁 项目结构

```
FlyPic/
├── frontend/              # React 前端
│   └── src/
│       ├── stores/        # 状态管理（Zustand）
│       ├── api/           # HTTP 客户端
│       ├── hooks/         # 自定义 Hooks
│       └── components/    # UI 组件
│
├── backend/               # Node.js 后端
│   ├── src/               # 新架构代码
│   │   ├── config/        # 配置管理
│   │   ├── models/        # 数据访问层
│   │   ├── services/      # 业务逻辑层
│   │   ├── routes/        # HTTP 接口层
│   │   ├── middleware/    # 中间件
│   │   └── utils/         # 工具函数
│   ├── database/          # 数据库管理
│   ├── utils/             # 扫描、缩略图等工具
│   └── server.js          # 服务器入口
│
├── flypic/                # 飞牛打包目录（构建生成）
├── scripts/               # 构建脚本
└── 飞牛打包部署指南.md    # 完整部署文档
```

## 🎯 支持的文件格式

**完整支持**：JPG、PNG、WebP、GIF、BMP、TIFF、SVG

**可识别**：视频（MP4/MOV/AVI...）、音频（MP3/WAV...）、文档（PDF/TXT...）、设计文件（PSD/AI...）

## 📝 数据存储

```
素材库目录/
├── 用户图片文件...
└── .flypic/           # FlyPic 数据目录（隐藏）
    ├── thumbnails/    # WebP 缩略图
    └── metadata.db    # SQLite 数据库
```

删除 `.flypic` 文件夹即可完全清除索引数据，不留任何痕迹。

## 🐛 故障排查

常见问题请查看 [飞牛打包部署指南 - 故障排查](./飞牛打包部署指南.md#故障排查)

## 📄 License

MIT License - 详见 [LICENSE](./LICENSE) 文件

## 📚 更多文档

- [重构完成报告](./重构完成报告.md) - 代码架构说明
- [更新日志](./CHANGELOG.md) - 版本更新记录
- [飞牛打包部署指南](./飞牛打包部署指南.md) - 部署文档

---

**官网**：[FlyPic 介绍页](https://flypic.shikejk.com/) | **最后更新**：2024-12-03
