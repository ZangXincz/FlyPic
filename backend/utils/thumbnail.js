const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 配置 Sharp 内存限制（防止内存泄漏）
sharp.cache({
  memory: 50, // 最大缓存 50MB（默认 50MB）
  files: 0,   // 禁用文件缓存
  items: 20   // 最多缓存 20 个操作
});

// 设置并发限制
sharp.concurrency(1); // 一次只处理 1 张图片

console.log('[Sharp] Memory-optimized configuration applied: cache=50MB, concurrency=1');

// 支持的文件格式（确定可以生成缩略图的）
const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'avif', 'heif', 'heic', 'svg'];

// 文件类型分类（用于显示和占位图）
const FILE_CATEGORIES = {
  // 图片类
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'avif', 'heif', 'heic', 'svg', 'ico', 'raw', 'cr2', 'nef', 'dng'],

  // 视频类
  video: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'm4v', 'wmv', 'mpg', 'mpeg', '3gp', 'ts', 'vob', 'ogv'],

  // 音频类
  audio: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma', 'ape', 'alac', 'opus', 'aiff'],

  // 文档类
  document: [
    'pdf', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'rtf', 'odt', 'ods', 'odp', 'csv', 'pages', 'numbers', 'key'
  ],

  // 设计类
  design: ['psd', 'ai', 'sketch', 'xd', 'fig', 'figma', 'indd', 'eps', 'cdr', 'dwg']
};

// 为了兼容旧代码
const SUPPORTED_FORMATS = {
  image: IMAGE_FORMATS,
  video: FILE_CATEGORIES.video,
  document: FILE_CATEGORIES.document,
  special: FILE_CATEGORIES.design
};

// 所有支持的格式（扁平化，兼容所有文件）
const ALL_FORMATS = [
  ...FILE_CATEGORIES.image,
  ...FILE_CATEGORIES.video,
  ...FILE_CATEGORIES.audio,
  ...FILE_CATEGORIES.document,
  ...FILE_CATEGORIES.design
];

/**
 * 获取文件类型分类
 */
function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);

  // 检查所有分类
  if (FILE_CATEGORIES.image.includes(ext)) return 'image';
  if (FILE_CATEGORIES.video.includes(ext)) return 'video';
  if (FILE_CATEGORIES.audio.includes(ext)) return 'audio';
  if (FILE_CATEGORIES.document.includes(ext)) return 'document';
  if (FILE_CATEGORIES.design.includes(ext)) return 'design';

  // 未知类型也兼容，归类为 other
  return 'other';
}

/**
 * 检查文件是否可以用 Sharp 生成缩略图
 */
function canGenerateThumbnail(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  return IMAGE_FORMATS.includes(ext);
}

/**
 * Check if file is supported
 */
function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  return ALL_FORMATS.includes(ext);
}

/**
 * Calculate file hash for change detection
 */
function calculateFileHash(filePath) {
  let fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('md5');
  hashSum.update(fileBuffer);
  const hash = hashSum.digest('hex');
  
  // 显式释放 Buffer
  fileBuffer = null;
  
  return hash;
}

/**
 * Get thumbnail configuration based on original image size
 * 分阶段策略：根据原图大小使用不同的缩略图尺寸和质量
 * 
 * 策略说明：
 * - 小图（<1MP）：保持原尺寸或轻微缩小，高质量
 * - 中图（1-4MP）：缩略图 200px 高，高质量
 * - 大图（4-12MP）：缩略图 250px 高，中高质量
 * - 超大图（>12MP）：缩略图 300px 高，中等质量
 */
function getThumbnailConfig(originalWidth, originalHeight, targetHeight = 200) {
  const originalPixels = originalWidth * originalHeight;
  const aspectRatio = originalWidth / originalHeight;

  let finalHeight, finalQuality, targetSize;

  // 分阶段策略 - 提高质量，扩大文件大小
  if (originalPixels < 1000000) {
    // 小图 <1MP（如 1000x1000）：保持较小尺寸，极高质量
    finalHeight = Math.min(targetHeight, originalHeight);
    finalQuality = 95;
    targetSize = { min: 80 * 1024, max: 240 * 1024 }; // 80-240KB
  }
  else if (originalPixels < 4000000) {
    // 中图 1-4MP（如 2000x2000）：标准尺寸，极高质量
    finalHeight = Math.min(targetHeight, originalHeight);
    finalQuality = 93;
    targetSize = { min: 120 * 1024, max: 300 * 1024 }; // 120-300KB
  }
  else if (originalPixels < 12000000) {
    // 大图 4-12MP（如 4000x3000）：增大尺寸，高质量
    finalHeight = Math.min(targetHeight, originalHeight);
    finalQuality = 91;
    targetSize = { min: 160 * 1024, max: 400 * 1024 }; // 160-400KB
  }
  else {
    // 超大图 >12MP（如 6000x4000）：更大尺寸，高质量
    finalHeight = Math.min(targetHeight, originalHeight);
    finalQuality = 89;
    targetSize = { min: 200 * 1024, max: 500 * 1024 }; // 200-500KB
  }

  const finalWidth = Math.round(aspectRatio * finalHeight);

  // 计算原图大小（MP）
  const megaPixels = (originalPixels / 1000000).toFixed(1);

  return {
    width: finalWidth,
    height: finalHeight,
    quality: finalQuality,
    targetSize: targetSize,
    format: 'webp',
    originalPixels: originalPixels,
    megaPixels: megaPixels
  };
}

/**
 * Generate thumbnail for an image with high quality settings
 * 
 * 核心优化点：
 * 1. 禁用 smartSubsample，保持色彩锐度（关键！）
 * 2. 使用更强的 unsharp mask 锐化
 * 3. 固定高质量 Q96，不动态调整
 * 4. 不修改色彩（饱和度/亮度），保持原图风格
 */
async function generateThumbnail(inputPath, outputPath, targetHeight = 200) {
  try {
    // 先读取文件到 Buffer，避免 Sharp 锁定文件句柄
    let inputBuffer = fs.readFileSync(inputPath);

    // Get image metadata from buffer
    const metadata = await sharp(inputBuffer).metadata();
    const config = getThumbnailConfig(metadata.width, metadata.height, targetHeight);
    const hasAlpha = Boolean(metadata.hasAlpha);

    // 计算缩小比例，用于调整锐化强度
    const downscaleRatio = metadata.height ? (metadata.height / config.height) : 1;

    // 锐化参数：根据缩小比例动态调整
    // sharpen(sigma, flat, jagged) - sigma: 高斯模糊半径, flat: 平坦区域锐化, jagged: 边缘锐化
    let sharpSigma, sharpFlat, sharpJagged;
    if (downscaleRatio >= 4) {
      // 大幅缩小（如 4000px → 300px）：强锐化
      sharpSigma = 1.2;
      sharpFlat = 1.0;
      sharpJagged = 2.0;
    } else if (downscaleRatio >= 2) {
      // 中等缩小：中等锐化
      sharpSigma = 1.0;
      sharpFlat = 0.8;
      sharpJagged = 1.5;
    } else {
      // 轻微缩小或不缩小：轻度锐化
      sharpSigma = 0.8;
      sharpFlat = 0.5;
      sharpJagged = 1.0;
    }

    // 固定高质量 92（平衡清晰度和体积）
    const quality = 92;

    // 生成缩略图（使用 buffer，不锁定原文件）
    await sharp(inputBuffer)
      .rotate() // 按EXIF旋转
      .resize(config.width, config.height, {
        fit: 'cover',
        position: 'center',
        kernel: 'lanczos3',  // 最高质量缩放算法
        withoutEnlargement: true,
        fastShrinkOnLoad: false  // 禁用快速缩小，保持质量
      })
      // 锐化：使用完整的 unsharp mask 参数（不修改色彩）
      .sharpen({
        sigma: sharpSigma,    // 高斯模糊半径
        m1: sharpFlat,        // 平坦区域锐化强度
        m2: sharpJagged,      // 边缘/锯齿区域锐化强度
        x1: 2,                // 平坦区域阈值
        y2: 10,               // 边缘区域阈值上限
        y3: 20                // 最大锐化限制
      })
      .webp({
        quality: quality,
        effort: 4,            // 降低 effort，减少编码损失
        smartSubsample: false, // 关键！禁用色度子采样，保持边缘清晰
        nearLossless: false,   // 禁用近无损（会增加体积但不增加清晰度）
        preset: 'photo',
        alphaQuality: hasAlpha ? 100 : undefined
      })
      .toFile(outputPath);

    // 显式释放 Buffer 内存
    inputBuffer = null;
    
    // 强制 GC（如果可用）
    if (global.gc && Math.random() < 0.1) { // 10% 概率执行 GC
      global.gc();
    }

    // 获取文件大小
    const stats = fs.statSync(outputPath);
    const finalSize = stats.size;

    // 可选：输出详细信息（每100张输出一次，避免日志过多）
    const shouldLog = Math.random() < 0.01; // 1% 概率输出
    if (shouldLog) {
      const sizeKB = (finalSize / 1024).toFixed(1);
      console.log(`📸 Thumbnail: ${config.megaPixels}MP → ${config.width}x${config.height} (${sizeKB}KB, Q${quality}, ratio ${downscaleRatio.toFixed(1)}x)`);
    }

    return {
      width: config.width,
      height: config.height,
      size: finalSize,
      quality: quality,
      originalPixels: config.originalPixels,
      path: outputPath
    };
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    throw error;
  }
}

/**
 * Get file metadata (支持所有文件类型)
 * 优化：优先使用流式读取，避免加载整个文件到内存
 */
async function getImageMetadata(imagePath) {
  try {
    const stats = fs.statSync(imagePath);
    const fileType = getFileType(imagePath);

    // 对于图片文件，尝试获取详细元数据
    if (fileType === 'image') {
      try {
        // 优化：直接传入路径，让 sharp 使用流式读取，仅读取头部元数据
        // 只有在失败时才回退到 Buffer 读取
        const metadata = await sharp(imagePath).metadata();
        return {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          size: stats.size,
          created_at: stats.birthtimeMs,
          modified_at: stats.mtimeMs
        };
      } catch (sharpError) {
        // Sharp 无法处理某些图片格式（如 SVG）或路径问题，回退到基础信息
        // console.warn(`Sharp cannot process ${imagePath}, using basic metadata`);
      }
    }

    // 对于非图片文件或 Sharp 失败的情况，返回基础信息
    const ext = path.extname(imagePath).toLowerCase().slice(1);
    return {
      width: 640,  // 占位图尺寸
      height: 480,
      format: ext,
      size: stats.size,
      created_at: stats.birthtimeMs,
      modified_at: stats.mtimeMs
    };
  } catch (error) {
    console.error('Error getting file metadata:', imagePath, error);
    return null;
  }
}

/**
 * Generate thumbnail for a file (image/video/document)
 * 使用 480px 高度（与 Billfish 一致）
 */
async function generateImageThumbnails(imagePath, libraryPath) {
  const flypicDir = path.join(libraryPath, '.flypic');
  const relativePath = path.relative(libraryPath, imagePath);
  const hash = crypto.createHash('md5').update(relativePath).digest('hex');
  const fileType = getFileType(imagePath);

  console.log(`📝 Processing file: ${path.basename(imagePath)}, type: ${fileType}`);

  // Sharding: use first 2 chars of hash for subdirectories (e.g. /ab/)
  const shard1 = hash.slice(0, 2);
  // 1-level sharding: .flypic/thumbnails/ab/hash.webp
  const out480 = path.join(flypicDir, 'thumbnails', shard1, `${hash}.webp`);
  fs.mkdirSync(path.dirname(out480), { recursive: true });

  let thumbnailResult;

  // 根据文件类型生成不同的缩略图
  const ext = path.extname(imagePath).slice(1).toUpperCase();

  if (fileType === 'image' && canGenerateThumbnail(imagePath)) {
    // 图片：使用 Sharp 生成真实缩略图
    thumbnailResult = await generateThumbnail(imagePath, out480, 480);
  } else if (fileType === 'video') {
    // 视频：尝试提取封面
    console.log(`🎬 Extracting video thumbnail for: ${path.basename(imagePath)}`);
    thumbnailResult = await extractVideoThumbnail(imagePath, out480);

    // 如果提取失败，生成占位图
    if (!thumbnailResult) {
      console.log(`🎬 Generating video placeholder for: ${path.basename(imagePath)}`);
      thumbnailResult = await generatePlaceholderThumbnail(out480, 'video', ext);
    }
  } else if (fileType === 'design') {
    // 设计文件：尝试提取嵌入缩略图（仅 PSD）
    if (ext.toLowerCase() === 'psd') {
      console.log(`🎨 Extracting PSD thumbnail for: ${path.basename(imagePath)}`);
      thumbnailResult = await extractPSDThumbnail(imagePath, out480);
    }

    // 如果提取失败或不是 PSD，生成占位图
    if (!thumbnailResult) {
      console.log(`🎨 Generating design placeholder for: ${path.basename(imagePath)}`);
      thumbnailResult = await generatePlaceholderThumbnail(out480, 'design', ext);
    }
  } else {
    // 其他类型（音频/文档/未知）：生成占位图
    console.log(`📦 Generating ${fileType} placeholder for: ${path.basename(imagePath)}`);
    thumbnailResult = await generatePlaceholderThumbnail(out480, fileType, ext);
  }

  console.log(`✅ Thumbnail generated: ${path.basename(out480)}, ${thumbnailResult.width}x${thumbnailResult.height}, ${(thumbnailResult.size / 1024).toFixed(1)}KB`);

  // 返回相对于 libraryPath 的路径（包含 .flypic 前缀）
  const thumbnailPath = path.relative(libraryPath, out480).replace(/\\/g, '/');

  return {
    thumbnail_path: thumbnailPath,
    thumbnail_size: thumbnailResult.size,
    width: thumbnailResult.width,
    height: thumbnailResult.height,
    file_type: fileType
  };
}

/**
 * 从 PSD 文件提取嵌入的缩略图
 */
async function extractPSDThumbnail(psdPath, outputPath) {
  try {
    const buffer = fs.readFileSync(psdPath);

    // PSD 文件格式：
    // 前 4 字节: "8BPS" (签名)
    // 偏移 26: Image Resources Section
    // 查找 Resource ID 1036 (缩略图资源)

    if (buffer.toString('utf8', 0, 4) !== '8BPS') {
      throw new Error('Not a valid PSD file');
    }

    // 读取 Image Resources Section 长度
    const colorModeLength = buffer.readUInt32BE(26);
    const imageResourcesOffset = 26 + 4 + colorModeLength;
    const imageResourcesLength = buffer.readUInt32BE(imageResourcesOffset);

    let offset = imageResourcesOffset + 4;
    const endOffset = offset + imageResourcesLength;

    // 查找缩略图资源 (ID 1033 或 1036)
    while (offset < endOffset) {
      const signature = buffer.toString('utf8', offset, offset + 4);
      if (signature !== '8BIM') break;

      const resourceId = buffer.readUInt16BE(offset + 4);
      const nameLength = buffer.readUInt8(offset + 6);
      const namePadding = nameLength % 2 === 0 ? nameLength + 2 : nameLength + 1;
      const dataSize = buffer.readUInt32BE(offset + 6 + namePadding);
      const dataPadding = dataSize % 2 === 0 ? dataSize : dataSize + 1;

      // 1033 = 缩略图 (旧格式), 1036 = 缩略图 (新格式)
      if (resourceId === 1033 || resourceId === 1036) {
        const dataOffset = offset + 6 + namePadding + 4;

        // 跳过前 28 字节的头部信息
        const jpegOffset = dataOffset + 28;
        const jpegData = buffer.slice(jpegOffset, jpegOffset + dataSize - 28);

        // 先获取原始缩略图尺寸
        const metadata = await sharp(jpegData).metadata();
        console.log(`  📐 PSD embedded thumbnail: ${metadata.width}x${metadata.height}`);

        // 使用高质量缩放，保持宽高比
        const aspectRatio = metadata.width / metadata.height;
        const targetHeight = 480;
        const targetWidth = Math.round(targetHeight * aspectRatio);

        // 根据原始尺寸调整处理策略
        let resizeOptions, sharpenOptions, webpQuality;

        if (metadata.width >= 1000 || metadata.height >= 1000) {
          // 高分辨率缩略图（≥1000px）：正常缩放
          resizeOptions = {
            fit: 'inside',
            kernel: 'lanczos3',
            withoutEnlargement: true
          };
          sharpenOptions = { sigma: 0.8, m1: 0.5, m2: 1.0 };
          webpQuality = 95;
        } else if (metadata.width >= 500 || metadata.height >= 500) {
          // 中等分辨率（500-1000px）：轻微放大 + 强锐化
          resizeOptions = {
            fit: 'inside',
            kernel: 'lanczos3',
            withoutEnlargement: false  // 允许放大
          };
          sharpenOptions = { sigma: 1.2, m1: 1.0, m2: 2.0 };  // 强锐化
          webpQuality = 96;
        } else {
          // 低分辨率（<500px）：放大 + 超强锐化
          resizeOptions = {
            fit: 'inside',
            kernel: 'lanczos3',
            withoutEnlargement: false
          };
          sharpenOptions = { sigma: 1.5, m1: 1.2, m2: 2.5 };  // 超强锐化
          webpQuality = 98;  // 最高质量
        }

        await sharp(jpegData)
          .resize(targetWidth, targetHeight, resizeOptions)
          .sharpen(sharpenOptions)
          .webp({
            quality: webpQuality,
            effort: 4,
            smartSubsample: false
          })
          .toFile(outputPath);

        const stats = fs.statSync(outputPath);
        console.log(`  ✅ PSD thumbnail extracted: ${(stats.size / 1024).toFixed(1)}KB`);
        return {
          width: targetWidth,
          height: targetHeight,
          size: stats.size,
          path: outputPath
        };
      }

      offset += 6 + namePadding + 4 + dataPadding;
    }

    throw new Error('No thumbnail found in PSD');
  } catch (error) {
    console.warn(`Failed to extract PSD thumbnail: ${error.message}`);
    return null;
  }
}

/**
 * 从视频提取封面（使用 ffmpeg 或系统工具）
 * 注意：这需要系统安装 ffmpeg，如果没有则回退到占位图
 */
async function extractVideoThumbnail(videoPath, outputPath) {
  try {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);

    // 检查是否有 ffmpeg
    try {
      await execPromise('ffmpeg -version', { timeout: 2000 });
    } catch (e) {
      console.warn('  ⚠️ ffmpeg not found, skipping video thumbnail extraction');
      return null;
    }

    // 使用 ffmpeg 提取第 2 秒的帧（避免黑屏）
    const tempJpg = outputPath.replace('.webp', '_temp.jpg');
    const ffmpegCmd = `ffmpeg -i "${videoPath}" -ss 00:00:02 -vframes 1 -q:v 2 "${tempJpg}" -y`;

    await execPromise(ffmpegCmd, { timeout: 10000 });

    // 如果生成了 JPG，转换为 WebP
    if (fs.existsSync(tempJpg)) {
      // 先获取实际尺寸
      const metadata = await sharp(tempJpg).metadata();
      console.log(`  📐 Video frame: ${metadata.width}x${metadata.height}`);

      // 保持宽高比缩放到 480 高度
      const aspectRatio = metadata.width / metadata.height;
      const targetHeight = 480;
      const targetWidth = Math.round(targetHeight * aspectRatio);

      await sharp(tempJpg)
        .resize(targetWidth, targetHeight, {
          fit: 'cover',
          position: 'center',
          kernel: 'lanczos3',
          withoutEnlargement: true
        })
        .webp({ quality: 92, smartSubsample: false })
        .toFile(outputPath);

      fs.unlinkSync(tempJpg);  // 删除临时 JPG

      const stats = fs.statSync(outputPath);
      console.log(`  ✅ Video thumbnail extracted: ${targetWidth}x${targetHeight}, ${(stats.size / 1024).toFixed(1)}KB`);
      return {
        width: targetWidth,
        height: targetHeight,
        size: stats.size,
        path: outputPath
      };
    }

    return null;
  } catch (error) {
    console.warn(`  ⚠️ Failed to extract video thumbnail: ${error.message}`);
    return null;
  }
}

/**
 * 生成占位缩略图（用于视频/文档等）
 */
async function generatePlaceholderThumbnail(outputPath, type, label) {
  // 使用 Sharp 生成简单的占位图
  const width = 640;
  const height = 480;

  // 不同类型的背景色和图标
  const typeConfig = {
    image: {
      color: { r: 99, g: 102, b: 241 },     // 靛蓝色
      icon: '🖼️',
      text: '图片'
    },
    video: {
      color: { r: 59, g: 130, b: 246 },     // 蓝色
      icon: '🎬',
      text: '视频'
    },
    audio: {
      color: { r: 236, g: 72, b: 153 },     // 粉色
      icon: '🎵',
      text: '音频'
    },
    document: {
      color: { r: 16, g: 185, b: 129 },     // 绿色
      icon: '📄',
      text: '文档'
    },
    design: {
      color: { r: 168, g: 85, b: 247 },     // 紫色
      icon: '🎨',
      text: '设计'
    },
    other: {
      color: { r: 107, g: 114, b: 128 },    // 灰色
      icon: '📁',
      text: '其他'
    }
  };

  const config = typeConfig[type] || typeConfig.other;

  const color = config.color;

  // 创建渐变背景 + 图标 + 文件扩展名
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:rgb(${color.r},${color.g},${color.b});stop-opacity:0.15" />
          <stop offset="100%" style="stop-color:rgb(${color.r},${color.g},${color.b});stop-opacity:0.05" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#grad)"/>
      <text x="50%" y="35%" font-family="Arial, sans-serif" font-size="100" fill="rgb(${color.r},${color.g},${color.b})" text-anchor="middle" dominant-baseline="middle" opacity="0.35">
        ${config.icon}
      </text>
      <text x="50%" y="55%" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="rgb(${color.r},${color.g},${color.b})" text-anchor="middle" dominant-baseline="middle" opacity="0.7">
        .${label.toLowerCase()}
      </text>
      <text x="50%" y="68%" font-family="Arial, sans-serif" font-size="24" fill="rgb(${color.r},${color.g},${color.b})" text-anchor="middle" dominant-baseline="middle" opacity="0.5">
        ${config.text}文件
      </text>
      <text x="50%" y="78%" font-family="Arial, sans-serif" font-size="18" fill="rgb(${color.r},${color.g},${color.b})" text-anchor="middle" dominant-baseline="middle" opacity="0.4">
        双击在默认应用中打开
      </text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .resize(640, 480)
    .webp({ quality: 85 })
    .toFile(outputPath);

  const stats = fs.statSync(outputPath);
  return {
    width: 640,
    height: 480,
    size: stats.size,
    path: outputPath
  };
}

module.exports = {
  isImageFile,
  getFileType,
  calculateFileHash,
  getThumbnailConfig,
  generateThumbnail,
  getImageMetadata,
  generateImageThumbnails,
  SUPPORTED_FORMATS,
  ALL_FORMATS
};
