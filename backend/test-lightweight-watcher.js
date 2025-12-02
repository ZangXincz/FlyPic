#!/usr/bin/env node
/**
 * 测试轻量级文件监控器
 * 验证内存占用和性能
 */

const lightweightWatcher = require('./utils/lightweightWatcher');

function formatMemory(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed
  };
}

console.log('🧪 轻量级文件监控器测试\n');

// 1. 基准内存
const baselineMemory = getMemoryUsage();
console.log('📊 基准内存:');
console.log(`  RSS: ${formatMemory(baselineMemory.rss)}`);
console.log(`  Heap: ${formatMemory(baselineMemory.heapUsed)}`);

// 2. 启动监控
console.log('\n🚀 启动轻量级监控...');

const testPath = 'C:\\Users\\qingy\\Pictures\\商品图片包';
const startTime = Date.now();

// 模拟 Socket.IO
const mockIo = {
  emit: (event, data) => {
    console.log(`  [Socket] ${event}:`, data);
  }
};

lightweightWatcher.watch('test-lib', testPath, '大批量测试', mockIo)
  .then(() => {
    const readyTime = Date.now() - startTime;
    const afterMemory = getMemoryUsage();
    
    console.log(`\n✅ 监控已启动（耗时 ${readyTime}ms）`);
    console.log('\n📊 启动后内存:');
    console.log(`  RSS: ${formatMemory(afterMemory.rss)}`);
    console.log(`  Heap: ${formatMemory(afterMemory.heapUsed)}`);
    
    console.log('\n📈 内存增长:');
    const rssDiff = afterMemory.rss - baselineMemory.rss;
    const heapDiff = afterMemory.heapUsed - baselineMemory.heapUsed;
    console.log(`  RSS: +${formatMemory(rssDiff)}`);
    console.log(`  Heap: +${formatMemory(heapDiff)}`);
    
    console.log('\n💡 分析:');
    if (rssDiff < 50 * 1024 * 1024) {
      console.log('  ✅ 内存增长 < 50MB - 优化成功！');
    } else if (rssDiff < 100 * 1024 * 1024) {
      console.log('  ⚠️  内存增长 50-100MB - 可接受');
    } else {
      console.log('  ❌ 内存增长 > 100MB - 需要进一步优化');
    }
    
    // 等待 30 秒，观察轮询过程
    console.log('\n⏳ 等待 30 秒，观察轮询过程...');
    console.log('💡 提示：可以在测试期间添加/删除文件来测试检测功能');
    
    let checkCount = 0;
    const checkInterval = setInterval(() => {
      checkCount++;
      const currentMemory = getMemoryUsage();
      console.log(`  [${checkCount * 5}s] RSS: ${formatMemory(currentMemory.rss)}, Heap: ${formatMemory(currentMemory.heapUsed)}`);
      
      if (checkCount >= 6) {
        clearInterval(checkInterval);
        
        const finalMemory = getMemoryUsage();
        console.log('\n📊 最终内存:');
        console.log(`  RSS: ${formatMemory(finalMemory.rss)}`);
        console.log(`  Heap: ${formatMemory(finalMemory.heapUsed)}`);
        
        const stabilityDiff = finalMemory.rss - afterMemory.rss;
        console.log(`\n📈 稳定性: ${stabilityDiff > 0 ? '+' : ''}${formatMemory(stabilityDiff)}`);
        
        if (Math.abs(stabilityDiff) < 20 * 1024 * 1024) {
          console.log('  ✅ 内存稳定（变化 < 20MB）');
        } else {
          console.log('  ⚠️  内存不稳定（变化 > 20MB）');
        }
        
        // 停止监控
        lightweightWatcher.unwatch('test-lib');
        
        console.log('\n🎉 测试完成！');
        console.log('\n📊 对比 chokidar:');
        console.log('  chokidar: ~800MB, 24秒启动');
        console.log(`  轻量级: ~${formatMemory(rssDiff)}, ${readyTime}ms启动`);
        console.log(`  节省: ~${formatMemory(800 * 1024 * 1024 - rssDiff)}`);
        
        process.exit(0);
      }
    }, 5000);
  })
  .catch(error => {
    console.error('\n❌ 启动失败:', error);
    process.exit(1);
  });

// 超时保护
setTimeout(() => {
  console.error('\n❌ 超时：测试未在 60 秒内完成');
  lightweightWatcher.unwatch('test-lib');
  process.exit(1);
}, 60000);
