/**
 * 瀑布流布局计算 Worker
 * 将耗时的布局计算移到后台线程，避免阻塞主线程
 * 
 * 优化策略：
 * 1. 支持增量计算 - 只计算新增图片的布局
 * 2. 只传输必要字段 - 减少数据传输开销
 * 3. 分块处理 - 避免长时间阻塞 Worker 线程
 */

const GAP = 16;

// 缓存上次计算的状态，用于增量计算
let cachedState = {
  containerWidth: 0,
  targetHeight: 0,
  imageCount: 0,
  rows: [],
  // 最后一行的未完成状态（用于增量追加）
  pendingRow: [],
  pendingRowWidthSum: 0
};

/**
 * 计算单行布局
 * @param {Array} rowImages - 行内图片
 * @param {number} containerWidth - 容器宽度
 * @param {number} rowWidthSum - 行内图片原始宽度总和
 * @param {boolean} isLastRow - 是否是最后一行
 * @param {number} targetHeight - 目标行高
 * @returns {Array} 计算后的行
 */
function finalizeRow(rowImages, containerWidth, rowWidthSum, isLastRow, targetHeight) {
  const totalGaps = (rowImages.length - 1) * GAP;
  const availableWidth = containerWidth - totalGaps;
  
  let scale = availableWidth / rowWidthSum;
  
  // 最后一行少于3张图片时，限制拉伸
  if (isLastRow && rowImages.length < 3) {
    scale = Math.min(scale, 1.2);
  }
  
  const rowHeight = targetHeight * scale;
  
  return rowImages.map(img => ({
    ...img,
    calculatedWidth: img.originalWidth * scale,
    calculatedHeight: rowHeight
  }));
}

/**
 * 计算瀑布流布局（完整计算）
 * @param {Array} images - 图片列表（只包含必要字段）
 * @param {number} containerWidth - 容器宽度
 * @param {number} targetHeight - 目标行高
 * @returns {Object} { rows, pendingRow, pendingRowWidthSum }
 */
function calculateLayoutFull(images, containerWidth, targetHeight) {
  if (!images.length || !containerWidth) {
    return { rows: [], pendingRow: [], pendingRowWidthSum: 0 };
  }

  const calculatedRows = [];
  let currentRow = [];
  let currentRowWidthSum = 0;

  for (let index = 0; index < images.length; index++) {
    const image = images[index];
    const aspectRatio = image.width / image.height;
    const imageWidth = targetHeight * aspectRatio;
    
    currentRow.push({ 
      ...image, 
      originalWidth: imageWidth,
      aspectRatio: aspectRatio
    });
    currentRowWidthSum += imageWidth;
    
    const currentGaps = (currentRow.length - 1) * GAP;
    const totalWidth = currentRowWidthSum + currentGaps;
    const isLastImage = index === images.length - 1;
    
    let shouldFinishRow = false;
    
    if (isLastImage) {
      shouldFinishRow = true;
    } else if (totalWidth >= containerWidth * 0.95) {
      shouldFinishRow = true;
    } else {
      const nextImage = images[index + 1];
      if (nextImage) {
        const nextAspectRatio = nextImage.width / nextImage.height;
        const nextImageWidth = targetHeight * nextAspectRatio;
        const nextTotalWidth = currentRowWidthSum + nextImageWidth + (currentRow.length * GAP);
        
        if (nextTotalWidth > containerWidth * 1.2) {
          shouldFinishRow = true;
        }
      }
    }
    
    if (shouldFinishRow) {
      const finalizedRow = finalizeRow(currentRow, containerWidth, currentRowWidthSum, isLastImage, targetHeight);
      calculatedRows.push(finalizedRow);
      currentRow = [];
      currentRowWidthSum = 0;
    }
  }

  return { 
    rows: calculatedRows, 
    pendingRow: currentRow, 
    pendingRowWidthSum: currentRowWidthSum 
  };
}

/**
 * 增量计算布局 - 只处理新增的图片
 * @param {Array} newImages - 新增的图片列表
 * @param {number} containerWidth - 容器宽度
 * @param {number} targetHeight - 目标行高
 * @param {Array} existingRows - 已有的行（不含最后一行）
 * @param {Array} pendingRow - 上次未完成的行
 * @param {number} pendingRowWidthSum - 上次未完成行的宽度和
 * @returns {Object} { rows, pendingRow, pendingRowWidthSum }
 */
function calculateLayoutIncremental(newImages, containerWidth, targetHeight, existingRows, pendingRow, pendingRowWidthSum) {
  if (!newImages.length) {
    // 没有新图片，只需要重新计算最后一行
    if (pendingRow.length > 0) {
      const finalizedRow = finalizeRow(pendingRow, containerWidth, pendingRowWidthSum, true, targetHeight);
      return { 
        rows: [...existingRows, finalizedRow], 
        pendingRow: [], 
        pendingRowWidthSum: 0 
      };
    }
    return { rows: existingRows, pendingRow: [], pendingRowWidthSum: 0 };
  }

  const calculatedRows = [...existingRows];
  let currentRow = [...pendingRow];
  let currentRowWidthSum = pendingRowWidthSum;
  
  // 合并所有图片（包括 pending 的）来计算总数
  const totalImageCount = existingRows.reduce((sum, row) => sum + row.length, 0) + pendingRow.length + newImages.length;

  for (let i = 0; i < newImages.length; i++) {
    const image = newImages[i];
    const aspectRatio = image.width / image.height;
    const imageWidth = targetHeight * aspectRatio;
    
    currentRow.push({ 
      ...image, 
      originalWidth: imageWidth,
      aspectRatio: aspectRatio
    });
    currentRowWidthSum += imageWidth;
    
    const currentGaps = (currentRow.length - 1) * GAP;
    const totalWidth = currentRowWidthSum + currentGaps;
    const processedCount = existingRows.reduce((sum, row) => sum + row.length, 0) + calculatedRows.length - existingRows.length + currentRow.length;
    const isLastImage = processedCount >= totalImageCount;
    
    let shouldFinishRow = false;
    
    if (isLastImage) {
      shouldFinishRow = true;
    } else if (totalWidth >= containerWidth * 0.95) {
      shouldFinishRow = true;
    } else {
      const nextImage = newImages[i + 1];
      if (nextImage) {
        const nextAspectRatio = nextImage.width / nextImage.height;
        const nextImageWidth = targetHeight * nextAspectRatio;
        const nextTotalWidth = currentRowWidthSum + nextImageWidth + (currentRow.length * GAP);
        
        if (nextTotalWidth > containerWidth * 1.2) {
          shouldFinishRow = true;
        }
      }
    }
    
    if (shouldFinishRow) {
      const finalizedRow = finalizeRow(currentRow, containerWidth, currentRowWidthSum, isLastImage, targetHeight);
      calculatedRows.push(finalizedRow);
      currentRow = [];
      currentRowWidthSum = 0;
    }
  }

  return { 
    rows: calculatedRows, 
    pendingRow: currentRow, 
    pendingRowWidthSum: currentRowWidthSum 
  };
}

/**
 * 重置缓存状态
 */
function resetCache() {
  cachedState = {
    containerWidth: 0,
    targetHeight: 0,
    imageCount: 0,
    rows: [],
    pendingRow: [],
    pendingRowWidthSum: 0
  };
}

// 监听主线程消息
self.onmessage = function(e) {
  const { images, containerWidth, targetHeight, requestId, incremental, reset } = e.data;
  
  // 显式重置请求
  if (reset) {
    resetCache();
    self.postMessage({ requestId, reset: true });
    return;
  }
  
  const startTime = performance.now();
  let result;
  
  // 判断是否可以使用增量计算
  const canUseIncremental = incremental && 
    cachedState.containerWidth === containerWidth && 
    cachedState.targetHeight === targetHeight &&
    images.length > cachedState.imageCount;
  
  if (canUseIncremental) {
    // 增量计算：只处理新增的图片
    const newImages = images.slice(cachedState.imageCount);
    
    // 移除最后一行（因为它可能是未完成的）
    const existingRows = cachedState.rows.slice(0, -1);
    const lastRow = cachedState.rows[cachedState.rows.length - 1] || [];
    
    result = calculateLayoutIncremental(
      newImages, 
      containerWidth, 
      targetHeight,
      existingRows,
      cachedState.pendingRow.length > 0 ? cachedState.pendingRow : lastRow,
      cachedState.pendingRowWidthSum > 0 ? cachedState.pendingRowWidthSum : lastRow.reduce((sum, img) => sum + img.originalWidth, 0)
    );
  } else {
    // 完整计算
    result = calculateLayoutFull(images, containerWidth, targetHeight);
  }
  
  // 更新缓存
  cachedState = {
    containerWidth,
    targetHeight,
    imageCount: images.length,
    rows: result.rows,
    pendingRow: result.pendingRow,
    pendingRowWidthSum: result.pendingRowWidthSum
  };
  
  const duration = performance.now() - startTime;
  
  // 返回结果
  self.postMessage({
    rows: result.rows,
    requestId,
    duration,
    imageCount: images.length,
    rowCount: result.rows.length,
    incremental: canUseIncremental
  });
};
