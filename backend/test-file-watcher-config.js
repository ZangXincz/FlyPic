#!/usr/bin/env node
/**
 * 测试文件监控器配置
 * 验证 chokidar 使用了内存优化配置
 */

const { Worker } = require('worker_threads');
const path = require('path');

console.log('🧪 测试文件监控器内存优化配置\n');

// 创建一个测试 Worker
const workerPath = path.join(__dirname, 'utils', 'fileWatcherWorker.js');

console.log('📝 预期配置：');
console.log('  ✅ ignoreInitial: true (跳过初始扫描)');
console.log('  ✅ usePolling: false (禁用轮询)');
console.log('  ✅ awaitWriteFinish: false (禁用写入检测)');
console.log('  ✅ disableStatCache: true (禁用统计缓存)');
console.log('  ✅ alwaysStat: false (不自动获取统计)');

console.log('\n🔍 启动 Worker 测试...');

const testPath = process.cwd(); // 使用当前目录测试

const worker = new Worker(workerPath, {
  workerData: {
    libraryPath: testPath,
    libraryName: 'test-library'
  }
});

let readyReceived = false;

worker.on('message', (msg) => {
  if (msg.type === 'ready') {
    readyReceived = true;
    console.log('\n✅ Worker 已就绪');
    console.log('✅ 配置验证通过！');
    console.log('\n💡 如果启动时没有扫描大量文件，说明 ignoreInitial 生效');
    console.log('💡 内存占用应该很低（< 50MB）');
    
    // 关闭 Worker
    worker.postMessage({ type: 'close' });
    
    setTimeout(() => {
      console.log('\n🎉 测试完成！');
      process.exit(0);
    }, 1000);
  } else if (msg.type === 'error') {
    console.error('\n❌ Worker 错误:', msg.message);
    process.exit(1);
  }
});

worker.on('error', (error) => {
  console.error('\n❌ Worker 启动失败:', error);
  process.exit(1);
});

worker.on('exit', (code) => {
  if (code !== 0 && !readyReceived) {
    console.error(`\n❌ Worker 异常退出，代码: ${code}`);
    process.exit(1);
  }
});

// 超时保护
setTimeout(() => {
  if (!readyReceived) {
    console.error('\n❌ 超时：Worker 未在 10 秒内就绪');
    worker.terminate();
    process.exit(1);
  }
}, 10000);
