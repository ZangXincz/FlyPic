const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Get config directory based on environment
 */
function getConfigDir() {
  // Check if running on fnOS
  if (process.env.TRIM_PKGVAR) {
    return process.env.TRIM_PKGVAR;
  }
  
  // Windows
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'FlyPic');
  }
  
  // Linux/Mac
  return path.join(os.homedir(), '.flypic');
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
function loadConfig() {
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
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
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
  addLibrary,
  removeLibrary,
  updateLibrary,
  getLibrary,
  setCurrentLibrary,
  updatePreferences,
  updateTheme
};
