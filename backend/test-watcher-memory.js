#!/usr/bin/env node
/**
 * 测试文件监控器内存占用
 * 对比优化前后的内存使用
 */

const { Worker } = require('worker_threads');
const path = require('path');

function formatMemory(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external
  };
}

console.log('🧪 文件监控器内存测试\n');

// 1. 基准内存
const baselineMemory = getMemoryUsage();
console.log('📊 基准内存（启动前）:');
console.log(`  RSS: ${formatMemory(baselineMemory.rss)}`);
console.log(`  Heap Used: ${formatMemory(baselineMemory.heapUsed)}`);

// 2. 启动 Worker
console.log('\n🚀 启动文件监控器...');

const workerPath = path.join(__dirname, 'utils', 'fileWatcherWorker.js');
const testPath = 'C:\\Users\\qingy\\Pictures\\商品图片包'; // 使用你的大批量文件夹

const startTime = Date.now();

const worker = new Worker(workerPath, {
  workerData: {
    libraryPath: testPath,
    libraryName: '大批量测试'
  }
});

worker.on('message', (msg) => {
  if (msg.type === 'ready') {
    const readyTime = Date.now() - startTime;
    const afterMemory = getMemoryUsage();
    
    console.log(`\n✅ Worker 就绪（耗时 ${readyTime}ms）`);
    console.log('\n📊 启动后内存:');
    console.log(`  RSS: ${formatMemory(afterMemory.rss)}`);
    console.log(`  Heap Used: ${formatMemory(afterMemory.heapUsed)}`);
    
    console.log('\n📈 内存增长:');
    const rssDiff = afterMemory.rss - baselineMemory.rss;
    const heapDiff = afterMemory.heapUsed - baselineMemory.heapUsed;
    console.log(`  RSS: +${formatMemory(rssDiff)}`);
    console.log(`  Heap Used: +${formatMemory(heapDiff)}`);
    
    console.log('\n💡 分析:');
    if (rssDiff < 50 * 1024 * 1024) {
      console.log('  ✅ 内存增长 < 50MB - 优化成功！');
    } else if (rssDiff < 100 * 1024 * 1024) {
      console.log('  ⚠️  内存增长 50-100MB - 可接受');
    } else {
      console.log('  ❌ 内存增长 > 100MB - 需要进一步优化');
    }
    
    // 等待 5 秒，观察内存是否继续增长
    console.log('\n⏳ 等待 5 秒，观察内存稳定性...');
    setTimeout(() => {
      const finalMemory = getMemoryUsage();
      console.log('\n📊 5秒后内存:');
      console.log(`  RSS: ${formatMemory(finalMemory.rss)}`);
      console.log(`  Heap Used: ${formatMemory(finalMemory.heapUsed)}`);
      
      const stabilityDiff = finalMemory.rss - afterMemory.rss;
      console.log(`\n📈 稳定性检查: ${stabilityDiff > 0 ? '+' : ''}${formatMemory(stabilityDiff)}`);
      
      if (Math.abs(stabilityDiff) < 10 * 1024 * 1024) {
        console.log('  ✅ 内存稳定（变化 < 10MB）');
      } else {
        console.log('  ⚠️  内存不稳定（变化 > 10MB）');
      }
      
      // 关闭
      worker.postMessage({ type: 'close' });
      setTimeout(() => {
        console.log('\n🎉 测试完成！');
        process.exit(0);
      }, 1000);
    }, 5000);
  }
});

worker.on('error', (error) => {
  console.error('\n❌ Worker 错误:', error);
  process.exit(1);
});

// 超时保护
setTimeout(() => {
  console.error('\n❌ 超时：测试未在 30 秒内完成');
  worker.terminate();
  process.exit(1);
}, 30000);
