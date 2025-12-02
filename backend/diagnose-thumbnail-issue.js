/**
 * 诊断缩略图数据库结构问题
 * 
 * 使用方法：
 * node backend/diagnose-thumbnail-issue.js "D:\你的素材库路径"
 */

const path = require('path');
const fs = require('fs');

// 检查命令行参数
if (process.argv.length < 3) {
  console.log('❌ 请提供素材库路径');
  console.log('用法: node backend/diagnose-thumbnail-issue.js "D:\\你的素材库路径"');
  process.exit(1);
}

const libraryPath = process.argv[2];

if (!fs.existsSync(libraryPath)) {
  console.log(`❌ 素材库路径不存在: ${libraryPath}`);
  process.exit(1);
}

console.log(`📚 检查素材库: ${libraryPath}\n`);

// 检查 .flypic 目录
const flypicDir = path.join(libraryPath, '.flypic');
if (!fs.existsSync(flypicDir)) {
  console.log('❌ .flypic 目录不存在，素材库未初始化');
  process.exit(1);
}

// 检查数据库文件
const dbPath = path.join(flypicDir, 'metadata.db');
if (!fs.existsSync(dbPath)) {
  console.log('❌ 数据库文件不存在');
  process.exit(1);
}

console.log('✅ 数据库文件存在\n');

// 加载数据库
const Database = require('better-sqlite3');
const db = new Database(dbPath);

// 1. 检查表结构
console.log('📋 1. 检查数据库表结构:');
console.log('=' .repeat(60));
const tableInfo = db.prepare("PRAGMA table_info(images)").all();
console.log('images 表字段:');
tableInfo.forEach(col => {
  const nullable = col.notnull === 0 ? 'NULL' : 'NOT NULL';
  const defaultVal = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : '';
  console.log(`  ${col.name.padEnd(20)} ${col.type.padEnd(10)} ${nullable}${defaultVal}`);
});

// 检查是否有必要的字段
const requiredFields = ['thumbnail_path', 'thumbnail_size', 'file_type'];
const existingFields = tableInfo.map(col => col.name);
const missingFields = requiredFields.filter(field => !existingFields.includes(field));

if (missingFields.length > 0) {
  console.log(`\n❌ 缺少字段: ${missingFields.join(', ')}`);
} else {
  console.log('\n✅ 所有必要字段都存在');
}

// 2. 检查数据统计
console.log('\n📊 2. 数据统计:');
console.log('=' .repeat(60));
const stats = db.prepare(`
  SELECT 
    COUNT(*) as total,
    COUNT(thumbnail_path) as has_thumbnail_path,
    COUNT(thumbnail_size) as has_thumbnail_size,
    COUNT(file_type) as has_file_type,
    COUNT(CASE WHEN thumbnail_path IS NULL THEN 1 END) as missing_thumbnail_path,
    COUNT(CASE WHEN thumbnail_size IS NULL THEN 1 END) as missing_thumbnail_size,
    COUNT(CASE WHEN file_type IS NULL THEN 1 END) as missing_file_type
  FROM images
`).get();

console.log(`总记录数:              ${stats.total}`);
console.log(`有 thumbnail_path:     ${stats.has_thumbnail_path} (${(stats.has_thumbnail_path / stats.total * 100).toFixed(1)}%)`);
console.log(`有 thumbnail_size:     ${stats.has_thumbnail_size} (${(stats.has_thumbnail_size / stats.total * 100).toFixed(1)}%)`);
console.log(`有 file_type:          ${stats.has_file_type} (${(stats.has_file_type / stats.total * 100).toFixed(1)}%)`);
console.log(`缺少 thumbnail_path:   ${stats.missing_thumbnail_path} (${(stats.missing_thumbnail_path / stats.total * 100).toFixed(1)}%)`);
console.log(`缺少 thumbnail_size:   ${stats.missing_thumbnail_size} (${(stats.missing_thumbnail_size / stats.total * 100).toFixed(1)}%)`);
console.log(`缺少 file_type:        ${stats.missing_file_type} (${(stats.missing_file_type / stats.total * 100).toFixed(1)}%)`);

// 3. 检查缩略图路径格式
console.log('\n📁 3. 缩略图路径格式分析:');
console.log('=' .repeat(60));

// 分析路径格式
const pathAnalysis = db.prepare(`
  SELECT 
    thumbnail_path,
    COUNT(*) as count
  FROM images
  WHERE thumbnail_path IS NOT NULL
  GROUP BY thumbnail_path
  LIMIT 10
`).all();

if (pathAnalysis.length > 0) {
  console.log('前10个不同的缩略图路径:');
  pathAnalysis.forEach((row, index) => {
    console.log(`  ${index + 1}. ${row.thumbnail_path} (${row.count} 条记录)`);
    
    // 分析路径格式
    const parts = row.thumbnail_path.split('/');
    if (parts.length === 4 && parts[0] === '.flypic' && parts[1] === 'thumbnails' && parts[2].length === 2) {
      console.log(`     ✅ 格式正确: .flypic/thumbnails/${parts[2]}/${parts[3]}`);
    } else {
      console.log(`     ❌ 格式错误: 期望 .flypic/thumbnails/XX/hash.webp`);
    }
  });
} else {
  console.log('❌ 没有找到任何缩略图路径');
}

// 4. 检查实际文件
console.log('\n📂 4. 检查缩略图文件是否存在:');
console.log('=' .repeat(60));

const sampleImages = db.prepare(`
  SELECT id, filename, thumbnail_path, file_type
  FROM images
  WHERE thumbnail_path IS NOT NULL
  LIMIT 5
`).all();

if (sampleImages.length > 0) {
  console.log('检查前5个记录的缩略图文件:');
  sampleImages.forEach((img, index) => {
    console.log(`\n  ${index + 1}. ${img.filename}`);
    console.log(`     file_type: ${img.file_type || 'NULL'}`);
    console.log(`     thumbnail_path: ${img.thumbnail_path}`);
    
    if (img.thumbnail_path) {
      const thumbFullPath = path.join(libraryPath, img.thumbnail_path);
      const exists = fs.existsSync(thumbFullPath);
      console.log(`     文件存在: ${exists ? '✅' : '❌'}`);
      console.log(`     完整路径: ${thumbFullPath}`);
      
      if (!exists) {
        // 检查是否是路径分隔符问题
        const thumbFullPathWin = path.join(libraryPath, img.thumbnail_path.replace(/\//g, '\\'));
        const existsWin = fs.existsSync(thumbFullPathWin);
        if (existsWin) {
          console.log(`     ⚠️ 使用反斜杠路径存在: ${thumbFullPathWin}`);
        }
      }
    }
  });
} else {
  console.log('❌ 没有找到任何有缩略图路径的记录');
}

// 5. 检查缩略图目录结构
console.log('\n📁 5. 检查缩略图目录结构:');
console.log('=' .repeat(60));

const thumbnailsDir = path.join(flypicDir, 'thumbnails');
if (fs.existsSync(thumbnailsDir)) {
  console.log(`✅ thumbnails 目录存在: ${thumbnailsDir}`);
  
  // 列出子目录
  const subdirs = fs.readdirSync(thumbnailsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  console.log(`   子目录数量: ${subdirs.length}`);
  if (subdirs.length > 0) {
    console.log(`   前10个子目录: ${subdirs.slice(0, 10).join(', ')}`);
    
    // 检查第一个子目录中的文件
    const firstSubdir = subdirs[0];
    const firstSubdirPath = path.join(thumbnailsDir, firstSubdir);
    const files = fs.readdirSync(firstSubdirPath);
    console.log(`   ${firstSubdir}/ 目录中的文件数: ${files.length}`);
    if (files.length > 0) {
      console.log(`   示例文件: ${files.slice(0, 3).join(', ')}`);
    }
  }
} else {
  console.log(`❌ thumbnails 目录不存在: ${thumbnailsDir}`);
}

// 6. 诊断结论
console.log('\n🔍 6. 诊断结论:');
console.log('=' .repeat(60));

const issues = [];

if (missingFields.length > 0) {
  issues.push(`❌ 数据库缺少字段: ${missingFields.join(', ')}`);
}

if (stats.missing_thumbnail_path > 0) {
  issues.push(`⚠️ 有 ${stats.missing_thumbnail_path} 条记录缺少 thumbnail_path`);
}

if (stats.missing_file_type > 0) {
  issues.push(`⚠️ 有 ${stats.missing_file_type} 条记录缺少 file_type`);
}

if (!fs.existsSync(thumbnailsDir)) {
  issues.push(`❌ 缩略图目录不存在`);
}

if (issues.length === 0) {
  console.log('✅ 未发现明显问题');
  console.log('\n建议：');
  console.log('1. 检查前端代码中如何使用 thumbnail_path');
  console.log('2. 检查后端 API 返回的数据格式');
  console.log('3. 查看浏览器控制台的网络请求');
} else {
  console.log('发现以下问题:');
  issues.forEach((issue, index) => {
    console.log(`${index + 1}. ${issue}`);
  });
  
  console.log('\n建议修复方案:');
  if (missingFields.length > 0) {
    console.log('1. 运行数据库迁移脚本添加缺失字段');
  }
  if (stats.missing_thumbnail_path > 0 || stats.missing_file_type > 0) {
    console.log('2. 重新扫描素材库以生成缺失的缩略图和元数据');
  }
  if (!fs.existsSync(thumbnailsDir)) {
    console.log('3. 创建缩略图目录并重新生成缩略图');
  }
}

db.close();
console.log('\n✅ 诊断完成');
