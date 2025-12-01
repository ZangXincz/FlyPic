# FlyPic 官网

这是 FlyPic 的静态介绍页面，可以直接部署到宝塔面板或任何静态网站托管服务。

## 文件结构

```
website/
├── index.html      # 主页面
├── style.css       # 样式文件
├── images/         # 图片资源
│   ├── icon.png    # 网站图标 (已有)
│   ├── logo.png    # Logo (已有)
│   └── ...         # 需要添加的截图
└── README.md       # 说明文档
```

## 需要准备的图片

请将以下截图放入 `images/` 文件夹：

| 文件名 | 说明 | 建议尺寸 |
|--------|------|----------|
| `screenshot-main.png` | Hero 区域主截图 | 1200x800 |
| `screenshot-light.png` | 亮色主题截图 | 800x500 |
| `screenshot-dark.png` | 暗色主题截图 | 800x500 |
| `screenshot-mobile.png` | 移动端截图 | 400x700 |

## 部署到宝塔面板

1. 登录宝塔面板
2. 进入「网站」→「添加站点」
3. 填写域名，选择纯静态
4. 将 `website` 文件夹内的所有文件上传到网站根目录
5. 配置 SSL 证书（可选）

## 自定义修改

### 修改 GitHub 链接

在 `index.html` 中搜索 `your-repo/flypic`，替换为实际的 GitHub 仓库地址。

### 修改颜色主题

在 `style.css` 顶部的 `:root` 中修改 CSS 变量：

```css
:root {
    --primary: #3b82f6;      /* 主色调 */
    --primary-dark: #2563eb; /* 主色调深色 */
    --secondary: #8b5cf6;    /* 次要色调 */
    /* ... */
}
```

## 特性

- ✅ 响应式设计，支持桌面端和移动端
- ✅ 滚动动画效果
- ✅ 回到顶部按钮
- ✅ 平滑滚动导航
- ✅ 移动端汉堡菜单
- ✅ 现代化 UI 设计
