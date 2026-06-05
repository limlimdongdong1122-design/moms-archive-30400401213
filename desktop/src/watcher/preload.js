/* Watcher preload — tiny bridge between the hidden OCR renderer and main. */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ivwatch', {
  onStart: (fn) => ipcRenderer.on('iv-watch-start', (_e, data) => fn(data)),
  detect: (payload) => ipcRenderer.send('iv-screen-detect', payload),
  status: (payload) => ipcRenderer.send('iv-screen-status', payload),
});
