/**
 * 扫描状态管理
 */

import { create } from 'zustand';

export const useScanStore = create((set, get) => ({
  // 扫描进度
  scanProgress: null,
  scanStartTime: null,
  
  // 设置扫描进度
  setScanProgress: (progress) => set((state) => {
    // 第一次收到进度时记录开始时间
    if (progress && !state.scanStartTime && progress.current > 0) {
      return { scanProgress: progress, scanStartTime: Date.now() };
    }
    
    // 扫描结束时清空开始时间
    if (!progress) {
      return { scanProgress: null, scanStartTime: null };
    }
    
    return { scanProgress: progress };
  }),
  
  // 清除扫描进度
  clearScanProgress: () => set({ scanProgress: null, scanStartTime: null }),
  
  // 获取预估剩余时间
  getEstimatedTimeLeft: () => {
    const { scanProgress, scanStartTime } = get();
    
    if (!scanProgress || !scanStartTime || scanProgress.current === 0) {
      return null;
    }
    
    const elapsed = Date.now() - scanStartTime;
    const rate = scanProgress.current / elapsed; // 图片/毫秒
    const remaining = scanProgress.total - scanProgress.current;
    const estimatedMs = remaining / rate;
    
    return Math.ceil(estimatedMs / 1000); // 返回秒数
  }
}));
