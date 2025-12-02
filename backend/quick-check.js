#!/usr/bin/env node
/**
 * 快速检查数据库和缩略图状态
 */

const dbPool = require('./database/dbPool');
const fs = require('fs');
const path = require('path');

const libraryPath = 'C:\\Users\\qingy\\Pictures\\商品图片包';

console.log('🔍 检查数据库和缩略图状态\n');

// 1. 检查数据库
console.log('1️⃣ 检查数据库...');
const db = dbPool.acquire(libraryPath);

const total = db.db.prepare('SELECT COUNT(*) as count FROM images').get();
console.log(`   总图片数: ${total.count}`);

const withThumb = db.db.prepare('SELECT COUNT(*) as count FROM images WHERE thumbnail_path IS NOT NULL AND thumbnail_path != ""').get();
console.log(`   有缩略图路径: ${withThumb.count}`);

const withoutThumb = total.count - withThumb.count;
console.log(`   缺少缩略图路径: ${withoutThumb}`);

if (withoutThumb > 0) {
  console.log('\n   ❌ 问题：有图片缺少 thumbnail_path');
  console.log('   解决方案：重新运行扫描');
} else {
  console.log('\n   ✅ 所有图片都有 thumbnail_path');
}

// 2. 检查示例数据
console.log('\n2️⃣ 示例数据（前3条）:');
const samples = db.db.prepare('SELECT id, filename, thumbnail_path FROM images LIMIT 3').all();
samples.forEach((row, i) => {
  console.log(`   ${i + 1}. ${row.filename}`);
  console.log(`      thumbnail_path: ${row.thumbnail_path || '(空)'}`);
});

// 3. 检查缩略图文件
console.log('\n3️⃣ 检查缩略图文件...');
const thumbDir = path.join(libraryPath, '.flypic', 'thumbnails');
if (fs.existsSync(thumbDir)) {
  const files = fs.readdirSync(thumbDir, { recursive: true }).filter(f => f.endsWith('.webp'));
  console.log(`   缩略图文件数: ${files.length}`);
  
  if (files.length === 0) {
    console.log('   ❌ 问题：缩略图目录为空');
    console.log('   解决方案：重新运行扫描');
  } else if (files.length < withThumb.count) {
    console.log(`   ⚠️  警告：缩略图文件数 (${files.length}) < 数据库记录 (${withThumb.count})`);
  } else {
    console.log('   ✅ 缩略图文件存在');
  }
} else {
  console.log('   ❌ 问题：缩略图目录不存在');
  console.log('   解决方案：重新运行扫描');
}

// 4. 检查一个具体的缩略图
if (samples.length > 0 && samples[0].thumbnail_path) {
  console.log('\n4️⃣ 检查第一个缩略图文件...');
  const thumbPath = path.join(libraryPath, samples[0].thumbnail_path);
  if (fs.existsSync(thumbPath)) {
    const stats = fs.statSync(thumbPath);
    console.log(`   ✅ 文件存在: ${samples[0].thumbnail_path}`);
    console.log(`   文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
  } else {
    console.log(`   ❌ 文件不存在: ${samples[0].thumbnail_path}`);
  }
}

dbPool.release(libraryPath);

console.log('\n✅ 检查完成！');
