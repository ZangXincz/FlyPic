/**
 * 认证包装器
 * 检查认证状态，未认证时显示登录页面
 */

import { useEffect } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { authAPI } from '../api/auth';
import { getToken } from '../api/client';
import Login from './Login';

export default function AuthWrapper({ children }) {
  const { hasPassword, isAuthenticated, isChecking, setAuthStatus, logout } = useAuthStore();

  useEffect(() => {
    // 检查认证状态
    checkAuth();

    // 监听 401 未授权事件
    const handleUnauthorized = () => {
      logout();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const checkAuth = async () => {
    try {
      const status = await authAPI.getAuthStatus();
      const token = getToken();
      
      console.log('🔐 认证状态检查:', { hasPassword: status.hasPassword, hasToken: !!token });
      
      // 已设置密码但没有 token，需要登录
      // 未设置密码或有有效 token，允许访问
      setAuthStatus(status.hasPassword, status.hasPassword ? !!token : true);
    } catch (error) {
      console.error('❌ 检查认证状态失败:', error);
      
      // 网络错误或服务器错误，假设未设置密码（允许访问）
      // 避免因网络问题锁住用户
      if (error.status === 401) {
        // 明确的 401 错误，说明需要认证
        setAuthStatus(true, false);
      } else {
        // 其他错误（网络问题等），假设未设置密码
        console.warn('⚠️ 无法验证认证状态，假设未设置密码');
        setAuthStatus(false, true);
      }
    }
  };

  // 检查中，显示加载状态
  if (isChecking) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-lg font-medium text-gray-700 dark:text-gray-300">
            正在检查认证状态...
          </div>
        </div>
      </div>
    );
  }

  // 未设置密码，强制设置（首次使用）
  if (!hasPassword) {
    return <Login />;
  }

  // 已设置密码但未认证，显示登录页面
  if (hasPassword && !isAuthenticated) {
    return <Login />;
  }

  // 已认证，显示应用
  return children;
}
