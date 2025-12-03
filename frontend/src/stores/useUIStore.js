/**
 * UI 状态管理
 */

import { create } from 'zustand';

export const useUIStore = create((set) => ({
  // 主题
  theme: 'light',
  
  // 移动端视图
  mobileView: 'main', // 'sidebar' | 'main' | 'detail'
  
  // 缩略图高度
  thumbnailHeight: 200,
  
  // 面板调整状态
  isResizingPanels: false,
  resizingSide: null, // 'left' | 'right' | null
  
  // 主题操作
  setTheme: (theme) => set({ theme }),
  
  toggleTheme: () => set((state) => ({ 
    theme: state.theme === 'light' ? 'dark' : 'light' 
  })),
  
  // 移动端视图
  setMobileView: (view) => set({ mobileView: view }),
  
  // 缩略图高度
  setThumbnailHeight: (height) => set({ thumbnailHeight: height }),
  
  // 面板调整
  setIsResizingPanels: (value) => set({ isResizingPanels: value }),
  
  setResizingSide: (side) => set({ resizingSide: side })
}));
