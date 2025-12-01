/**
 * 瀑布流布局计算 Worker
 * 将耗时的布局计算移到后台线程，避免阻塞主线程
 */

/**
 * 计算瀑布流布局
 * @param {Array} images - 图片列表
 * @param {number} containerWidth - 容器宽度
 * @param {number} targetHeight - 目标行高
 * @returns {Array} 计算后的行数组
 */
function calculateLayout(images, containerWidth, targetHeight) {
  if (!images.length || !containerWidth) {
    return [];
  }

  const gap = 16;
  const calculatedRows = [];
  let currentRow = [];
  let currentRowWidthSum = 0;

  images.forEach((image, index) => {
    const aspectRatio = image.width / image.height;
    const imageWidth = targetHeight * aspectRatio;
    
    // Add to current row
    currentRow.push({ 
      ...image, 
      originalWidth: imageWidth,
      aspectRatio: aspectRatio
    });
    currentRowWidthSum += imageWidth;
    
    // Calculate if current row is ready to be finalized
    const currentGaps = (currentRow.length - 1) * gap;
    const totalWidth = currentRowWidthSum + currentGaps;
    const isLastImage = index === images.length - 1;
    
    // Decide if we should finish this row
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
        const nextTotalWidth = currentRowWidthSum + nextImageWidth + (currentRow.length * gap);
        
        if (nextTotalWidth > containerWidth * 1.2) {
          shouldFinishRow = true;
        }
      }
    }
    
    if (shouldFinishRow) {
      const totalGaps = (currentRow.length - 1) * gap;
      const availableWidth = containerWidth - totalGaps;
      
      let scale = availableWidth / currentRowWidthSum;
      
      if (isLastImage && currentRow.length < 3) {
        scale = Math.min(scale, 1.2);
      }
      
      const rowHeight = targetHeight * scale;
      
      currentRow = currentRow.map(img => ({
        ...img,
        calculatedWidth: img.originalWidth * scale,
        calculatedHeight: rowHeight
      }));
      
      calculatedRows.push(currentRow);
      
      currentRow = [];
      currentRowWidthSum = 0;
    }
  });

  return calculatedRows;
}

// 监听主线程消息
self.onmessage = function(e) {
  const { images, containerWidth, targetHeight, requestId } = e.data;
  
  const startTime = performance.now();
  const rows = calculateLayout(images, containerWidth, targetHeight);
  const duration = performance.now() - startTime;
  
  // 返回结果
  self.postMessage({
    rows,
    requestId,
    duration,
    imageCount: images.length,
    rowCount: rows.length
  });
};
