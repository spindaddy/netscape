/* -*- Mode: JavaScript; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * The contents of this file are subject to the Netscape Public License
 * Version 1.0 (the "License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * http://www.mozilla.org/NPL/
 *
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See the
 * License for the specific language governing rights and limitations
 * under the License.
 *
 * The Original Code is Mozilla Communicator client code, released March
 * 31, 1998.
 *
 * The Initial Developer of the Original Code is Netscape Communications
 * Corporation. Portions created by Netscape are Copyright (C) 1998
 * Netscape Communications Corporation. All Rights Reserved.
 *
 * Contributor(s): Electron shell.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('netscape', {
  state: ipcRenderer.sendSync('chrome-state'),
  onCommand: (callback) => {
    ipcRenderer.on('chrome-command', (_event, command) => callback(command));
  },
  onPageEvent: (callback) => {
    ipcRenderer.on('page-event', (_event, payload) => callback(payload));
  },
  onViewSource: (callback) => {
    ipcRenderer.on('view-source-text', (_event, payload) => callback(payload));
  },
  setPageBounds: (bounds) => ipcRenderer.send('page-bounds', bounds),
  loadURL: (url) => ipcRenderer.invoke('page-load', url),
  pageCommand: (command) => ipcRenderer.invoke('page-command', command),
  openWindow: (url) => ipcRenderer.invoke('open-window', url),
  viewSource: (html, url) => ipcRenderer.invoke('view-source', { html, url })
});
