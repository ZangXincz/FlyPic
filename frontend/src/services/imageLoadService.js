/**
 * ImageLoadService - 图片加载工具函数集合
 * 提供空闲加载控制，状态由 Store 统一管理
 */
import requestManager, { RequestType } from './requestManager';

// 空闲加载定时器
let idleTimer = null;
// 空闲加载是否暂停
let idlePaused = false;

/**
 * 用户操作开始时调用，暂停空闲加载并取消所有进行中的请求
 */
export function onUserActionStart() {
  pauseIdleLoading();
  requestManager.cancelAll(RequestType.IMAGES);
}

/**
 * 用户操作结束时调用，恢复空闲加载
 * @param {boolean} hasMore - 是否还有更多数据
 */
export function onUserActionEnd(hasMore) {
  if (hasMore) {
    setTimeout(() => {
      resumeIdleLoading();
    }, 300);
  }
}

/**
 * 暂停空闲加载
 */
export function pauseIdleLoading() {
  idlePaused = true;
  cancelIdleLoading();
}

/**
 * 恢复空闲加载
 */
export function resumeIdleLoading() {
  idlePaused = false;
}

/**
 * 取消空闲加载定时器
 */
export function cancelIdleLoading() {
  if (idleTimer) {
    if (typeof cancelIdleCallback !== 'undefined') {
      cancelIdleCallback(idleTimer);
    } else {
      clearTimeout(idleTimer);
    }
    idleTimer = null;
  }
}

/**
 * 检查空闲加载是否暂停
 */
export function isIdlePaused() {
  return idlePaused;
}

// 默认导出兼容旧代码
export default {
  onUserActionStart,
  onUserActionEnd,
  pauseIdleLoading,
  resumeIdleLoading,
  cancelIdleLoading,
  isIdlePaused
};
