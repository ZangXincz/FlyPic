/**
 * 瀑布流布局计算 Hook
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useUIStore } from '../stores/useUIStore';

/**
 * 瀑布流布局计算
 * @param {Array} images - 图片列表
 * @param {Object} options - 配置选项
 * @returns {Object} { rows, containerRef, containerWidth, containerHeight }
 */
export const useWaterfallLayout = (images, options = {}) => {
  const { gap = 16 } = options;
  const { thumbnailHeight, isResizingPanels } = useUIStore();
  
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // 监听容器宽度变化（使用 ResizeObserver + 去抖/阈值抑制）
  useEffect(() => {
    let resizeObserver = null;
    let retryCount = 0;
    const maxRetries = 10;

    // 使用 ref 记录上次宽度，避免频繁 setState
    const lastWidthRef = { current: 0 };
    let debounceTimer = null;

    const emitSize = (width, height) => {
      // 仅当差异超过阈值时更新，减少重算次数
      const threshold = 12; // px
      if (Math.abs(width - lastWidthRef.current) < threshold) return true;

      lastWidthRef.current = width;

      // 去抖：在一小段静止后再更新（拖动时降低重算频率）
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        setContainerWidth(width);
        setContainerHeight(height);
      }, 50);
      return true;
    };

    const measureAndEmit = () => {
      if (containerRef.current) {
        // 预留 padding：与现有布局保持一致
        const width = containerRef.current.offsetWidth - 32;
        const height = containerRef.current.offsetHeight;
        if (width > 0) {
          return emitSize(width, height);
        }
      }
      return false;
    };

    const tryInit = () => {
      if (measureAndEmit()) {
        // 成功获取宽度，设置 ResizeObserver
        if (containerRef.current) {
          resizeObserver = new ResizeObserver(() => {
            // 拖动时跳过更新，避免频繁重算布局
            if (useUIStore.getState().isResizingPanels) return;
            measureAndEmit();
          });
          resizeObserver.observe(containerRef.current);
        }
      } else if (retryCount < maxRetries) {
        // 重试
        retryCount++;
        requestAnimationFrame(tryInit);
      }
    };

    // 使用 requestAnimationFrame 确保 DOM 已渲染
    requestAnimationFrame(tryInit);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, []);

  // 拖动结束时（isResizingPanels 从 true -> false）立即测量一次
  useEffect(() => {
    if (isResizingPanels) return;
    if (!containerRef.current) return;
    const width = containerRef.current.offsetWidth - 32;
    const height = containerRef.current.offsetHeight;
    if (width > 0) {
      setContainerWidth(width);
      setContainerHeight(height);
    }
  }, [isResizingPanels]);

  // 布局计算（始终在主线程同步执行）
  const rows = useMemo(() => {
    if (!images.length || !containerWidth) {
      return [];
    }

    const targetHeight = thumbnailHeight;
    const calculatedRows = [];
    let currentRow = [];
    let currentRowWidthSum = 0;

    images.forEach((image, index) => {
      const aspectRatio = image.width / image.height;
      const imageWidth = targetHeight * aspectRatio;
      
      currentRow.push({ 
        ...image, 
        originalWidth: imageWidth,
        aspectRatio: aspectRatio
      });
      currentRowWidthSum += imageWidth;
      
      const currentGaps = (currentRow.length - 1) * gap;
      const totalWidth = currentRowWidthSum + currentGaps;
      const isLastImage = index === images.length - 1;
      
      let shouldFinishRow = false;
      
      if (isLastImage) {
        shouldFinishRow = true;
      } else if (totalWidth >= containerWidth * 0.95) {
        // Row is almost full (95% or more) - finish it
        shouldFinishRow = true;
      } else {
        // Check if adding next image would overflow too much
        const nextImage = images[index + 1];
        if (nextImage) {
          const nextAspectRatio = nextImage.width / nextImage.height;
          const nextImageWidth = targetHeight * nextAspectRatio;
          const nextTotalWidth = currentRowWidthSum + nextImageWidth + (currentRow.length * gap);
          
          // If adding next image would exceed 120% of container width, finish current row
          if (nextTotalWidth > containerWidth * 1.2) {
            shouldFinishRow = true;
          }
        }
      }
      
      if (shouldFinishRow) {
        const totalGaps = (currentRow.length - 1) * gap;
        const availableWidth = containerWidth - totalGaps;
        
        // For last row with few images, limit the scale to avoid over-stretching
        let scale = availableWidth / currentRowWidthSum;
        
        if (isLastImage && currentRow.length < 3) {
          // Last row with 1-2 images: don't stretch too much
          scale = Math.min(scale, 1.2);
        }
        
        const rowHeight = targetHeight * scale;
        
        currentRow = currentRow.map(img => ({
          ...img,
          calculatedWidth: img.originalWidth * scale,
          calculatedHeight: rowHeight
        }));
        
        calculatedRows.push(currentRow);
        
        // Reset for next row
        currentRow = [];
        currentRowWidthSum = 0;
      }
    });

    return calculatedRows;
  }, [images, thumbnailHeight, containerWidth, gap]);

  // 扁平化的图片列表（用于 Shift 多选）
  const flatImages = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    return rows.flat();
  }, [rows]);

  // 获取行高（用于虚拟滚动）
  const getRowHeight = useCallback((index) => {
    if (!rows || !rows[index] || rows[index].length === 0) {
      return thumbnailHeight + 40;
    }
    // 行高 = 图片高度 + 文件名区域 + 行间距
    const firstImage = rows[index][0];
    return (firstImage?.calculatedHeight || thumbnailHeight) + 28 + 32;
  }, [rows, thumbnailHeight]);

  return {
    rows,
    flatImages,
    containerRef,
    containerWidth,
    containerHeight,
    getRowHeight
  };
};
