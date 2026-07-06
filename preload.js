const { contextBridge, ipcRenderer } = require('electron');

// Read version from main process (passed via additionalArguments in webPreferences)
const versionArg = process.argv.find(a => a.startsWith('--app-version='));
const appVersion = versionArg ? versionArg.split('=')[1] : 'unknown';

contextBridge.exposeInMainWorld('electronAPI', {
  appVersion: appVersion,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  saveFile: (payload) => ipcRenderer.invoke('save-file', payload),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  saveToHistory: (payload) => ipcRenderer.invoke('save-to-history', payload),
  loadHistoryList: () => ipcRenderer.invoke('load-history-list'),
  loadHistoricalFile: (id) => ipcRenderer.invoke('load-historical-file', id),
  deleteFromHistory: (id) => ipcRenderer.invoke('delete-from-history', id),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateMessage: (callback) => {
    // Strip event from listener and pass arguments
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on('update-message', subscription);
    return () => ipcRenderer.removeListener('update-message', subscription);
  }
});
