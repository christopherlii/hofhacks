const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('enk', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  openSettings: () => ipcRenderer.send('open-settings'),
  updateStatus: (status) => ipcRenderer.send('update-status', status),
  showAlert: (data) => ipcRenderer.send('show-alert', data),
  dismissAlert: () => ipcRenderer.send('dismiss-alert'),
  onStatusUpdate: (callback) => ipcRenderer.on('status-update', (_, status) => callback(status)),
  onShowAlert: (callback) => ipcRenderer.on('show-alert', (_, data) => callback(data)),
  onHideAlert: (callback) => ipcRenderer.on('hide-alert', () => callback())
});
