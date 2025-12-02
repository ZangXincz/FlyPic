/**
 * 数据库字段与前端字段映射工具
 * 统一处理 snake_case (数据库) 和 camelCase (前端) 的转换
 */

/**
 * 将 snake_case 转换为 camelCase
 */
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 将 camelCase 转换为 snake_case
 */
function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * 将数据库对象转换为前端对象（snake_case -> camelCase）
 * 支持嵌套对象和数组
 */
function dbToFrontend(data) {
  // 处理 null/undefined
  if (data == null) {
    return data;
  }

  // 处理数组
  if (Array.isArray(data)) {
    return data.map(item => dbToFrontend(item));
  }

  // 处理非对象类型
  if (typeof data !== 'object') {
    return data;
  }

  // 处理对象
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    const camelKey = snakeToCamel(key);
    
    // 递归处理嵌套对象和数组
    if (value && typeof value === 'object') {
      result[camelKey] = dbToFrontend(value);
    } else {
      result[camelKey] = value;
    }
  }

  return result;
}

/**
 * 将前端对象转换为数据库对象（camelCase -> snake_case）
 * 支持嵌套对象和数组
 */
function frontendToDb(data) {
  // 处理 null/undefined
  if (data == null) {
    return data;
  }

  // 处理数组
  if (Array.isArray(data)) {
    return data.map(item => frontendToDb(item));
  }

  // 处理非对象类型
  if (typeof data !== 'object') {
    return data;
  }

  // 处理对象
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    const snakeKey = camelToSnake(key);
    
    // 递归处理嵌套对象和数组
    if (value && typeof value === 'object') {
      result[snakeKey] = frontendToDb(value);
    } else {
      result[snakeKey] = value;
    }
  }

  return result;
}

/**
 * 转换图片对象（数据库 -> 前端）
 * 只保留前端需要的字段，减少数据传输
 */
function mapImageForFrontend(dbImage) {
  if (!dbImage) return null;

  return {
    id: dbImage.id,
    path: dbImage.path,
    filename: dbImage.filename,
    folder: dbImage.folder,
    size: dbImage.size,
    width: dbImage.width,
    height: dbImage.height,
    format: dbImage.format,
    fileType: dbImage.file_type,
    thumbnailPath: dbImage.thumbnail_path,
    createdAt: dbImage.created_at,
    modifiedAt: dbImage.modified_at
  };
}

/**
 * 转换文件夹对象（数据库 -> 前端）
 */
function mapFolderForFrontend(dbFolder) {
  if (!dbFolder) return null;

  return {
    id: dbFolder.id,
    path: dbFolder.path,
    parentPath: dbFolder.parent_path,
    name: dbFolder.name,
    imageCount: dbFolder.image_count,
    lastScan: dbFolder.last_scan,
    // 递归转换子文件夹
    children: dbFolder.children ? dbFolder.children.map(mapFolderForFrontend) : []
  };
}

module.exports = {
  snakeToCamel,
  camelToSnake,
  dbToFrontend,
  frontendToDb,
  mapImageForFrontend,
  mapFolderForFrontend
};
