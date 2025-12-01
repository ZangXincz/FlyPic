const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif'];

/**
 * Check if file is a supported image
 */
function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  return SUPPORTED_FORMATS.includes(ext);
}

/**
 * Calculate file hash for change detection
 */
function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('md5');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Get thumbnail configuration based on original image size
 */
function getThumbnailConfig(originalWidth, originalHeight, targetHeight = 200) {
  const targetWidth = Math.round((originalWidth / originalHeight) * targetHeight);
  
  // 优化质量配置：提高质量，减少模糊
  // WebP 格式建议质量范围：80-95
  let quality = 90;
  const originalSize = originalWidth * originalHeight;
  
  if (originalSize > 10000000) {      // >10MP
    quality = 85;  // 提高到 85（之前 70）
  } else if (originalSize > 5000000) { // 5-10MP
    quality = 88;  // 提高到 88（之前 75）
  } else if (originalSize > 2000000) { // 2-5MP
    quality = 90;  // 提高到 90（之前 80）
  }
  
  return {
    width: targetWidth,
    height: targetHeight,
    quality: quality,
    format: 'webp'
  };
}

/**
 * Generate thumbnail for an image with dynamic quality adjustment
 */
async function generateThumbnail(inputPath, outputPath, targetHeight = 200) {
  try {
    // Get image metadata
    const metadata = await sharp(inputPath).metadata();
    const config = getThumbnailConfig(metadata.width, metadata.height, targetHeight);
    
    const TARGET_MIN_SIZE = 50 * 1024;  // 50KB (提高下限)
    const TARGET_MAX_SIZE = 150 * 1024; // 150KB (提高上限)
    const MAX_ATTEMPTS = 3;
    
    let quality = config.quality;
    let attempt = 0;
    let finalSize = 0;
    
    // 动态调整质量，直到文件大小在目标范围内
    while (attempt < MAX_ATTEMPTS) {
      // Generate thumbnail with current quality
      await sharp(inputPath)
        .resize(config.width, config.height, {
          fit: 'cover',
          position: 'center',
          kernel: 'lanczos3'  // 使用高质量的缩放算法
        })
        .webp({ 
          quality: quality,
          effort: 6,  // 提高压缩质量（0-6，6最好但最慢）
          smartSubsample: true  // 智能色度子采样
        })
        .toFile(outputPath);
      
      // Check file size
      const stats = fs.statSync(outputPath);
      finalSize = stats.size;
      
      // 如果在目标范围内，完成
      if (finalSize >= TARGET_MIN_SIZE && finalSize <= TARGET_MAX_SIZE) {
        console.log(`✅ Thumbnail generated: ${finalSize} bytes (quality: ${quality})`);
        break;
      }
      
      // 如果太大，降低质量
      if (finalSize > TARGET_MAX_SIZE) {
        const ratio = TARGET_MAX_SIZE / finalSize;
        quality = Math.max(70, Math.round(quality * ratio * 0.9));  // 最低质量提高到 70
        console.log(`⬇️ File too large (${finalSize} bytes), reducing quality to ${quality}`);
      }
      // 如果太小，提高质量
      else if (finalSize < TARGET_MIN_SIZE) {
        const ratio = TARGET_MIN_SIZE / finalSize;
        quality = Math.min(98, Math.round(quality * ratio * 1.1));  // 最高质量提高到 98
        console.log(`⬆️ File too small (${finalSize} bytes), increasing quality to ${quality}`);
      }
      
      attempt++;
      
      // 最后一次尝试，接受结果
      if (attempt >= MAX_ATTEMPTS) {
        console.log(`⚠️ Max attempts reached, final size: ${finalSize} bytes (quality: ${quality})`);
        break;
      }
    }
    
    return {
      width: config.width,
      height: config.height,
      size: finalSize,
      quality: quality,
      path: outputPath
    };
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    throw error;
  }
}

/**
 * Get image metadata
 */
async function getImageMetadata(imagePath) {
  try {
    const metadata = await sharp(imagePath).metadata();
    const stats = fs.statSync(imagePath);
    
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: stats.size,
      created_at: stats.birthtimeMs,
      modified_at: stats.mtimeMs
    };
  } catch (error) {
    console.error('Error getting image metadata:', error);
    return null;
  }
}

/**
 * Generate thumbnail for an image
 * 优化：直接存储在 thumbnails/ 目录，不再使用子文件夹
 */
async function generateImageThumbnails(imagePath, libraryPath) {
  const flypicDir = path.join(libraryPath, '.flypic');
  const relativePath = path.relative(libraryPath, imagePath);
  const hash = crypto.createHash('md5').update(relativePath).digest('hex');
  
  // 直接存储在 thumbnails 目录，不使用 200 子文件夹
  const thumbPath = path.join(flypicDir, 'thumbnails', `${hash}.webp`);
  const thumb = await generateThumbnail(imagePath, thumbPath, 200);
  
  return {
    thumbnail_path: path.relative(flypicDir, thumbPath),
    thumbnail_size: thumb.size
  };
}

module.exports = {
  isImageFile,
  calculateFileHash,
  getThumbnailConfig,
  generateThumbnail,
  getImageMetadata,
  generateImageThumbnails,
  SUPPORTED_FORMATS
};
