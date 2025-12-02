#!/usr/bin/env node
/**
 * Memory Diagnostics CLI
 * 快速诊断内存问题
 * 
 * 使用方法：
 * node --expose-gc diagnose-memory.js
 */

const memoryDiagnostics = require('./utils/memoryDiagnostics');

console.log('🔍 FlyPic Memory Diagnostics\n');
console.log('='.repeat(50));

// 1. 当前内存使用
const usage = process.memoryUsage();
console.log('\n📊 Current Memory Usage:');
console.log(`  RSS:           ${(usage.rss / 1024 / 1024).toFixed(0)} MB`);
console.log(`  Heap Used:     ${(usage.heapUsed / 1024 / 1024).toFixed(0)} MB`);
console.log(`  Heap Total:    ${(usage.heapTotal / 1024 / 1024).toFixed(0)} MB`);
console.log(`  External:      ${(usage.external / 1024 / 1024).toFixed(0)} MB`);
console.log(`  Array Buffers: ${(usage.arrayBuffers / 1024 / 1024).toFixed(0)} MB`);

// 2. 堆统计
memoryDiagnostics.logHeapStatistics();

// 3. 检测内存泄漏
memoryDiagnostics.diagnoseMemoryLeak();

// 4. 强制 GC 并报告
console.log('\n🧹 Testing Garbage Collection...');
const gcResult = memoryDiagnostics.forceGCAndReport();

if (gcResult) {
  const rssReduction = (gcResult.reclaimed.rss / gcResult.before.rss * 100).toFixed(1);
  const heapReduction = (gcResult.reclaimed.heap / gcResult.before.heap * 100).toFixed(1);
  
  console.log(`\n📉 GC Effectiveness:`);
  console.log(`  RSS reduced by:  ${rssReduction}%`);
  console.log(`  Heap reduced by: ${heapReduction}%`);
  
  if (parseFloat(rssReduction) < 5) {
    console.log('\n⚠️  Warning: GC reclaimed very little RSS memory');
    console.log('   This suggests native memory leak (SQLite, Sharp, etc.)');
  }
}

console.log('\n' + '='.repeat(50));
console.log('\n💡 Recommendations:');
console.log('  1. If RSS > 500MB: Check SQLite connections and Sharp image processing');
console.log('  2. If Heap > 200MB: Check for object retention and large arrays');
console.log('  3. If GC reclaims < 5%: Likely native memory leak');
console.log('  4. Monitor with: node --expose-gc --trace-gc server.js');
console.log('\n');
