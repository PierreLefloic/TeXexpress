'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  info: () => ipcRenderer.invoke('app:info'),
  getStore: () => ipcRenderer.invoke('store:get'),
  setStore: (patch) => ipcRenderer.invoke('store:set', patch),
  setOnTop: (on) => ipcRenderer.invoke('win:onTop', on),
  setTheme: (t) => ipcRenderer.invoke('win:theme', t),
  onSystemTheme: (cb) => ipcRenderer.on('theme:system', (_e, dark) => cb(dark)),
  copySvg: (payload) => ipcRenderer.invoke('copy:svg', payload),
  copyPdf: (payload) => ipcRenderer.invoke('copy:pdf', payload),
  copyPng: (payload) => ipcRenderer.invoke('copy:png', payload),
  save: (payload) => ipcRenderer.invoke('save', payload),
  startDrag: (payload) => ipcRenderer.send('drag:start', payload),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  readLicense: (name) => ipcRenderer.invoke('license:read', name),
});
