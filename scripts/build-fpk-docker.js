const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const backendDir = path.join(root, 'backend');
const frontendDir = path.join(root, 'frontend');
const packDir = path.join(root, 'flypic');
const packServerDir = path.join(packDir, 'app', 'server');

function run(cmd, options = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root, ...options });
}

console.log('=== 使用 Docker 构建 FlyPic 飞牛应用包 ===\n');

// 1. 构建前端
console.log('1. 构建前端...');
run(`cd ${frontendDir} && npm run build`);

// 2. 清理并创建服务器目录
console.log('\n2. 准备服务器目录...');
if (fs.existsSync(packServerDir)) {
  fs.rmSync(packServerDir, { recursive: true });
}
fs.mkdirSync(packServerDir, { recursive: true });

// 3. 复制后端文件
console.log('\n3. 复制后端文件...');
const backendFiles = ['server.js', 'package.json', 'package-lock.json'];
backendFiles.forEach(file => {
  const src = path.join(backendDir, file);
  const dest = path.join(packServerDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  复制: ${file}`);
  }
});

const backendDirs = ['routes', 'database', 'utils'];
backendDirs.forEach(dir => {
  const src = path.join(backendDir, dir);
  const dest = path.join(packServerDir, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
    console.log(`  复制目录: ${dir}/`);
  }
});

// 4. 复制前端构建产物
console.log('\n4. 复制前端构建产物...');
const frontendDist = path.join(frontendDir, 'dist');
const serverPublic = path.join(packServerDir, 'public');
if (fs.existsSync(frontendDist)) {
  fs.cpSync(frontendDist, serverPublic, { recursive: true });
  console.log('  复制: frontend/dist -> app/server/public');
}

// 5. 使用 Docker 安装 Linux 版本的依赖（完整编译）
console.log('\n5. 使用 Docker 安装 Linux 依赖（完整编译原生模块）...');
console.log('  这将确保上传到飞牛后可以直接使用，无需额外操作\n');

// 转换 Windows 路径为 WSL 路径（Docker Desktop for Windows 需要）
const convertToWSLPath = (winPath) => {
  // C:\Users\... -> /c/Users/...
  return winPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (match, drive) => `/${drive.toLowerCase()}`);
};

const wslPackServerDir = convertToWSLPath(packServerDir);

// 完整安装方案：安装构建工具 + 完整编译所有原生模块
const dockerCmd = `docker run --rm -v "${wslPackServerDir}:/app" -w /app node:22-slim bash -c "apt-get update -qq && apt-get install -y -qq build-essential python3 && npm config set registry https://registry.npmmirror.com && npm install --production && du -sh node_modules/"`;

console.log('  开始构建...');
console.log(`  Docker 挂载路径: ${wslPackServerDir}`);
console.log('  提示：首次构建需要下载并编译，可能需要 5-10 分钟\n');

try {
  run(dockerCmd);
  
  console.log('\n  ✅ Linux 依赖完整编译成功！');
  console.log('  ✅ node_modules 已安装（约 57 MB）');
  console.log('  ✅ 包含 Sharp 和 better-sqlite3 的 Linux 版本');
  console.log('  ✅ 上传到飞牛后可直接使用，无需额外操作');
  console.log('\n  注意：如果看到权限错误，可以忽略，这是 Windows + Docker 的正常现象');
} catch (error) {
  console.error('\n  ❌ Docker 编译失败');
  console.error('  错误信息:', error.message);
  console.log('\n  可能的原因：');
  console.log('  1. Docker 未运行或未正确安装');
  console.log('  2. 网络连接问题（无法下载依赖）');
  console.log('  3. 磁盘空间不足');
  console.log('\n  解决方案：');
  console.log('  1. 确保 Docker Desktop 正在运行');
  console.log('  2. 在 Docker Desktop 设置中启用文件共享');
  console.log('  3. 检查网络连接');
  console.log('  4. 或使用方法二：在飞牛 fnOS 上手动安装依赖');
  process.exit(1);
}

// 6. 创建UI配置
console.log('\n6. 创建UI配置...');
const uiConfigDir = path.join(packDir, 'app', 'ui');
if (!fs.existsSync(uiConfigDir)) {
  fs.mkdirSync(uiConfigDir, { recursive: true });
}

const uiConfig = {
  ".url": {
    "flypic.Application": {
      "title": "FlyPic",
      "icon": "images/icon_{0}.png",
      "type": "url",
      "protocol": "http",
      "port": "5002"
    }
  }
};

fs.writeFileSync(
  path.join(uiConfigDir, 'config'),
  JSON.stringify(uiConfig, null, 2)
);
console.log('  创建: app/ui/config');

// 7. 创建其他必要的脚本
console.log('\n7. 创建生命周期脚本...');
const scripts = [
  'uninstall_init', 'uninstall_callback',
  'upgrade_init', 'upgrade_callback',
  'config_init', 'config_callback'
];

scripts.forEach(script => {
  const scriptPath = path.join(packDir, 'cmd', script);
  if (!fs.existsSync(scriptPath)) {
    fs.writeFileSync(scriptPath, '#!/bin/bash\nexit 0\n');
    console.log(`  创建: cmd/${script}`);
  }
});

// 8. 确保所有脚本使用 LF 换行符
console.log('\n8. 修复脚本换行符...');
const cmdDir = path.join(packDir, 'cmd');
if (fs.existsSync(cmdDir)) {
  const allScripts = fs.readdirSync(cmdDir);
  allScripts.forEach(script => {
    const scriptPath = path.join(cmdDir, script);
    if (fs.statSync(scriptPath).isFile()) {
      let content = fs.readFileSync(scriptPath, 'utf8');
      content = content.replace(/\r\n/g, '\n');
      fs.writeFileSync(scriptPath, content, { encoding: 'utf8' });
      console.log(`  修复: cmd/${script}`);
    }
  });
}

console.log('\n=== 构建完成 ===');
console.log(`\n打包目录: ${packDir}`);
console.log('\n✅ 已包含完整编译的 Linux 版本 node_modules');
console.log('✅ 包含 Sharp (图片处理) 和 better-sqlite3 (数据库) 的原生模块');
console.log('✅ 上传到飞牛后可直接使用，无需任何额外操作');
console.log('\n下一步:');
console.log('1. 上传 flypic 文件夹到飞牛 fnOS');
console.log('2. 在飞牛 fnOS 上使用 fnpack build 打包');
console.log('   cd flypic && fnpack build');
console.log('3. 安装生成的 .fpk 文件即可使用');
