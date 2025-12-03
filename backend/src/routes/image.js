/**
 * 图片路由（新架构）
 * 薄层路由，业务逻辑在 Service 层
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { asyncHandler } = require('../middleware/errorHandler');
const { validatePagination } = require('../middleware/validator');
const { getFlypicPath } = require('../config');

// 服务实例（从 app 中获取）
let imageService;

router.use((req, res, next) => {
  if (!imageService) {
    imageService = req.app.get('imageService');
  }
  next();
});

/**
 * 搜索图片
 * GET /api/image?libraryId=xxx&keywords=xxx&folder=xxx&offset=0&limit=100
 */
router.get('/', 
  validatePagination,
  asyncHandler(async (req, res) => {
    const { libraryId, keywords, folder, formats, offset, limit } = req.query;

    const filters = {};
    if (keywords) filters.keywords = keywords;
    if (folder) filters.folder = folder;
    if (formats) filters.formats = formats.split(',');

    const pagination = (offset !== undefined && limit !== undefined)
      ? { offset: parseInt(offset), limit: parseInt(limit) }
      : null;

    const result = await imageService.searchImages(libraryId, filters, pagination);
    res.json({ success: true, data: result });
  })
);

/**
 * 获取图片总数
 * GET /api/image/count?libraryId=xxx
 */
router.get('/count', asyncHandler(async (req, res) => {
  const { libraryId } = req.query;
  const count = await imageService.getImageCount(libraryId);
  res.json({ success: true, data: { count } });
}));

/**
 * 获取图片统计
 * GET /api/image/stats?libraryId=xxx
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const { libraryId } = req.query;
  const stats = await imageService.getImageStats(libraryId);
  res.json({ success: true, data: stats });
}));

/**
 * 获取文件夹列表
 * GET /api/image/folders?libraryId=xxx
 */
router.get('/folders', asyncHandler(async (req, res) => {
  const { libraryId } = req.query;
  const folders = await imageService.getFolders(libraryId);
  res.json({ success: true, data: { folders } });
}));

/**
 * 获取缓存元数据
 * GET /api/image/cache-meta?libraryId=xxx
 */
router.get('/cache-meta', asyncHandler(async (req, res) => {
  const { libraryId } = req.query;
  const meta = await imageService.getCacheMeta(libraryId);
  res.json({ success: true, data: meta });
}));

/**
 * 获取图片详情
 * GET /api/image/:id?libraryId=xxx
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { libraryId } = req.query;
  const image = await imageService.getImageById(libraryId, id);
  res.json({ success: true, data: image });
}));

/**
 * 获取缩略图
 * GET /api/image/thumbnail/:libraryId/:filename
 * 使用分片结构：.flypic/thumbnails/ab/hash.webp
 */
router.get('/thumbnail/:libraryId/:filename', (req, res) => {
  const { libraryId, filename } = req.params;
  
  console.log(`[Thumbnail] ========== NEW REQUEST ==========`);
  console.log(`[Thumbnail] LibraryId: ${libraryId}, Filename: ${filename}`);
  
  try {
    const config = require('../../utils/config').loadConfig();
    console.log(`[Thumbnail] All libraries:`, config.libraries.map(l => ({ id: l.id, type: typeof l.id })));
    
    // 尝试两种方式查找：数字和字符串
    let library = config.libraries.find(lib => lib.id === parseInt(libraryId));
    if (!library) {
      library = config.libraries.find(lib => lib.id == libraryId); // 使用 == 宽松比较
    }
    
    if (!library) {
      console.log(`[Thumbnail] Library not found: ${libraryId} (type: ${typeof libraryId})`);
      return res.status(404).send('Library not found');
    }
    
    console.log(`[Thumbnail] Library path: ${library.path}`);
    
    // 使用分片结构：取文件名前2个字符作为分片目录
    const hash = filename.replace(/\.[^/.]+$/, ''); // 移除扩展名
    const shard = hash.slice(0, 2);
    const flypicPath = getFlypicPath(library.path);
    const thumbnailPath = path.join(flypicPath, 'thumbnails', shard, filename);
    
    console.log(`[Thumbnail] Hash: ${hash}, Shard: ${shard}`);
    console.log(`[Thumbnail] Full path: ${thumbnailPath}`);
    console.log(`[Thumbnail] File exists: ${fs.existsSync(thumbnailPath)}`);
    
    if (!fs.existsSync(thumbnailPath)) {
      // 列出分片目录的内容
      const shardDir = path.join(flypicPath, 'thumbnails', shard);
      if (fs.existsSync(shardDir)) {
        const files = fs.readdirSync(shardDir);
        console.log(`[Thumbnail] Files in shard dir (${shard}):`, files.slice(0, 5));
      } else {
        console.log(`[Thumbnail] Shard directory does not exist: ${shardDir}`);
      }
      return res.status(404).send('Thumbnail not found');
    }
    
    console.log(`[Thumbnail] ✅ Serving file`);
    res.sendFile(thumbnailPath);
  } catch (error) {
    console.error('[Thumbnail] Error:', error);
    res.status(500).send('Error serving thumbnail');
  }
});

/**
 * 获取原图
 * GET /api/image/original/:libraryId/:path
 */
router.get('/original/:libraryId/*', (req, res) => {
  const { libraryId } = req.params;
  const imagePath = req.params[0]; // 获取通配符匹配的路径
  
  try {
    const config = require('../../utils/config').loadConfig();
    
    // 尝试两种方式查找：数字和字符串
    let library = config.libraries.find(lib => lib.id === parseInt(libraryId));
    if (!library) {
      library = config.libraries.find(lib => lib.id == libraryId);
    }
    
    if (!library) {
      return res.status(404).send('Library not found');
    }
    
    const fullPath = path.join(library.path, imagePath);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).send('Image not found');
    }
    
    res.sendFile(fullPath);
  } catch (error) {
    console.error('Error serving original image:', error);
    res.status(500).send('Error serving image');
  }
});

module.exports = router;
