const fs = require('fs');
const path = require('path');
const os = require('os');

// 配置缓存
let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 5000; // 5秒缓存

/**
 * Get config directory based on environment
 */
function getConfigDir() {
  // Check if running on fnOS
  if (process.env.TRIM_PKGVAR) {
    console.log('📁 配置目录 (fnOS): ' + process.env.TRIM_PKGVAR);
    return process.env.TRIM_PKGVAR;
  }
  
  // Windows
  if (process.platform === 'win32') {
    const dir = path.join(process.env.APPDATA || os.homedir(), 'FlyPic');
    console.log('📁 配置目录 (Windows): ' + dir);
    return dir;
  }
  
  // Linux/Mac
  const dir = path.join(os.homedir(), '.flypic');
  console.log('📁 配置目录 (Linux/Mac): ' + dir);
  return dir;
}

/**
 * Get config file path
 */
function getConfigPath() {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return path.join(configDir, 'config.json');
}

/**
 * Load configuration
 */
function loadConfig(forceReload = false) {
  // 检查缓存是否有效
  const now = Date.now();
  if (!forceReload && configCache && (now - configCacheTime) < CONFIG_CACHE_TTL) {
    return configCache;
  }
  
  const configPath = getConfigPath();
  
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {
      libraries: [],
      theme: 'light',
      currentLibraryId: null,
      // UI preferences
      preferences: {
        thumbnailHeight: 200,
        rowGap: 32,
        columnGap: 16,
        leftPanelWidth: 256,  // 左侧边栏宽度
        rightPanelWidth: 320  // 右侧边栏宽度
      }
    };
    saveConfig(defaultConfig);
    return defaultConfig;
  }
  
  try {
    const data = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(data);
    
    // Ensure preferences exist (for backward compatibility)
    if (!config.preferences) {
      config.preferences = {
        thumbnailHeight: 200,
        rowGap: 32,
        columnGap: 16
      };
    }
    
    // 更新缓存
    configCache = config;
    configCacheTime = now;
    
    return config;
  } catch (error) {
    console.error('Error loading config:', error);
    return {
      libraries: [],
      theme: 'light',
      currentLibraryId: null,
      preferences: {
        thumbnailHeight: 200,
        rowGap: 32,
        columnGap: 16
      }
    };
  }
}

/**
 * Save configuration
 */
function saveConfig(config) {
  const configPath = getConfigPath();
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    // 同步更新缓存
    configCache = config;
    configCacheTime = Date.now();
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
}

/**
 * 清除配置缓存（用于强制重新加载）
 */
function clearConfigCache() {
  configCache = null;
  configCacheTime = 0;
}

/**
 * Add library to config
 */
function addLibrary(name, libraryPath) {
  const config = loadConfig();
  const id = Date.now().toString();
  
  config.libraries.push({
    id,
    name,
    path: libraryPath,
    lastScan: null,
    createdAt: Date.now()
  });
  
  if (!config.currentLibraryId) {
    config.currentLibraryId = id;
  }
  
  saveConfig(config);
  return id;
}

/**
 * Remove library from config
 */
function removeLibrary(libraryId) {
  const config = loadConfig();
  config.libraries = config.libraries.filter(lib => lib.id !== libraryId);
  
  if (config.currentLibraryId === libraryId) {
    config.currentLibraryId = config.libraries.length > 0 ? config.libraries[0].id : null;
  }
  
  saveConfig(config);
  return true;
}

/**
 * Update library
 */
function updateLibrary(libraryId, updates) {
  const config = loadConfig();
  const library = config.libraries.find(lib => lib.id === libraryId);
  
  if (library) {
    Object.assign(library, updates);
    saveConfig(config);
    return true;
  }
  
  return false;
}

/**
 * Get library by ID
 */
function getLibrary(libraryId) {
  const config = loadConfig();
  return config.libraries.find(lib => lib.id === libraryId);
}

/**
 * Set current library
 */
function setCurrentLibrary(libraryId) {
  const config = loadConfig();
  config.currentLibraryId = libraryId;
  saveConfig(config);
  return true;
}

/**
 * Update preferences
 */
function updatePreferences(preferences) {
  const config = loadConfig();
  config.preferences = { ...config.preferences, ...preferences };
  saveConfig(config);
  return config.preferences;
}

/**
 * Update theme
 */
function updateTheme(theme) {
  const config = loadConfig();
  config.theme = theme;
  saveConfig(config);
  return true;
}

module.exports = {
  getConfigDir,
  getConfigPath,
  loadConfig,
  saveConfig,
  clearConfigCache,
  addLibrary,
  removeLibrary,
  updateLibrary,
  getLibrary,
  setCurrentLibrary,
  updatePreferences,
  updateTheme
};
