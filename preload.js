const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  appVersion: '3.30.0',
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  saveFile: (payload) => ipcRenderer.invoke('save-file', payload),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateMessage: (callback) => {
    // Strip event from listener and pass arguments
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on('update-message', subscription);
    return () => ipcRenderer.removeListener('update-message', subscription);
  }
});
