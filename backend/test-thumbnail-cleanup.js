/**
 * 测试缩略图清理功能
 * 
 * 测试流程：
 * 1. 创建测试图片
 * 2. 扫描生成缩略图
 * 3. 删除图片（移到临时文件夹）
 * 4. 模拟5分钟后的清理（修改删除时间）
 * 5. 执行清理任务
 * 6. 验证缩略图是否被删除
 */

const fs = require('fs');
const path = require('path');
const config = require('./utils/config');
const dbPool = require('./database/dbPool'); // 使用单例实例，不是类

async function testThumbnailCleanup() {
  console.log('🧪 开始测试缩略图清理功能\n');

  // 1. 加载配置
  const currentConfig = config.loadConfig();
  if (!currentConfig.libraries || currentConfig.libraries.length === 0) {
    console.error('❌ 没有找到素材库，请先添加素材库');
    return;
  }

  const library = currentConfig.libraries[0];
  console.log('📋 Library 对象:', JSON.stringify(library, null, 2));
  console.log(`📁 使用素材库: ${library.name} (${library.path})\n`);

  // 2. 确保素材库路径存在
  console.log(`🔍 检查路径: ${library.path}`);
  if (!fs.existsSync(library.path)) {
    console.error(`❌ 素材库路径不存在: ${library.path}`);
    return;
  }
  
  // 3. 获取数据库连接
  console.log('🔌 获取数据库连接...');
  const db = dbPool.acquire(library.path);
  console.log('✅ 数据库连接成功');

  // 4. 查找一个有缩略图的图片
  const stmt = db.db.prepare('SELECT * FROM images WHERE thumbnail_path IS NOT NULL LIMIT 1');
  const testImage = stmt.get();

  if (!testImage) {
    console.error('❌ 没有找到带缩略图的图片');
    dbPool.closeAll();
    return;
  }

  console.log(`🖼️  测试图片: ${testImage.filename}`);
  console.log(`📸 缩略图路径: ${testImage.thumbnail_path}`);

  const thumbnailFullPath = path.join(library.path, testImage.thumbnail_path);
  console.log(`📍 缩略图完整路径: ${thumbnailFullPath}`);

  // 5. 检查缩略图是否存在
  if (!fs.existsSync(thumbnailFullPath)) {
    console.error('❌ 缩略图文件不存在');
    dbPool.closeAll();
    return;
  }
  console.log('✅ 缩略图文件存在\n');

  // 6. 模拟删除（创建临时备份）
  const backupDir = path.join(library.path, '.flypic/temp_backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupPath = path.join(backupDir, testImage.path);
  const backupParentDir = path.dirname(backupPath);
  if (!fs.existsSync(backupParentDir)) {
    fs.mkdirSync(backupParentDir, { recursive: true });
  }

  const originalPath = path.join(library.path, testImage.path);
  
  // 复制文件到备份目录（不删除原文件，避免影响实际数据）
  console.log('📦 创建测试备份...');
  fs.copyFileSync(originalPath, backupPath);

  // 7. 创建 meta 文件（模拟删除时的记录）
  const metaPath = backupPath + '.meta.json';
  const metaContent = {
    originalPath: testImage.path,
    deletedAt: Date.now() - (6 * 60 * 1000), // 模拟6分钟前删除（超过5分钟）
    type: 'file',
    imageRecords: {
      path: testImage.path,
      filename: testImage.filename,
      folder: testImage.folder,
      size: testImage.size,
      width: testImage.width,
      height: testImage.height,
      format: testImage.format,
      file_type: testImage.file_type,
      created_at: testImage.created_at,
      modified_at: testImage.modified_at,
      file_hash: testImage.file_hash,
      thumbnail_path: testImage.thumbnail_path,
      thumbnail_size: testImage.thumbnail_size
    }
  };

  fs.writeFileSync(metaPath, JSON.stringify(metaContent, null, 2));
  console.log('✅ 创建 meta 文件\n');

  // 8. 执行清理（导入 FileService）
  const FileService = require('./src/services/FileService');
  
  // 创建 configManager 包装器（与 server.js 相同）
  const configManager = {
    load: () => config.loadConfig(),
    save: (data) => config.saveConfig(data)
  };
  
  const fileService = new FileService(dbPool, configManager);

  console.log('🧹 执行清理任务...');
  const result = await fileService.cleanExpiredTempFiles(library.id);

  console.log('\n📊 清理结果:');
  console.log(`   - 清理文件数: ${result.cleaned}`);
  console.log(`   - 清理缩略图数: ${result.thumbnailsCleaned}`);
  console.log(`   - 失败数: ${result.failed}`);

  // 9. 验证缩略图是否被删除
  console.log('\n🔍 验证结果:');
  if (!fs.existsSync(thumbnailFullPath)) {
    console.log('✅ 缩略图已被成功清理！');
  } else {
    console.log('❌ 缩略图仍然存在（清理失败）');
  }

  // 10. 清理测试数据（从系统回收站恢复文件）
  console.log('\n🧹 清理测试数据...');
  // 注意：文件已被移入系统回收站，需要手动从回收站恢复
  console.log('⚠️  测试文件已移入系统回收站，请手动从回收站恢复');

  dbPool.closeAll();
  console.log('\n✅ 测试完成');
}

// 运行测试
testThumbnailCleanup().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
