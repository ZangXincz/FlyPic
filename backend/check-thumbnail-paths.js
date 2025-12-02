const LibraryDatabase = require('./database/db');
const path = require('path');
const fs = require('fs');

// 从配置文件读取素材库路径
const configPath = path.join(process.env.APPDATA || process.env.HOME, '.flypic', 'config.json');
let library = null;

if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (config.libraries && config.libraries.length > 0) {
    library = config.libraries[0];
  }
}

// 如果没有配置，使用命令行参数
if (!library && process.argv[2]) {
  library = {
    name: 'Test Library',
    path: process.argv[2]
  };
}

if (!library) {
  console.log('❌ 没有找到素材库配置');
  console.log('用法: node backend/check-thumbnail-paths.js [素材库路径]');
  process.exit(1);
}

console.log(`📚 检查素材库: ${library.name} (${library.path})`);

const db = new LibraryDatabase(library.path);

// 检查数据库表结构
console.log('\n📋 检查数据库表结构:');
const tableInfo = db.db.prepare("PRAGMA table_info(images)").all();
console.log('images 表字段:');
tableInfo.forEach(col => {
  console.log(`  - ${col.name} (${col.type})`);
});

// 检查前10条记录的缩略图路径
console.log('\n🔍 检查前10条记录的缩略图路径:');
const images = db.db.prepare('SELECT id, filename, thumbnail_path, thumbnail_size, file_type FROM images LIMIT 10').all();

images.forEach((img, index) => {
  console.log(`\n${index + 1}. ${img.filename}`);
  console.log(`   file_type: ${img.file_type || 'NULL'}`);
  console.log(`   thumbnail_path: ${img.thumbnail_path || 'NULL'}`);
  console.log(`   thumbnail_size: ${img.thumbnail_size || 'NULL'}`);
  
  // 检查缩略图文件是否存在
  if (img.thumbnail_path) {
    const thumbFullPath = path.join(library.path, img.thumbnail_path);
    const exists = fs.existsSync(thumbFullPath);
    console.log(`   文件存在: ${exists ? '✅' : '❌'} (${thumbFullPath})`);
    
    // 检查路径格式
    const pathParts = img.thumbnail_path.split('/');
    console.log(`   路径格式: ${pathParts.join(' / ')}`);
    
    // 期望格式: .flypic/thumbnails/ab/hash.webp
    if (pathParts.length === 4 && pathParts[0] === '.flypic' && pathParts[1] === 'thumbnails') {
      console.log(`   格式正确: ✅`);
    } else {
      console.log(`   格式错误: ❌ (期望: .flypic/thumbnails/XX/hash.webp)`);
    }
  }
});

// 统计缩略图路径情况
console.log('\n📊 统计信息:');
const stats = db.db.prepare(`
  SELECT 
    COUNT(*) as total,
    COUNT(thumbnail_path) as has_thumbnail_path,
    COUNT(thumbnail_size) as has_thumbnail_size,
    COUNT(file_type) as has_file_type
  FROM images
`).get();

console.log(`  总记录数: ${stats.total}`);
console.log(`  有 thumbnail_path: ${stats.has_thumbnail_path} (${(stats.has_thumbnail_path / stats.total * 100).toFixed(1)}%)`);
console.log(`  有 thumbnail_size: ${stats.has_thumbnail_size} (${(stats.has_thumbnail_size / stats.total * 100).toFixed(1)}%)`);
console.log(`  有 file_type: ${stats.has_file_type} (${(stats.has_file_type / stats.total * 100).toFixed(1)}%)`);

// 检查缩略图路径格式
const pathFormats = db.db.prepare(`
  SELECT 
    thumbnail_path,
    COUNT(*) as count
  FROM images
  WHERE thumbnail_path IS NOT NULL
  GROUP BY 
    CASE 
      WHEN thumbnail_path LIKE '.flypic/thumbnails/__/%' THEN 'new_format'
      WHEN thumbnail_path LIKE '.flypic/thumbnails/%' THEN 'old_format'
      ELSE 'unknown'
    END
`).all();

console.log('\n📁 缩略图路径格式分布:');
pathFormats.forEach(format => {
  console.log(`  ${format.thumbnail_path}: ${format.count} 条`);
});

db.close();
console.log('\n✅ 检查完成');
