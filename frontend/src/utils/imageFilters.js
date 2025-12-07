/**
 * 图片筛选相关工具函数
 */

/**
 * 解析大小字符串为 KB
 * @param {string} sizeStr - 大小字符串，如 "1.5MB"
 * @returns {number} KB 数值
 */
export const parseSizeToKB = (sizeStr) => {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)(B|KB|MB|GB)$/);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'B': return value / 1024;
    case 'KB': return value;
    case 'MB': return value * 1024;
    case 'GB': return value * 1024 * 1024;
    default: return 0;
  }
};

/**
 * 匹配大小范围
 * @param {number} sizeKB - 文件大小（KB）
 * @param {string} range - 范围字符串，如 ">10MB" 或 "1MB - 10MB"
 * @returns {boolean} 是否匹配
 */
export const matchSizeRange = (sizeKB, range) => {
  if (range.startsWith('>')) {
    const minStr = range.substring(1).trim();
    const minKB = parseSizeToKB(minStr);
    return sizeKB >= minKB;
  } else if (range.includes(' - ')) {
    const [minStr, maxStr] = range.split(' - ').map(s => s.trim());
    const minKB = parseSizeToKB(minStr);
    const maxKB = parseSizeToKB(maxStr);
    return sizeKB >= minKB && sizeKB < maxKB;
  }
  return false;
};

/**
 * 前端筛选图片
 * @param {Array} images - 图片列表
 * @param {Object} filters - 筛选条件 { formats, sizes, orientations, ratings }
 * @returns {Array} 筛选后的图片列表
 */
export const filterImages = (images, filters) => {
  const { formats, sizes, orientations, ratings } = filters;
  
  // 如果没有任何筛选条件，直接返回原始图片
  if ((!formats || formats.length === 0) && 
      (!sizes || sizes.length === 0) && 
      (!orientations || orientations.length === 0) &&
      (!ratings || ratings.length === 0)) {
    return images;
  }

  return images.filter(img => {
    // 格式筛选
    if (formats && formats.length > 0) {
      if (!formats.includes(img.format?.toLowerCase())) {
        return false;
      }
    }

    // 文件大小筛选
    if (sizes && sizes.length > 0) {
      const sizeKB = img.size / 1024;
      let matchesSize = false;
      
      for (const range of sizes) {
        if (matchSizeRange(sizeKB, range)) {
          matchesSize = true;
          break;
        }
      }
      
      if (!matchesSize) return false;
    }

    // 方向筛选（多选）
    if (orientations && orientations.length > 0) {
      const aspectRatio = img.width / img.height;
      let matchesOrientation = false;
      
      for (const orientation of orientations) {
        if (orientation === 'horizontal' && aspectRatio > 1.05) {
          matchesOrientation = true;
          break;
        } else if (orientation === 'vertical' && aspectRatio < 0.95) {
          matchesOrientation = true;
          break;
        } else if (orientation === 'square' && aspectRatio >= 0.95 && aspectRatio <= 1.05) {
          matchesOrientation = true;
          break;
        }
      }
      
      if (!matchesOrientation) return false;
    }

    // 评分筛选（多选）
    if (ratings && ratings.length > 0) {
      const imgRating = img.rating || 0;
      if (!ratings.includes(imgRating)) return false;
    }

    return true;
  });
};
