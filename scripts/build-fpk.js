const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const backendDir = path.join(root, 'backend');
const frontendDir = path.join(root, 'frontend');
const packDir = path.join(root, 'flypic');
const packServerDir = path.join(packDir, 'app', 'server');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root });
}

console.log('=== 构建 FlyPic 飞牛应用包 ===\n');

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

// 复制后端目录
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

// 5. 跳过依赖安装（在目标系统上安装）
console.log('\n5. 跳过依赖安装（将在飞牛 fnOS 上安装）...');

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
      "icon": "images/icon-{0}.png",
      "type": "url",
      "protocol": "http",
      "port": "15002",
      "allUsers": true,
      "control": {
        "portPerm": "editable"
      }
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
      // 将 CRLF 转换为 LF
      content = content.replace(/\r\n/g, '\n');
      fs.writeFileSync(scriptPath, content, { encoding: 'utf8' });
      console.log(`  修复: cmd/${script}`);
    }
  });
}

console.log('\n=== 构建完成 ===');
console.log(`\n打包目录: ${packDir}`);
console.log('\n下一步:');
console.log('1. 准备图标文件 (64x64 和 256x256)');
console.log('   - flypic/app/ui/images/icon_64.png');
console.log('   - flypic/app/ui/images/icon_256.png');
console.log('   - flypic/ICON.PNG (256x256)');
console.log('   - flypic/ICON_256.PNG (256x256)');
console.log('2. 添加 LICENSE 文件');
console.log('3. 在飞牛 fnOS 上使用 fnpack build 打包');
console.log('   cd flypic && fnpack build');
