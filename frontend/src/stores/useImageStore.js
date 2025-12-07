/**
 * 图片状态管理
 * 简化版：只做向下无限滚动，依赖浏览器原生懒加载管理内存
 */

import { create } from 'zustand';

export const useImageStore = create((set, get) => ({
  // 图片列表
  images: [],
  selectedImage: null,
  selectedImages: [],
  totalImageCount: 0,
  totalSize: 0,  // 素材库总大小（字节）
  
  // 文件夹
  folders: [],
  selectedFolder: null,  // 当前浏览的文件夹路径
  selectedFolderItem: null,  // 选中的文件夹对象（用于显示详情、操作等）
  
  // 搜索和过滤
  searchKeywords: '',
  filters: {
    formats: [],
    sizes: [],           // 文件大小范围筛选
    orientations: [],    // 图片方向筛选（多选）: ['horizontal', 'vertical', 'square']
    ratings: [],         // 评分筛选（多选）: [0, 1, 2, 3, 4, 5]
  },
  
  // 原始图片列表（用于生成筛选选项，不受筛选影响）
  originalImages: [],
  
  // 加载状态
  imageLoadingState: {
    isLoading: false,
    loadedCount: 0,
    totalCount: 0,
    hasMore: false,
  },
  
  // 重命名状态
  renamingImage: null, // 正在重命名的图片
  
  // 图片操作
  setImages: (images) => set({ images }),
  
  // 设置原始图片（用于筛选选项）
  setOriginalImages: (images) => set({ originalImages: images }),
  
  // 追加图片（向下滚动时）
  appendImages: (newImages) => set((state) => ({
    images: [...state.images, ...newImages],
    originalImages: [...state.originalImages, ...newImages]
  })),
  
  clearImages: () => set({ images: [], originalImages: [] }),
  
  // 选择操作
  setSelectedImage: (image) => set({ selectedImage: image }),
  
  setSelectedImages: (images) => set({ selectedImages: images }),
  
  toggleImageSelection: (image) => set((state) => {
    const isSelected = state.selectedImages.some(img => img.path === image.path);
    return {
      selectedImages: isSelected
        ? state.selectedImages.filter(img => img.path !== image.path)
        : [...state.selectedImages, image]
    };
  }),
  
  clearSelection: () => set({ selectedImages: [], selectedImage: null, selectedFolderItem: null }),
  
  // 文件夹操作
  setFolders: (folders) => set({ folders }),
  
  setSelectedFolder: (folder) => set({ selectedFolder: folder }),
  
  setSelectedFolderItem: (folderItem) => set({ selectedFolderItem: folderItem }),
  
  // 搜索和过滤
  setSearchKeywords: (keywords) => set({ searchKeywords: keywords }),
  
  setFilters: (filters) => set((state) => ({ 
    filters: { ...state.filters, ...filters } 
  })),
  
  resetFilters: () => set({
    searchKeywords: '',
    filters: {
      formats: [],
      sizes: [],
      orientations: [],
      ratings: []
    }
  }),
  
  // 统计
  setTotalImageCount: (count) => set({ totalImageCount: count }),
  setTotalSize: (size) => set({ totalSize: size }),
  
  // 加载状态
  setImageLoadingState: (state) => set((prev) => ({
    imageLoadingState: { ...prev.imageLoadingState, ...state }
  })),
  
  // 重命名操作
  setRenamingImage: (image) => set({ renamingImage: image }),
  
  // 更新图片信息（重命名、评分等）
  updateImage: (oldPath, newData) => set((state) => ({
    images: state.images.map(img => 
      img.path === oldPath ? { ...img, ...newData } : img
    ),
    originalImages: state.originalImages.map(img =>
      img.path === oldPath ? { ...img, ...newData } : img
    ),
    selectedImage: state.selectedImage?.path === oldPath 
      ? { ...state.selectedImage, ...newData } 
      : state.selectedImage
  }))
}));
