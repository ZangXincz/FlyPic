/**
 * 图片评分 Hook
 */

import { useState, useCallback } from 'react';
import { useImageStore } from '../stores/useImageStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { imageAPI } from '../api';
import { createLogger } from '../utils/logger';

const logger = createLogger('useImageRating');

/**
 * 图片评分功能
 * @returns {Object} 评分相关的状态和方法
 */
export const useImageRating = () => {
  const { currentLibraryId } = useLibraryStore();
  const { images, setImages, selectedImage, selectedImages, selectedFolder } = useImageStore();
  
  const [ratingToast, setRatingToast] = useState({ isVisible: false, rating: 0, count: 0 });

  /**
   * 快速评分（数字键 0-5）
   */
  const handleQuickRating = useCallback(async (rating) => {
    const imagesToRate = selectedImages.length > 0
      ? selectedImages
      : selectedImage
      ? [selectedImage]
      : [];
    
    if (imagesToRate.length === 0) return;
    
    try {
      const paths = imagesToRate.map(img => img.path);
      await imageAPI.updateRating(currentLibraryId, paths, rating);
      
      // 更新本地状态（images）
      const updatedImages = images.map(img => {
        if (paths.includes(img.path)) {
          return { ...img, rating };
        }
        return img;
      });
      setImages(updatedImages);
      // 同步更新 originalImages，确保 Header 筛选统计立即生效
      useImageStore.getState().setOriginalImages(updatedImages);
      
      // 更新选中状态
      if (selectedImage && paths.includes(selectedImage.path)) {
        useImageStore.getState().setSelectedImage({ ...selectedImage, rating });
      }
      if (selectedImages.length > 0) {
        const updatedSelected = selectedImages.map(img => {
          if (paths.includes(img.path)) {
            return { ...img, rating };
          }
          return img;
        });
        useImageStore.getState().setSelectedImages(updatedSelected);
      }
      
      // 显示评分提醒
      setRatingToast({
        isVisible: true,
        rating,
        count: imagesToRate.length
      });
      
      // 刷新当前文件夹的图片列表（确保与后端一致）
      if (selectedFolder) {
        const params = { folder: selectedFolder };
        const response = await imageAPI.search(currentLibraryId, params);
        setImages(response.images);
        useImageStore.getState().setOriginalImages(response.images);
      }
      
      logger.file(`已将 ${imagesToRate.length} 张图片评为 ${rating} 星`);
    } catch (error) {
      logger.error('评分失败:', error);
      alert('评分失败: ' + (error.message || '未知错误'));
    }
  }, [selectedImages, selectedImage, images, currentLibraryId, selectedFolder, setImages]);

  return {
    ratingToast,
    setRatingToast,
    handleQuickRating
  };
};
