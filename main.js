const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Prevent multiple instances from clobbering config.json / history index concurrently
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const MAX_OPEN_FILE_BYTES = 250 * 1024 * 1024; // 250 MB sanity cap for selected files

const configPath = path.join(app.getPath('userData'), 'config.json');
const historyDir = path.join(app.getPath('userData'), 'history');
const historyIndexPath = path.join(historyDir, 'index.json');

// Ensure history directory exists
if (!fs.existsSync(historyDir)) {
  fs.mkdirSync(historyDir, { recursive: true });
}

/**
 * Writes a file atomically via temporary file + rename so crashes never leave corrupt JSON.
 */
async function atomicWriteFile(filePath, data) {
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmpPath, data);
  try {
    await fs.promises.rename(tmpPath, filePath);
  } catch (e) {
    await fs.promises.unlink(tmpPath).catch(() => {});
    throw e;
  }
}

// --- Remembered "open file" directory ---
const REMEMBERED_DIR_KEY = 'lastOpenDirectory';
let cachedOpenDir = null;

function getExistingRememberedDir(dirValue) {
  if (typeof dirValue !== 'string' || !dirValue) return null;
  try {
    return fs.statSync(dirValue).isDirectory() ? dirValue : null;
  } catch (e) {
    return null;
  }
}

function loadRememberedDirFromConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      ? getExistingRememberedDir(parsed[REMEMBERED_DIR_KEY])
      : null;
  } catch (e) {
    return null; // Missing or corrupt config - fall back to OS default
  }
}

async function persistRememberedDir(dir) {
  try {
    let config = {};
    try {
      config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
      if (!config || typeof config !== 'object' || Array.isArray(config)) config = {};
    } catch (e) {
      config = {}; // Start fresh rather than failing the save
    }
    config[REMEMBERED_DIR_KEY] = dir;
    await atomicWriteFile(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.warn("Failed to persist last open directory:", e);
  }
}

function isValidHistoryId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id) && id.length > 0 && id.length <= 64;
}

function getSafeHistoryPath(id) {
  if (!isValidHistoryId(id)) return null;
  const resolved = path.resolve(historyDir, `${id}.xlsx`);
  const resolvedDir = path.resolve(historyDir);
  if (!resolved.startsWith(resolvedDir + path.sep)) {
    return null;
  }
  return resolved;
}

async function safeReadHistoryIndex() {
  try {
    const indexContent = await fs.promises.readFile(historyIndexPath, 'utf8');
    const parsed = JSON.parse(indexContent);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // If index is corrupt or missing, attempt recovery from .xlsx files in history directory
    try {
      const files = await fs.promises.readdir(historyDir);
      const recovered = [];
      for (const file of files) {
        if (file.endsWith('.xlsx') && !file.startsWith('.')) {
          const id = path.basename(file, '.xlsx');
          if (isValidHistoryId(id)) {
            const stat = await fs.promises.stat(path.join(historyDir, file)).catch(() => null);
            recovered.push({
              id,
              filename: `Recovered_${file}`,
              date: stat ? stat.mtime.toISOString() : new Date().toISOString(),
              sizeBytes: stat ? stat.size : 0,
              totalRows: 0,
              uniqueParties: 0,
              totalValue: 0,
              totalQty: 0
            });
          }
        }
      }
      recovered.sort((a, b) => new Date(b.date) - new Date(a.date));
      await atomicWriteFile(historyIndexPath, JSON.stringify(recovered, null, 2)).catch(() => {});
      return recovered;
    } catch (err) {
      return [];
    }
  }
}

ipcMain.handle('save-to-history', async (event, payload) => {
  try {
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Invalid payload' };
    }
    const { filename, fileData, metadata } = payload;
    if (!fileData || (!Buffer.isBuffer(fileData) && !(fileData instanceof Uint8Array) && !Array.isArray(fileData) && typeof fileData.length !== 'number')) {
      return { success: false, error: 'Invalid file data' };
    }

    const sanitizedFilename = typeof filename === 'string' ? path.basename(filename).substring(0, 255) : 'file.xlsx';
    // Random suffix prevents ID collisions when multiple saves happen in the same millisecond
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filePath = getSafeHistoryPath(id);
    if (!filePath) {
      return { success: false, error: 'Failed to generate valid history path' };
    }

    // Save binary data
    const buffer = Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData);
    await fs.promises.writeFile(filePath, buffer);

    // Update index.json
    let indexData = await safeReadHistoryIndex();
    const safeMeta = (metadata && typeof metadata === 'object') ? metadata : {};

    const record = {
      id,
      filename: sanitizedFilename,
      date: new Date().toISOString(),
      sizeBytes: buffer.length,
      totalRows: typeof safeMeta.totalRows === 'number' ? safeMeta.totalRows : 0,
      uniqueParties: typeof safeMeta.uniqueParties === 'number' ? safeMeta.uniqueParties : 0,
      totalValue: typeof safeMeta.totalValue === 'number' ? safeMeta.totalValue : 0,
      totalQty: typeof safeMeta.totalQty === 'number' ? safeMeta.totalQty : 0
    };

    indexData.unshift(record); // Prepend to show newest first

    // Optional retention limit (default max 100 entries to prevent disk overflow)
    const MAX_HISTORY_ITEMS = 100;
    if (indexData.length > MAX_HISTORY_ITEMS) {
      const itemsToRemove = indexData.slice(MAX_HISTORY_ITEMS);
      indexData = indexData.slice(0, MAX_HISTORY_ITEMS);
      for (const item of itemsToRemove) {
        const removePath = getSafeHistoryPath(item.id);
        if (removePath) {
          await fs.promises.unlink(removePath).catch(() => {});
        }
      }
    }

    await atomicWriteFile(historyIndexPath, JSON.stringify(indexData, null, 2));
    return { success: true, record };
  } catch (e) {
    console.error("save-to-history error:", e);
    return { success: false, error: 'Error saving to history' };
  }
});

ipcMain.handle('load-history-list', async () => {
  try {
    const list = await safeReadHistoryIndex();
    // Filter to only records where the file actually exists
    const validList = [];
    for (const item of list) {
      if (item && isValidHistoryId(item.id)) {
        const filePath = getSafeHistoryPath(item.id);
        if (filePath && fs.existsSync(filePath)) {
          validList.push(item);
        }
      }
    }
    return validList;
  } catch (e) {
    console.error("load-history-list error:", e);
    return [];
  }
});

ipcMain.handle('load-historical-file', async (event, id) => {
  try {
    const filePath = getSafeHistoryPath(id);
    if (!filePath) {
      console.warn("load-historical-file: Rejected invalid or unsafe id:", id);
      return null;
    }
    return await fs.promises.readFile(filePath);
  } catch (e) {
    console.error("load-historical-file error:", e);
    return null;
  }
});

ipcMain.handle('delete-from-history', async (event, id) => {
  try {
    const filePath = getSafeHistoryPath(id);
    if (!filePath) {
      console.warn("delete-from-history: Rejected invalid or unsafe id:", id);
      return false;
    }

    try {
      await fs.promises.unlink(filePath);
    } catch (e) {
      // Ignore if file doesn't exist
    }

    try {
      let indexData = await safeReadHistoryIndex();
      indexData = indexData.filter(item => item.id !== id);
      await atomicWriteFile(historyIndexPath, JSON.stringify(indexData, null, 2));
    } catch (e) {
      // Ignore index read/write issues
    }
    return true;
  } catch (e) {
    console.error("delete-from-history error:", e);
    return false;
  }
});

ipcMain.handle('load-config', async () => {
  try {
    const content = await fs.promises.readFile(configPath, 'utf8');
    const parsed = JSON.parse(content);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (e) {
    return {};
  }
});

ipcMain.handle('save-config', async (event, config) => {
  try {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return false;
    }
    await atomicWriteFile(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (e) {
    console.error("save-config error:", e);
    return false;
  }
});

ipcMain.handle('select-file', async () => {
  try {
    // Remember the last used folder (session cache, then config.json for restarts)
    if (!cachedOpenDir) {
      cachedOpenDir = loadRememberedDirFromConfig();
    }

    const dialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls', 'csv'] }]
    };
    if (cachedOpenDir) {
      dialogOptions.defaultPath = cachedOpenDir;
    }

    const result = await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];

    // Store the picked file's folder as the new starting point next time
    cachedOpenDir = path.dirname(filePath);
    persistRememberedDir(cachedOpenDir);

    const stat = await fs.promises.stat(filePath);
    if (stat.size > MAX_OPEN_FILE_BYTES) {
      dialog.showErrorBox(
        'File too large',
        `The selected file is ${(stat.size / (1024 * 1024)).toFixed(1)} MB. Maximum supported size is ${MAX_OPEN_FILE_BYTES / (1024 * 1024)} MB.`
      );
      return null;
    }

    const fileContent = await fs.promises.readFile(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      size: fileContent.length,
      data: fileContent
    };
  } catch (e) {
    console.error("select-file error:", e);
    return null;
  }
});

ipcMain.handle('save-file', async (event, payload) => {
  try {
    if (!payload || typeof payload !== 'object') return null;
    const { defaultName, data, filters } = payload;
    if (!data) return null;

    const safeDefaultName = typeof defaultName === 'string' ? path.basename(defaultName) : 'pending_orders.xlsx';
    const result = await dialog.showSaveDialog({
      defaultPath: safeDefaultName,
      filters: Array.isArray(filters) ? filters : [{ name: 'Excel Files', extensions: ['xlsx'] }]
    });
    if (result.canceled || !result.filePath) return null;
    
    // Write atomically using temporary file to avoid incomplete files on failure
    const targetPath = result.filePath;
    const tmpPath = `${targetPath}.${Date.now()}.tmp`;
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, targetPath);
    return targetPath;
  } catch (e) {
    console.error("save-file error:", e);
    return null;
  }
});


let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false, // Prevents flash of unstyled content
    frame: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: ['--app-version=' + app.getVersion()]
    }
  });

  // Lock down navigation and popups (defense-in-depth against content injection)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.on('closed', () => { mainWindow = null; });

  // Remove default browser menu
  Menu.setApplicationMenu(null);

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });
}

// IPC Event Handlers for Custom Window Controls (registered once, not per-window)
ipcMain.on('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

// Focus the existing window when a second launch attempt occurs
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Auto-Updater Event Handlers and IPC bindings
autoUpdater.autoDownload = false;

// Cached paths of the downloaded installer (filled when a download completes)
let downloadedUpdateFiles = [];

function sendUpdateMessage(status, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-message', status, payload);
  }
}

autoUpdater.on('checking-for-update', () => {
  sendUpdateMessage('checking');
});

autoUpdater.on('update-available', (info) => {
  sendUpdateMessage('available', info);
});

autoUpdater.on('update-not-available', (info) => {
  sendUpdateMessage('not-available', info);
});

autoUpdater.on('error', (err) => {
  console.error("autoUpdater error:", err);
  sendUpdateMessage('error', err == null ? 'unknown' : err.message);
});

autoUpdater.on('download-progress', (progressObj) => {
  sendUpdateMessage('progress', progressObj.percent);
});

autoUpdater.on('update-downloaded', (info) => {
  // Capture the cached installer path(s) for "Open file location" / "Delete file" actions
  const helperFile = autoUpdater.downloadedUpdateHelper && autoUpdater.downloadedUpdateHelper.file;
  downloadedUpdateFiles = Array.isArray(helperFile) ? helperFile.filter(Boolean) : [helperFile].filter(Boolean);
  sendUpdateMessage('downloaded', {
    version: info && info.version,
    releaseNotes: info && info.releaseNotes,
    filePaths: downloadedUpdateFiles
  });
});

ipcMain.on('check-for-updates', () => {
  // electron-updater cannot check without an installed app context
  if (!app.isPackaged) {
    sendUpdateMessage('dev');
    return;
  }
  autoUpdater.checkForUpdates().catch((e) => {
    console.error("checkForUpdates failed:", e);
  });
});

ipcMain.on('download-update', () => {
  if (!app.isPackaged) return;
  autoUpdater.downloadUpdate().then((files) => {
    if (Array.isArray(files)) {
      downloadedUpdateFiles = files.filter(Boolean);
    }
  }).catch((e) => {
    console.error("downloadUpdate failed:", e);
  });
});

ipcMain.on('install-update', () => {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall();
});

ipcMain.handle('open-downloaded-update-location', () => {
  try {
    const file = downloadedUpdateFiles.find(f => {
      try { return f && fs.existsSync(f); } catch (e) { return false; }
    });
    if (!file) return false;
    shell.showItemInFolder(file);
    return true;
  } catch (e) {
    console.error("open-downloaded-update-location error:", e);
    return false;
  }
});

ipcMain.handle('delete-downloaded-update', async () => {
  let deletedAny = false;
  const targets = new Set();

  // The installer plus its sibling .blockmap integrity file
  for (const f of downloadedUpdateFiles) {
    if (!f) continue;
    targets.add(f);
    if (f.toLowerCase().endsWith('.exe')) {
      targets.add(f.slice(0, -4) + '.blockmap');
    }
  }

  for (const target of targets) {
    try {
      await fs.promises.unlink(target);
      deletedAny = true;
    } catch (e) {
      // Missing file is fine - still count as cleaned up
      deletedAny = true;
    }
  }

  downloadedUpdateFiles = [];
  // Reset internal helper so a later re-check downloads fresh instead of trusting a deleted cache
  try { autoUpdater.downloadedUpdateHelper = null; } catch (e) { /* ignore */ }

  sendUpdateMessage('deleted');
  return deletedAny;
});
