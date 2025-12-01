/**
 * RequestManager - 统一管理异步请求的生命周期
 * 支持请求取消、去重、竞态条件处理
 */

// 请求类型
export const RequestType = {
  LIBRARY: 'library',
  FOLDER: 'folder',
  IMAGES: 'images'
};

// 生成唯一 ID
let requestIdCounter = 0;
const generateRequestId = () => {
  requestIdCounter += 1;
  return `req_${Date.now()}_${requestIdCounter}`;
};

class RequestManager {
  constructor() {
    // 按类型存储活跃的请求
    this.activeRequests = new Map();
    // 存储所有请求上下文
    this.requestContexts = new Map();
  }

  /**
   * 创建一个新的请求上下文
   * @param {string} type - 请求类型 (library/folder/images)
   * @returns {RequestContext}
   */
  createRequest(type) {
    const id = generateRequestId();
    const abortController = new AbortController();
    
    const context = {
      id,
      type,
      createdAt: Date.now(),
      abortController,
      signal: abortController.signal,
      status: 'pending',
      isActive: true,
      cancel: () => {
        if (context.isActive) {
          context.isActive = false;
          context.status = 'cancelled';
          abortController.abort();
          this.requestContexts.delete(id);
          
          // 从活跃请求中移除
          const typeRequests = this.activeRequests.get(type);
          if (typeRequests) {
            typeRequests.delete(id);
          }
        }
      }
    };

    // 存储请求上下文
    this.requestContexts.set(id, context);
    
    // 添加到活跃请求
    if (!this.activeRequests.has(type)) {
      this.activeRequests.set(type, new Map());
    }
    this.activeRequests.get(type).set(id, context);

    return context;
  }

  /**
   * 取消指定类型的所有请求
   * @param {string} type - 请求类型
   */
  cancelAll(type) {
    const typeRequests = this.activeRequests.get(type);
    if (typeRequests) {
      for (const context of typeRequests.values()) {
        context.cancel();
      }
      typeRequests.clear();
    }
  }

  /**
   * 取消所有请求
   */
  cancelAllRequests() {
    for (const type of Object.values(RequestType)) {
      this.cancelAll(type);
    }
  }

  /**
   * 检查请求是否仍然有效（未被取消）
   * @param {string} requestId - 请求 ID
   * @returns {boolean}
   */
  isValid(requestId) {
    const context = this.requestContexts.get(requestId);
    return context ? context.isActive : false;
  }

  /**
   * 标记请求完成
   * @param {string} requestId - 请求 ID
   */
  complete(requestId) {
    const context = this.requestContexts.get(requestId);
    if (context && context.isActive) {
      context.status = 'completed';
      context.isActive = false;
      this.requestContexts.delete(requestId);
      
      const typeRequests = this.activeRequests.get(context.type);
      if (typeRequests) {
        typeRequests.delete(requestId);
      }
    }
  }

  /**
   * 标记请求错误
   * @param {string} requestId - 请求 ID
   */
  error(requestId) {
    const context = this.requestContexts.get(requestId);
    if (context && context.isActive) {
      context.status = 'error';
      context.isActive = false;
      this.requestContexts.delete(requestId);
      
      const typeRequests = this.activeRequests.get(context.type);
      if (typeRequests) {
        typeRequests.delete(requestId);
      }
    }
  }

  /**
   * 获取指定类型的活跃请求数量
   * @param {string} type - 请求类型
   * @returns {number}
   */
  getActiveCount(type) {
    const typeRequests = this.activeRequests.get(type);
    return typeRequests ? typeRequests.size : 0;
  }

  /**
   * 检查是否有指定类型的活跃请求
   * @param {string} type - 请求类型
   * @returns {boolean}
   */
  hasActiveRequests(type) {
    return this.getActiveCount(type) > 0;
  }
}

// 单例实例
const requestManager = new RequestManager();

export default requestManager;
export { RequestManager };
