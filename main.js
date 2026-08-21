const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const configPath = path.join(app.getPath('userData'), 'config.json');
const historyDir = path.join(app.getPath('userData'), 'history');
const historyIndexPath = path.join(historyDir, 'index.json');

// Ensure history directory exists
if (!fs.existsSync(historyDir)) {
  fs.mkdirSync(historyDir, { recursive: true });
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
      await fs.promises.writeFile(historyIndexPath, JSON.stringify(recovered, null, 2), 'utf8').catch(() => {});
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
    const id = Date.now().toString();
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

    await fs.promises.writeFile(historyIndexPath, JSON.stringify(indexData, null, 2), 'utf8');
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
      await fs.promises.writeFile(historyIndexPath, JSON.stringify(indexData, null, 2), 'utf8');
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
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error("save-config error:", e);
    return false;
  }
});

ipcMain.handle('select-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls', 'csv'] }]
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const fileContent = fs.readFileSync(filePath);
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

  // Remove default browser menu
  Menu.setApplicationMenu(null);

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // IPC Event Handlers for Custom Window Controls
  ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    mainWindow.close();
  });
}

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

autoUpdater.on('checking-for-update', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-message', 'checking');
  }
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-message', 'available', info);
  }
});

autoUpdater.on('update-not-available', (info) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-message', 'not-available');
  }
});

autoUpdater.on('error', (err) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-message', 'error', err == null ? 'unknown' : err.message);
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-message', 'progress', progressObj.percent);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-message', 'downloaded');
  }
});

ipcMain.on('check-for-updates', () => {
  autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.on('download-update', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});
