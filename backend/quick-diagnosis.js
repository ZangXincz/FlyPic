/**
 * 快速诊断 - 检查为什么前端显示灰色背景
 * 
 * 使用方法：
 * node backend/quick-diagnosis.js "素材库路径"
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

if (process.argv.length < 3) {
  console.log('用法: node backend/quick-diagnosis.js "素材库路径"');
  process.exit(1);
}

const libraryPath = process.argv[2];
const dbPath = path.join(libraryPath, '.flypic', 'metadata.db');

if (!fs.existsSync(dbPath)) {
  console.log('❌ 数据库不存在，请先扫描素材库');
  process.exit(1);
}

console.log('🔍 快速诊断：为什么显示灰色背景\n');

const db = new Database(dbPath);

// 1. 检查总数
const total = db.prepare('SELECT COUNT(*) as count FROM images').get();
console.log(`1️⃣ 数据库中的图片总数: ${total.count}`);

if (total.count === 0) {
  console.log('   ❌ 数据库是空的，请扫描素材库');
  db.close();
  process.exit(1);
}

// 2. 检查 thumbnail_path
const withPath = db.prepare(`
  SELECT COUNT(*) as count 
  FROM images 
  WHERE thumbnail_path IS NOT NULL AND thumbnail_path != ''
`).get();

console.log(`\n2️⃣ 有 thumbnail_path 的记录: ${withPath.count} / ${total.count}`);

if (withPath.count === 0) {
  console.log('   ❌ 所有记录都缺少 thumbnail_path');
  console.log('   原因：扫描时没有生成缩略图');
  console.log('   解决：重新扫描素材库');
  db.close();
  process.exit(1);
}

if (withPath.count < total.count) {
  console.log(`   ⚠️ 有 ${total.count - withPath.count} 条记录缺少 thumbnail_path`);
}

// 3. 检查路径格式
const correctFormat = db.prepare(`
  SELECT COUNT(*) as count 
  FROM images 
  WHERE thumbnail_path LIKE '.flypic/thumbnails/__/%'
`).get();

console.log(`\n3️⃣ 路径格式正确的记录: ${correctFormat.count} / ${withPath.count}`);

if (correctFormat.count === 0) {
  console.log('   ❌ 所有路径格式都不正确');
  console.log('   原因：使用了旧的路径格式');
  console.log('   解决：重新扫描素材库');
  db.close();
  process.exit(1);
}

// 4. 检查文件是否存在
console.log(`\n4️⃣ 检查缩略图文件是否存在（检查前10个）:`);

const samples = db.prepare(`
  SELECT thumbnail_path, filename
  FROM images
  WHERE thumbnail_path IS NOT NULL
  LIMIT 10
`).all();

let existCount = 0;
let missingCount = 0;

samples.forEach((img, index) => {
  const fullPath = path.join(libraryPath, img.thumbnail_path);
  const exists = fs.existsSync(fullPath);
  
  if (exists) {
    existCount++;
  } else {
    missingCount++;
    if (missingCount <= 3) {
      console.log(`   ❌ ${img.filename}`);
      console.log(`      路径: ${img.thumbnail_path}`);
      console.log(`      完整路径: ${fullPath}`);
    }
  }
});

console.log(`   存在: ${existCount}, 缺失: ${missingCount}`);

if (missingCount === samples.length) {
  console.log('\n   ❌ 所有缩略图文件都不存在');
  console.log('   原因：缩略图文件被删除或路径不对');
  console.log('   解决：重新扫描素材库');
  db.close();
  process.exit(1);
}

// 5. 模拟前端请求
console.log(`\n5️⃣ 模拟前端请求:`);

if (samples.length > 0) {
  const testImg = samples[0];
  console.log(`   测试图片: ${testImg.filename}`);
  console.log(`   thumbnail_path: ${testImg.thumbnail_path}`);
  
  // 前端提取文件名
  const filename = testImg.thumbnail_path.replace(/\\/g, '/').split('/').pop();
  console.log(`   提取文件名: ${filename}`);
  
  // 后端重建路径
  const hash = filename.replace(/\.[^/.]+$/, "");
  const shard1 = hash.slice(0, 2);
  const targetPath = path.join(libraryPath, '.flypic', 'thumbnails', shard1, filename);
  
  console.log(`   后端重建路径: ${targetPath}`);
  console.log(`   文件存在: ${fs.existsSync(targetPath) ? '✅' : '❌'}`);
}

// 6. 总结
console.log(`\n6️⃣ 诊断结果:`);
console.log('='.repeat(60));

if (withPath.count === total.count && correctFormat.count === withPath.count && missingCount === 0) {
  console.log('✅ 数据库和文件都正常');
  console.log('\n如果前端仍显示灰色背景，请检查：');
  console.log('1. 后端服务是否运行在正确的端口');
  console.log('2. 浏览器控制台 Network 面板中的缩略图请求');
  console.log('3. 缩略图请求的响应状态码（应该是 200）');
  console.log('4. 前端的 currentLibraryId 是否正确');
} else {
  console.log('❌ 发现问题，需要重新扫描素材库');
  console.log('\n解决方法：');
  console.log('1. 在前端点击"同步"或"扫描"按钮');
  console.log('2. 等待扫描完成');
  console.log('3. 刷新页面');
}

db.close();
