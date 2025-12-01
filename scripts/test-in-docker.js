const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const packServerDir = path.resolve(__dirname, '../flypic/app/server');

console.log('=== 在 Docker 中测试 FlyPic ===\n');

// 创建临时启动脚本
const startScript = `#!/bin/bash
set -e
export PORT=5002
export FRONTEND_DIST=/app/public
mkdir -p /tmp/flypic_data
echo "Environment variables set"
echo "PORT=$PORT"
echo "FRONTEND_DIST=$FRONTEND_DIST"
echo "Current directory: $(pwd)"
echo "Files in /app:"
ls -la /app
echo ""
echo "Files in /app/public:"
ls -la /app/public || echo "public directory not found"
echo ""
echo "Starting server..."
node server.js
`;

// 写入临时脚本文件
const tmpScript = path.join(os.tmpdir(), 'flypic-start.sh');
fs.writeFileSync(tmpScript, startScript);

const dockerCmd = `docker run --rm -it -v "${packServerDir}:/app" -v "${tmpScript}:/start.sh" -w /app -p 5002:5002 node:22-slim bash /start.sh`;

console.log('提示:');
console.log('- 服务将在 http://localhost:5002 运行');
console.log('- 按 Ctrl+C 停止服务');
console.log('- 这是测试 Linux 版本依赖是否正常');
console.log('\n正在启动...\n');

try {
  execSync(dockerCmd, { stdio: 'inherit' });
} catch (error) {
  if (error.signal === 'SIGINT') {
    console.log('\n服务已停止');
  } else {
    console.log('\n启动失败，错误信息见上方');
  }
} finally {
  // 清理临时文件
  if (fs.existsSync(tmpScript)) {
    fs.unlinkSync(tmpScript);
  }
}
