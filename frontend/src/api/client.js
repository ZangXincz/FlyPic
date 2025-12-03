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
 * 发送请求
 */
async function request(url, options = {}) {
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  try {
    const response = await fetch(`${API_BASE}${url}`, config);
    const data = await response.json();

    if (!response.ok) {
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
 * DELETE 请求
 */
function del(url, options = {}) {
  return request(url, { method: 'DELETE', ...options });
}

export const api = {
  get,
  post,
  put,
  delete: del
};

export { APIError };
