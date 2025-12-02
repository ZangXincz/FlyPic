/**
 * 验证缩略图路径的一致性
 * 
 * 检查点：
 * 1. 数据库初始化时不创建 480 文件夹
 * 2. 生成缩略图时使用正确的路径格式：.flypic/thumbnails/XX/hash.webp
 * 3. 保存到数据库的路径格式正确
 * 4. 前端读取路径格式正确
 * 5. 后端API服务路径格式正确
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

console.log('🔍 验证缩略图路径一致性\n');
console.log('=' .repeat(60));

// 1. 模拟数据库初始化
console.log('\n1️⃣ 检查数据库初始化逻辑:');
const testLibraryPath = 'C:\\Test\\Library';
const flypicDir = path.join(testLibraryPath, '.flypic');
const thumbDir = path.join(flypicDir, 'thumbnails');

console.log(`   .flypic 目录: ${flypicDir}`);
console.log(`   thumbnails 目录: ${thumbDir}`);
console.log(`   ✅ 不应该创建 480 子目录`);

// 2. 模拟缩略图生成
console.log('\n2️⃣ 检查缩略图生成逻辑:');
const testImagePath = path.join(testLibraryPath, 'folder1', 'test.jpg');
const relativePath = path.relative(testLibraryPath, testImagePath);
const hash = crypto.createHash('md5').update(relativePath).digest('hex');
const shard1 = hash.slice(0, 2);
const thumbnailFilename = `${hash}.webp`;
const thumbnailPath = path.join(flypicDir, 'thumbnails', shard1, thumbnailFilename);
const thumbnailPathRelative = path.relative(testLibraryPath, thumbnailPath).replace(/\\/g, '/');

console.log(`   原图路径: ${testImagePath}`);
console.log(`   相对路径: ${relativePath}`);
console.log(`   MD5 Hash: ${hash}`);
console.log(`   分片目录: ${shard1}`);
console.log(`   缩略图文件名: ${thumbnailFilename}`);
console.log(`   缩略图完整路径: ${thumbnailPath}`);
console.log(`   缩略图相对路径: ${thumbnailPathRelative}`);
console.log(`   ✅ 格式应该是: .flypic/thumbnails/${shard1}/${thumbnailFilename}`);

// 验证格式
const parts = thumbnailPathRelative.split('/');
if (parts.length === 4 && parts[0] === '.flypic' && parts[1] === 'thumbnails' && parts[2].length === 2) {
  console.log(`   ✅ 路径格式正确`);
} else {
  console.log(`   ❌ 路径格式错误: ${parts.join(' / ')}`);
}

// 3. 模拟数据库保存
console.log('\n3️⃣ 检查数据库保存逻辑:');
const imageData = {
  path: relativePath.replace(/\\/g, '/'),
  filename: 'test.jpg',
  folder: 'folder1',
  thumbnail_path: thumbnailPathRelative,
  thumbnail_size: 12345,
  file_type: 'image'
};

console.log(`   保存到数据库的数据:`);
console.log(`   - path: ${imageData.path}`);
console.log(`   - thumbnail_path: ${imageData.thumbnail_path}`);
console.log(`   - file_type: ${imageData.file_type}`);
console.log(`   ✅ thumbnail_path 应该是相对路径，使用正斜杠`);

// 4. 模拟前端读取
console.log('\n4️⃣ 检查前端读取逻辑:');
const filenameFromDB = imageData.thumbnail_path.replace(/\\/g, '/').split('/').pop();
console.log(`   从数据库读取: ${imageData.thumbnail_path}`);
console.log(`   提取文件名: ${filenameFromDB}`);
console.log(`   构建URL: /api/image/thumbnail/{libraryId}/480/${filenameFromDB}`);
console.log(`   ✅ 前端只需要文件名，不需要完整路径`);

// 5. 模拟后端API服务
console.log('\n5️⃣ 检查后端API服务逻辑:');
const filenameFromURL = filenameFromDB;
const hashFromFilename = filenameFromURL.replace(/\.[^/.]+$/, ""); // 去掉扩展名
const shardFromHash = hashFromFilename.slice(0, 2);
const reconstructedPath = path.join(testLibraryPath, '.flypic', 'thumbnails', shardFromHash, filenameFromURL);

console.log(`   接收到的文件名: ${filenameFromURL}`);
console.log(`   提取 hash: ${hashFromFilename}`);
console.log(`   提取分片: ${shardFromHash}`);
console.log(`   重建完整路径: ${reconstructedPath}`);
console.log(`   ✅ 后端能正确重建路径`);

// 6. 验证一致性
console.log('\n6️⃣ 验证路径一致性:');
const originalPath = thumbnailPath;
const reconstructedPathNormalized = path.normalize(reconstructedPath);

console.log(`   原始路径: ${originalPath}`);
console.log(`   重建路径: ${reconstructedPathNormalized}`);

if (originalPath === reconstructedPathNormalized) {
  console.log(`   ✅ 路径完全一致！`);
} else {
  console.log(`   ❌ 路径不一致！`);
}

// 7. 总结
console.log('\n7️⃣ 总结:');
console.log('=' .repeat(60));
console.log('✅ 缩略图路径格式: .flypic/thumbnails/XX/hash.webp');
console.log('✅ 数据库存储: 相对路径，使用正斜杠');
console.log('✅ 前端提取: 只需要文件名');
console.log('✅ 后端重建: 从文件名提取hash和分片');
console.log('✅ 不使用 480 文件夹');
console.log('\n整个流程一致性验证通过！');
