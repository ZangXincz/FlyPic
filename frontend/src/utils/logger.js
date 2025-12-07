/**
 * 统一日志管理工具
 * 生产环境自动禁用调试日志
 */

const isDev = import.meta.env.DEV;
const isDebugEnabled = isDev || import.meta.env.VITE_ENABLE_DEBUG === 'true';

/**
 * 日志工具类
 */
class Logger {
  constructor(namespace = '') {
    this.namespace = namespace;
  }

  /**
   * 格式化日志前缀
   */
  _getPrefix() {
    return this.namespace ? `[${this.namespace}]` : '';
  }

  /**
   * 调试日志（仅开发环境）
   */
  debug(...args) {
    if (isDebugEnabled) {
      console.log(this._getPrefix(), ...args);
    }
  }

  /**
   * 信息日志（仅开发环境）
   */
  info(...args) {
    if (isDebugEnabled) {
      console.info(this._getPrefix(), ...args);
    }
  }

  /**
   * 警告日志（所有环境）
   */
  warn(...args) {
    console.warn(this._getPrefix(), ...args);
  }

  /**
   * 错误日志（所有环境）
   */
  error(...args) {
    console.error(this._getPrefix(), ...args);
  }

  /**
   * 表格日志（仅开发环境）
   */
  table(data) {
    if (isDebugEnabled) {
      console.table(data);
    }
  }

  /**
   * 分组日志（仅开发环境）
   */
  group(label, collapsed = false) {
    if (isDebugEnabled) {
      if (collapsed) {
        console.groupCollapsed(this._getPrefix(), label);
      } else {
        console.group(this._getPrefix(), label);
      }
    }
  }

  groupEnd() {
    if (isDebugEnabled) {
      console.groupEnd();
    }
  }

  /**
   * 性能计时开始
   */
  time(label) {
    if (isDebugEnabled) {
      console.time(this._getPrefix() + ' ' + label);
    }
  }

  /**
   * 性能计时结束
   */
  timeEnd(label) {
    if (isDebugEnabled) {
      console.timeEnd(this._getPrefix() + ' ' + label);
    }
  }
}

/**
 * 创建带命名空间的日志器
 * @param {string} namespace - 日志命名空间
 * @returns {Logger} 日志器实例
 */
export function createLogger(namespace) {
  return new Logger(namespace);
}

/**
 * 默认日志器（无命名空间）
 */
export const logger = new Logger();

/**
 * 快捷方法（无命名空间）
 */
export const log = (...args) => logger.debug(...args);
export const info = (...args) => logger.info(...args);
export const warn = (...args) => logger.warn(...args);
export const error = (...args) => logger.error(...args);

export default logger;
