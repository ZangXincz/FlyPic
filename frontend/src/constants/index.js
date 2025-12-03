/**
 * 前端常量配置
 */

// 支持的图片格式
export const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff'];

// 缩略图尺寸
export const THUMBNAIL_SIZES = {
  SMALL: 200,
  MEDIUM: 480,
  LARGE: 800
};

// 分页配置
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 100,
  WINDOW_SIZE: 200
};

// UI 配置
export const UI = {
  MOBILE_BREAKPOINT: 768,
  SIDEBAR_MIN_WIDTH: 200,
  SIDEBAR_MAX_WIDTH: 400,
  SIDEBAR_DEFAULT_WIDTH: 256,
  PANEL_MIN_WIDTH: 280,
  PANEL_MAX_WIDTH: 500,
  PANEL_DEFAULT_WIDTH: 320
};

// 防抖延迟
export const DEBOUNCE = {
  SEARCH: 300,
  RESIZE: 150,
  FOLDER_SWITCH: 50
};

// 缩略图高度范围
export const THUMBNAIL_HEIGHT = {
  MIN: 150,
  MAX: 300,
  DEFAULT: 200
};
