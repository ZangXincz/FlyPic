/**
 * HTTP 客户端
 * 使用原生 Fetch API
 */

const API_BASE = '/api';

/**
 * API 错误类
 */
class APIError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

/**
 * 获取存储的 Token
 */
function getToken() {
  return localStorage.getItem('flypic_token');
}

/**
 * 设置 Token
 */
function setToken(token) {
  if (token) {
    localStorage.setItem('flypic_token', token);
  } else {
    localStorage.removeItem('flypic_token');
  }
}

/**
 * 发送请求
 */
async function request(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  // 自动添加 Authorization header
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const config = {
    headers,
    ...options
  };

  try {
    const response = await fetch(`${API_BASE}${url}`, config);
    const data = await response.json();

    if (!response.ok) {
      // 401 未授权处理
      if (response.status === 401) {
        // 对于认证检查接口，不触发登出事件（避免循环）
        const isAuthCheck = url.includes('/auth/status');
        
        if (!isAuthCheck) {
          setToken(null);
          // 触发登录页面（由 AuthWrapper 处理）
          window.dispatchEvent(new Event('auth:unauthorized'));
        }
      }

      throw new APIError(
        data.error?.message || data.error || 'Request failed',
        response.status,
        data
      );
    }

    // 直接返回数据，不包装
    return data.data !== undefined ? data.data : data;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    
    // 网络错误或解析错误
    throw new APIError(
      error.message || 'Network error',
      0,
      null
    );
  }
}

/**
 * GET 请求
 */
function get(url, options = {}) {
  return request(url, { method: 'GET', ...options });
}

/**
 * POST 请求
 */
function post(url, body, options = {}) {
  return request(url, { 
    method: 'POST', 
    body: JSON.stringify(body),
    ...options 
  });
}

/**
 * PUT 请求
 */
function put(url, body, options = {}) {
  return request(url, { 
    method: 'PUT', 
    body: JSON.stringify(body),
    ...options 
  });
}

/**
 * PATCH 请求
 */
function patch(url, body, options = {}) {
  return request(url, { 
    method: 'PATCH', 
    body: JSON.stringify(body),
    ...options 
  });
}

/**
 * DELETE 请求
 */
function del(url, options = {}) {
  return request(url, { method: 'DELETE', ...options });
}

export const api = {
  get,
  post,
  put,
  patch,
  delete: del
};

export { APIError, getToken, setToken };
