/**
 * 统一主题管理 Hook - 轻量、快速、稳定
 * 集中处理：初始化、切换、持久化
 */

import { useEffect } from 'react';
import { useUIStore } from '../stores/useUIStore';
import { libraryAPI } from '../api';

export function useTheme() {
  const theme = useUIStore(state => state.theme);
  const setTheme = useUIStore(state => state.setTheme);

  // 初始化：应用主题到 DOM
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // 切换主题（带后端持久化）
  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    
    // 异步保存，不阻塞 UI
    try {
      await libraryAPI.updateTheme(newTheme);
    } catch (error) {
      console.error('保存主题失败:', error);
    }
  };

  return { theme, toggleTheme };
}
