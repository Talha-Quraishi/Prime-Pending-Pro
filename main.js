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

ipcMain.handle('save-to-history', async (event, { filename, fileData, metadata }) => {
  try {
    const id = Date.now().toString();
    const filePath = path.join(historyDir, `${id}.xlsx`);
    
    // Save binary data
    await fs.promises.writeFile(filePath, Buffer.from(fileData));
    
    // Update index.json
    let indexData = [];
    try {
      const indexContent = await fs.promises.readFile(historyIndexPath, 'utf8');
      indexData = JSON.parse(indexContent);
    } catch (e) {
      indexData = [];
    }
    
    const record = {
      id,
      filename,
      date: new Date().toISOString(),
      sizeBytes: fileData.byteLength || fileData.length,
      ...metadata
    };
    
    indexData.unshift(record); // Prepend to show newest first
    await fs.promises.writeFile(historyIndexPath, JSON.stringify(indexData, null, 2), 'utf8');
    return { success: true, record };
  } catch (e) {
    console.error(e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('load-history-list', async () => {
  try {
    const indexContent = await fs.promises.readFile(historyIndexPath, 'utf8');
    return JSON.parse(indexContent);
  } catch (e) {
    return [];
  }
});

ipcMain.handle('load-historical-file', async (event, id) => {
  const filePath = path.join(historyDir, `${id}.xlsx`);
  try {
    return await fs.promises.readFile(filePath);
  } catch (e) {
    console.error(e);
    return null;
  }
});

ipcMain.handle('delete-from-history', async (event, id) => {
  try {
    const filePath = path.join(historyDir, `${id}.xlsx`);
    try {
      await fs.promises.unlink(filePath);
    } catch (e) {
      // Ignore if file doesn't exist
    }
    
    try {
      const indexContent = await fs.promises.readFile(historyIndexPath, 'utf8');
      let indexData = JSON.parse(indexContent);
      indexData = indexData.filter(item => item.id !== id);
      await fs.promises.writeFile(historyIndexPath, JSON.stringify(indexData, null, 2), 'utf8');
    } catch (e) {
      // Ignore index read/write issues
    }
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
});

ipcMain.handle('load-config', async () => {
  try {
    const content = await fs.promises.readFile(configPath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return {};
  }
});

ipcMain.handle('save-config', async (event, config) => {
  try {
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls', 'csv'] }]
  });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  const fileContent = fs.readFileSync(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    size: fileContent.length,
    data: fileContent
  };
});

ipcMain.handle('save-file', async (event, { defaultName, data, filters }) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: filters || [{ name: 'Excel Files', extensions: ['xlsx'] }]
  });
  if (result.canceled) return null;
  try {
    fs.writeFileSync(result.filePath, Buffer.from(data));
    return result.filePath;
  } catch (e) {
    console.error(e);
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
