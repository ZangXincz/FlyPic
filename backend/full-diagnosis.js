/**
 * 完整诊断脚本 - 检查缩略图生成和显示的完整流程
 * 
 * 使用方法：
 * node backend/full-diagnosis.js "素材库路径"
 */

const path = require('path');
const fs = require('fs');
const LibraryDatabase = require('./database/db');

// 检查命令行参数
if (process.argv.length < 3) {
  console.log('❌ 请提供素材库路径');
  console.log('用法: node backend/full-diagnosis.js "D:\\你的素材库路径"');
  process.exit(1);
}

const libraryPath = process.argv[2];

if (!fs.existsSync(libraryPath)) {
  console.log(`❌ 素材库路径不存在: ${libraryPath}`);
  process.exit(1);
}

console.log('🔍 完整诊断：缩略图生成和显示流程');
console.log('=' .repeat(80));
console.log(`素材库路径: ${libraryPath}\n`);

// 1. 检查目录结构
console.log('1️⃣ 检查目录结构:');
console.log('-'.repeat(80));

const flypicDir = path.join(libraryPath, '.flypic');
const thumbDir = path.join(flypicDir, 'thumbnails');
const dbPath = path.join(flypicDir, 'metadata.db');
const thumb480Dir = path.join(thumbDir, '480');

console.log(`   .flypic 目录: ${fs.existsSync(flypicDir) ? '✅ 存在' : '❌ 不存在'}`);
console.log(`   thumbnails 目录: ${fs.existsSync(thumbDir) ? '✅ 存在' : '❌ 不存在'}`);
console.log(`   metadata.db: ${fs.existsSync(dbPath) ? '✅ 存在' : '❌ 不存在'}`);
console.log(`   480 目录: ${fs.existsSync(thumb480Dir) ? '⚠️ 存在（应该删除）' : '✅ 不存在（正确）'}`);

if (!fs.existsSync(dbPath)) {
  console.log('\n❌ 数据库不存在，请先扫描素材库');
  process.exit(1);
}

// 检查分片目录
if (fs.existsSync(thumbDir)) {
  const subdirs = fs.readdirSync(thumbDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  console.log(`   分片目录数量: ${subdirs.length}`);
  if (subdirs.length > 0) {
    console.log(`   示例分片目录: ${subdirs.slice(0, 5).join(', ')}`);
    
    // 检查第一个分片目录中的文件
    const firstShard = subdirs[0];
    const firstShardPath = path.join(thumbDir, firstShard);
    const files = fs.readdirSync(firstShardPath);
    console.log(`   ${firstShard}/ 中的文件数: ${files.length}`);
    if (files.length > 0) {
      console.log(`   示例文件: ${files.slice(0, 3).join(', ')}`);
    }
  } else {
    console.log('   ⚠️ 没有分片目录，缩略图可能未生成');
  }
}

// 2. 检查数据库
console.log('\n2️⃣ 检查数据库:');
console.log('-'.repeat(80));

const db = new LibraryDatabase(libraryPath);

// 检查表结构
const tableInfo = db.db.prepare("PRAGMA table_info(images)").all();
const fieldNames = tableInfo.map(col => col.name);

console.log('   数据库字段:');
const requiredFields = ['thumbnail_path', 'thumbnail_size', 'file_type'];
requiredFields.forEach(field => {
  const exists = fieldNames.includes(field);
  console.log(`   - ${field}: ${exists ? '✅' : '❌'}`);
});

// 统计数据
const stats = db.db.prepare(`
  SELECT 
    COUNT(*) as total,
    COUNT(thumbnail_path) as has_thumbnail_path,
    COUNT(CASE WHEN thumbnail_path IS NULL OR thumbnail_path = '' THEN 1 END) as missing_thumbnail_path
  FROM images
`).get();

console.log(`\n   总记录数: ${stats.total}`);
console.log(`   有 thumbnail_path: ${stats.has_thumbnail_path} (${(stats.has_thumbnail_path / stats.total * 100).toFixed(1)}%)`);
console.log(`   缺少 thumbnail_path: ${stats.missing_thumbnail_path} (${(stats.missing_thumbnail_path / stats.total * 100).toFixed(1)}%)`);

if (stats.missing_thumbnail_path > 0) {
  console.log(`   ⚠️ 有 ${stats.missing_thumbnail_path} 条记录缺少缩略图路径`);
}

// 3. 检查具体记录
console.log('\n3️⃣ 检查具体记录（前5条）:');
console.log('-'.repeat(80));

const samples = db.db.prepare(`
  SELECT id, filename, path, thumbnail_path, thumbnail_size, file_type
  FROM images
  LIMIT 5
`).all();

if (samples.length === 0) {
  console.log('   ❌ 数据库中没有记录');
} else {
  samples.forEach((img, index) => {
    console.log(`\n   ${index + 1}. ${img.filename}`);
    console.log(`      ID: ${img.id}`);
    console.log(`      原图路径: ${img.path}`);
    console.log(`      file_type: ${img.file_type || 'NULL'}`);
    console.log(`      thumbnail_path: ${img.thumbnail_path || 'NULL'}`);
    console.log(`      thumbnail_size: ${img.thumbnail_size || 'NULL'}`);
    
    // 检查缩略图路径格式
    if (img.thumbnail_path) {
      const parts = img.thumbnail_path.split('/');
      const isCorrectFormat = parts.length === 4 && 
                             parts[0] === '.flypic' && 
                             parts[1] === 'thumbnails' && 
                             parts[2].length === 2;
      
      console.log(`      路径格式: ${isCorrectFormat ? '✅ 正确' : '❌ 错误'} (${parts.join(' / ')})`);
      
      // 检查文件是否存在
      const thumbFullPath = path.join(libraryPath, img.thumbnail_path);
      const exists = fs.existsSync(thumbFullPath);
      console.log(`      文件存在: ${exists ? '✅' : '❌'} (${thumbFullPath})`);
      
      if (exists) {
        const fileStats = fs.statSync(thumbFullPath);
        console.log(`      文件大小: ${(fileStats.size / 1024).toFixed(2)} KB`);
      }
    } else {
      console.log(`      ❌ 缺少 thumbnail_path`);
    }
  });
}

// 4. 模拟前端请求
console.log('\n4️⃣ 模拟前端请求流程:');
console.log('-'.repeat(80));

if (samples.length > 0 && samples[0].thumbnail_path) {
  const testImage = samples[0];
  console.log(`   测试图片: ${testImage.filename}`);
  console.log(`   数据库中的 thumbnail_path: ${testImage.thumbnail_path}`);
  
  // 前端提取文件名
  const filename = testImage.thumbnail_path.replace(/\\/g, '/').split('/').pop();
  console.log(`   前端提取文件名: ${filename}`);
  
  // 前端构建URL
  const apiUrl = `/api/image/thumbnail/{libraryId}/480/${filename}`;
  console.log(`   前端构建URL: ${apiUrl}`);
  
  // 后端重建路径
  const hash = filename.replace(/\.[^/.]+$/, "");
  const shard1 = hash.slice(0, 2);
  const reconstructedPath = path.join(libraryPath, '.flypic', 'thumbnails', shard1, filename);
  console.log(`   后端提取 hash: ${hash}`);
  console.log(`   后端提取分片: ${shard1}`);
  console.log(`   后端重建路径: ${reconstructedPath}`);
  
  // 验证路径
  const originalPath = path.join(libraryPath, testImage.thumbnail_path);
  const pathsMatch = path.normalize(originalPath) === path.normalize(reconstructedPath);
  console.log(`   路径匹配: ${pathsMatch ? '✅' : '❌'}`);
  
  if (!pathsMatch) {
    console.log(`   原始路径: ${originalPath}`);
    console.log(`   重建路径: ${reconstructedPath}`);
  }
  
  // 检查文件是否存在
  const fileExists = fs.existsSync(reconstructedPath);
  console.log(`   文件存在: ${fileExists ? '✅' : '❌'}`);
} else {
  console.log('   ⚠️ 没有可用的测试数据');
}

// 5. 诊断结论
console.log('\n5️⃣ 诊断结论:');
console.log('='.repeat(80));

const issues = [];

if (!fs.existsSync(thumbDir)) {
  issues.push('❌ thumbnails 目录不存在');
}

if (fs.existsSync(thumb480Dir)) {
  issues.push('⚠️ 存在旧的 480 目录（应该删除）');
}

if (stats.missing_thumbnail_path > 0) {
  issues.push(`❌ 有 ${stats.missing_thumbnail_path} 条记录缺少 thumbnail_path`);
}

// 检查路径格式
const wrongFormatCount = db.db.prepare(`
  SELECT COUNT(*) as count
  FROM images
  WHERE thumbnail_path IS NOT NULL
    AND thumbnail_path NOT LIKE '.flypic/thumbnails/__/%'
`).get();

if (wrongFormatCount.count > 0) {
  issues.push(`❌ 有 ${wrongFormatCount.count} 条记录的路径格式不正确`);
}

// 检查文件是否存在
let missingFiles = 0;
const allImages = db.db.prepare('SELECT thumbnail_path FROM images WHERE thumbnail_path IS NOT NULL LIMIT 100').all();
for (const img of allImages) {
  const fullPath = path.join(libraryPath, img.thumbnail_path);
  if (!fs.existsSync(fullPath)) {
    missingFiles++;
  }
}

if (missingFiles > 0) {
  issues.push(`❌ 有 ${missingFiles} 个缩略图文件不存在（检查了前100条）`);
}

if (issues.length === 0) {
  console.log('✅ 所有检查通过！');
  console.log('\n如果前端仍然显示灰色背景，请检查：');
  console.log('1. 后端服务是否正常运行');
  console.log('2. 浏览器控制台是否有错误');
  console.log('3. Network 面板中缩略图请求的状态码');
} else {
  console.log('发现以下问题：');
  issues.forEach((issue, index) => {
    console.log(`${index + 1}. ${issue}`);
  });
  
  console.log('\n建议修复方案：');
  if (stats.missing_thumbnail_path > 0 || missingFiles > 0) {
    console.log('1. 重新扫描素材库以生成缺失的缩略图');
    console.log('   - 在前端点击"同步"按钮');
    console.log('   - 或者使用 API: POST /api/scan/full');
  }
  if (fs.existsSync(thumb480Dir)) {
    console.log('2. 删除旧的 480 目录（可选）');
    console.log(`   - 路径: ${thumb480Dir}`);
  }
  if (wrongFormatCount.count > 0) {
    console.log('3. 数据库中有旧格式的路径，需要重新扫描');
  }
}

db.close();
console.log('\n✅ 诊断完成');
