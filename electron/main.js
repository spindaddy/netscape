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

/*
 * Desktop window for this tree.
 *
 * The Unix client is cmd/xfe: cplusplusmain.cc calls mozilla_main() and the
 * Motif front end lives in mozilla.c. That build wants gcc 2.7.2 and Motif
 * (see README/mozilla/unix-build.html), so this process does not relink
 * liblayout. It does use the client sources that can run inside the window:
 * startup prefs in modules/libpref/src/init/all.js, toolbar icons in
 * cmd/xfe/icons, and the HTML documents under l10n/ and README/.
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, net, WebContentsView } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const PREFS_FILE = path.join(ROOT, 'modules/libpref/src/init/all.js');
const CHROME_FILE = path.join(__dirname, 'chrome.html');
const PRELOAD_FILE = path.join(__dirname, 'preload.js');

const HISTORICAL_HOMEPAGE = 'http://home.netscape.com/';
const HOME_URL = 'tree://src/electron/pages/home.html';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'tree',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

function disableSandboxIfHelperUnusable() {
  const sandboxPath = path.join(ROOT, 'node_modules', 'electron', 'dist', 'chrome-sandbox');
  let usable = false;
  try {
    const stat = fs.statSync(sandboxPath);
    usable = stat.uid === 0 && (stat.mode & 0o4000) !== 0;
  } catch (error) {
    usable = false;
  }
  if (!usable) {
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-dev-shm-usage');
    app.commandLine.appendSwitch('disable-seccomp-filter-sandbox');
  }
}

disableSandboxIfHelperUnusable();
if (process.env.NETSCAPE_SMOKE === '1') {
  app.commandLine.appendSwitch('disable-gpu');
}

function readPrefs(file) {
  const prefs = {};
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return prefs;
  }
  const pattern = /pref\(\s*"([^"]+)"\s*,\s*("(?:\\.|[^"\\])*"|true|false|-?\d+)\s*\)/g;
  let match = pattern.exec(text);
  while (match) {
    let value = match[2];
    if (value.startsWith('"')) {
      value = value.slice(1, -1);
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    } else {
      value = Number(value);
    }
    prefs[match[1]] = value;
    match = pattern.exec(text);
  }
  return prefs;
}

const prefs = readPrefs(PREFS_FILE);

function fileUrl(filePath) {
  return 'file://' + filePath.split(path.sep).map(encodeURIComponent).join('/');
}

function startupURL() {
  // browser.startup.page: 0 blank, 1 home, 2 last (last is not stored here).
  if (prefs['browser.startup.page'] === 0) {
    return 'about:blank';
  }
  const homepage = prefs['browser.startup.homepage'];
  if (!homepage || homepage === HISTORICAL_HOMEPAGE || homepage === 'http://home.netscape.com') {
    return HOME_URL;
  }
  return homepage;
}

function urlForPath(filePath) {
  const full = path.resolve(filePath);
  const rootWithSep = ROOT + path.sep;
  if (full === ROOT || full.startsWith(rootWithSep)) {
    const relative = path.relative(ROOT, full).split(path.sep).join('/');
    return 'tree://src/' + relative.split('/').map(encodeURIComponent).join('/');
  }
  return fileUrl(full);
}

function chromeState() {
  return {
    startupURL: startupURL(),
    homeURL: HOME_URL,
    rootURL: 'tree://src',
    searchURL: typeof prefs['network.search.url'] === 'string' ? prefs['network.search.url'] : '',
    showToolbar: prefs['browser.chrome.show_toolbar'] !== false,
    showUrlBar: prefs['browser.chrome.show_url_bar'] !== false,
    showStatusBar: prefs['browser.chrome.show_status_bar'] !== false,
    showDirectoryButtons: prefs['browser.chrome.show_directory_buttons'] !== false,
    smoke: process.env.NETSCAPE_SMOKE === '1'
  };
}

function finishSmoke(window, text) {
  if (finishSmoke.done) {
    return;
  }
  finishSmoke.done = true;
  const shots = [window.webContents.capturePage().then((image) => {
    fs.writeFileSync('/tmp/netscape-electron.png', image.toPNG());
  })];
  if (window.pageView) {
    shots.push(window.pageView.webContents.capturePage().then((image) => {
      fs.writeFileSync('/tmp/netscape-page.png', image.toPNG());
      console.log('netscape: page image ' + image.getSize().width + 'x' + image.getSize().height);
    }));
  }
  Promise.all(shots).then(() => {
    fs.writeFileSync('/tmp/netscape-electron-smoke.txt', text + '\n');
    console.log('netscape: window ready');
    app.exit(0);
  }).catch((error) => {
    console.error(error);
    fs.writeFileSync('/tmp/netscape-electron-smoke.txt', text + '\n');
    console.log('netscape: window ready');
    app.exit(0);
  });
}

function sendPage(window, payload) {
  if (window && !window.isDestroyed()) {
    window.webContents.send('page-event', payload);
  }
}

function pageSnapshot(contents) {
  return {
    url: contents.getURL(),
    title: contents.getTitle(),
    canBack: contents.canGoBack(),
    canForward: contents.canGoForward(),
    loading: contents.isLoading()
  };
}

function createWindow(startURL) {
  const window = new BrowserWindow({
    width: 1024,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    title: 'Netscape',
    backgroundColor: '#c0c0c0',
    icon: path.join(ROOT, 'cmd/xfe/icons/images/Desk_Navigator.gif'),
    webPreferences: {
      preload: PRELOAD_FILE,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const initialURL = startURL || startupURL();
  window.chromeState = Object.assign({}, chromeState(), {
    startupURL: initialURL
  });

  const page = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  window.contentView.addChildView(page);
  window.pageView = page;
  page.setBounds({ x: 0, y: 130, width: 1024, height: 560 });

  const contents = page.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    createWindow(url);
    return { action: 'deny' };
  });
  contents.on('did-start-loading', () => sendPage(window, { type: 'start' }));
  contents.on('did-stop-loading', () => sendPage(window, Object.assign({ type: 'stop' }, pageSnapshot(contents))));
  contents.on('did-navigate', () => sendPage(window, Object.assign({ type: 'navigate' }, pageSnapshot(contents))));
  contents.on('did-navigate-in-page', () => sendPage(window, Object.assign({ type: 'navigate' }, pageSnapshot(contents))));
  contents.on('page-title-updated', () => sendPage(window, Object.assign({ type: 'title' }, pageSnapshot(contents))));
  contents.on('update-target-url', (_event, url) => sendPage(window, { type: 'status', url: url || '' }));
  contents.on('did-fail-load', (_event, code, description, url) => {
    if (code === -3) {
      return;
    }
    console.error('netscape: page fail ' + code + ' ' + url + ' ' + description);
    sendPage(window, { type: 'fail', code: code, description: description, url: url });
  });

  let smokeStep = 0;
  contents.on('did-finish-load', () => {
    if (process.env.NETSCAPE_SMOKE !== '1' || finishSmoke.done) {
      return;
    }
    const url = contents.getURL();
    contents.executeJavaScript('document.body ? document.body.innerText.slice(0, 180) : ""').then((text) => {
      console.log('netscape: page text ' + JSON.stringify(text));
      if (smokeStep === 0) {
        smokeStep = 1;
        const next = process.env.NETSCAPE_SMOKE_NEXT || 'tree://src/l10n/us/xp/mozilla.html';
        console.log('netscape: navigate ' + next);
        contents.loadURL(next).catch((error) => console.error(error));
        return;
      }
      const line = 'netscape: content ready ' + url;
      console.log(line);
      finishSmoke(window, line);
    }).catch((error) => console.error(error));
  });

  window.loadFile(CHROME_FILE);
  contents.loadURL(initialURL).catch((error) => console.error(error));

  window.webContents.on('did-finish-load', () => {
    console.log('netscape: chrome loaded');
  });

  if (process.env.NETSCAPE_SMOKE === '1') {
    setTimeout(() => {
      fs.appendFileSync('/tmp/netscape-electron-main.log', 'smoke timeout fired\n');
      finishSmoke(window, 'netscape: content timeout');
    }, 15000);
  }

  return window;
}

function sendCommand(window, command) {
  if (window && !window.isDestroyed()) {
    window.webContents.send('chrome-command', command);
  }
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Navigator Window', accelerator: 'Alt+N', click: () => createWindow(startupURL()) },
        { label: 'Blank Page', accelerator: 'Alt+Shift+N', click: (item, window) => sendCommand(window, 'blank') },
        { label: 'Open Page...', accelerator: 'Alt+O', click: (item, window) => openPage(window) },
        { type: 'separator' },
        { label: 'Close', accelerator: 'Alt+W', role: 'close' },
        { label: 'Quit', accelerator: 'Alt+Q', role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', click: (item, window) => sendCommand(window, 'cut') },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: (item, window) => sendCommand(window, 'copy') },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', click: (item, window) => sendCommand(window, 'paste') },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: (item, window) => sendCommand(window, 'selectAll') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: (item, window) => sendCommand(window, 'reload') },
        { label: 'Stop Loading', accelerator: 'Esc', click: (item, window) => sendCommand(window, 'stop') },
        { type: 'separator' },
        { label: 'Page Source', click: (item, window) => sendCommand(window, 'viewSource') }
      ]
    },
    {
      label: 'Go',
      submenu: [
        { label: 'Back', accelerator: 'Alt+Left', click: (item, window) => sendCommand(window, 'back') },
        { label: 'Forward', accelerator: 'Alt+Right', click: (item, window) => sendCommand(window, 'forward') },
        { label: 'Home', accelerator: 'Alt+Home', click: (item, window) => sendCommand(window, 'home') }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Mozilla',
          click: (item, window) => sendCommand(window, 'open:' + urlForPath(path.join(ROOT, 'l10n/us/xp/mozilla.html')))
        },
        {
          label: 'About Communicator',
          click: (item, window) => sendCommand(window, 'open:' + urlForPath(path.join(ROOT, 'l10n/us/xp/about-all.html')))
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function openPage(window) {
  const parent = window && !window.isDestroyed() ? window : BrowserWindow.getFocusedWindow();
  dialog.showOpenDialog(parent, {
    title: 'Open Page',
    properties: ['openFile'],
    filters: [
      { name: 'Web pages', extensions: ['html', 'htm', 'txt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  }).then((result) => {
    if (result.canceled || !result.filePaths[0]) {
      return;
    }
    sendCommand(parent, 'open:' + urlForPath(result.filePaths[0]));
  }).catch((error) => {
    console.error(error);
  });
}

ipcMain.on('chrome-state', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  event.returnValue = window && window.chromeState ? window.chromeState : chromeState();
});

ipcMain.on('page-bounds', (event, bounds) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || !window.pageView || !bounds) {
    return;
  }
  const next = {
    x: Math.max(0, Math.round(bounds.x || 0)),
    y: Math.max(0, Math.round(bounds.y || 0)),
    width: Math.max(0, Math.round(bounds.width || 0)),
    height: Math.max(0, Math.round(bounds.height || 0))
  };
  if (next.width < 1 || next.height < 1) {
    return;
  }
  window.pageView.setBounds(next);
});

ipcMain.handle('page-load', (event, url) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || !window.pageView || !url) {
    return;
  }
  return window.pageView.webContents.loadURL(url);
});

ipcMain.handle('page-command', async (event, command) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || !window.pageView) {
    return;
  }
  const contents = window.pageView.webContents;
  if (command === 'back' && contents.canGoBack()) {
    contents.goBack();
  } else if (command === 'forward' && contents.canGoForward()) {
    contents.goForward();
  } else if (command === 'reload') {
    contents.reload();
  } else if (command === 'stop') {
    contents.stop();
  } else if (command === 'cut') {
    contents.cut();
  } else if (command === 'copy') {
    contents.copy();
  } else if (command === 'paste') {
    contents.paste();
  } else if (command === 'selectAll') {
    contents.selectAll();
  } else if (command === 'print') {
    contents.print({ silent: false });
  } else if (command === 'viewSource') {
    const html = await contents.executeJavaScript('document.documentElement ? document.documentElement.outerHTML : ""');
    event.sender.send('view-source-text', { html: html, url: contents.getURL() });
  }
});

ipcMain.handle('open-window', (_event, url) => {
  createWindow(url || startupURL());
});

ipcMain.handle('view-source', async (event, payload) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  const sourceWindow = new BrowserWindow({
    width: 720,
    height: 560,
    title: 'Page Source',
    parent: parent || undefined,
    backgroundColor: '#c0c0c0',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  const html = String(payload && payload.html || '');
  const url = String(payload && payload.url || '');
  const documentText = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Page Source</title>' +
    '<style>body{margin:0;background:#c0c0c0;font:13px monospace;}pre{white-space:pre-wrap;word-break:break-word;margin:8px;}</style>' +
    '</head><body><pre id="src"></pre><script>\n' +
    'const html = ' + JSON.stringify(html) + ';\n' +
    'const url = ' + JSON.stringify(url) + ';\n' +
    'document.title = url ? ("Source of " + url) : "Page Source";\n' +
    'document.getElementById("src").textContent = html;\n' +
    '</script></body></html>';
  await sourceWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(documentText));
});

app.on('render-process-gone', (_event, contents, details) => {
  let url = '';
  try {
    url = contents.getURL();
  } catch (error) {
    url = '';
  }
  console.error('netscape: render-process-gone ' + url + ' ' + JSON.stringify(details));
});
app.on('child-process-gone', (_event, details) => {
  console.error('netscape: child-process-gone ' + JSON.stringify(details));
});

function registerTreeProtocol() {
  protocol.handle('tree', (request) => {
    let url;
    try {
      url = new URL(request.url);
    } catch (error) {
      return new Response('Bad URL', { status: 400 });
    }
    if (url.hostname !== 'src') {
      return new Response('Not found', { status: 404 });
    }
    const relative = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    if (!relative || relative.includes('\0')) {
      return new Response('Not found', { status: 404 });
    }
    const parts = relative.split('/');
    if (parts.includes('..') || parts.includes('.git') || parts.includes('node_modules')) {
      return new Response('Forbidden', { status: 403 });
    }
    const full = path.resolve(ROOT, relative);
    const rootWithSep = ROOT + path.sep;
    if (full !== ROOT && !full.startsWith(rootWithSep)) {
      return new Response('Forbidden', { status: 403 });
    }
    let stat;
    try {
      stat = fs.statSync(full);
    } catch (error) {
      return new Response('Not found', { status: 404 });
    }
    if (!stat.isFile()) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(full).toString()).then((response) => {
      if (process.env.NETSCAPE_SMOKE === '1') {
        console.log('netscape: tree ' + relative + ' ' + response.status);
      }
      return response;
    }).catch((error) => {
      console.error('netscape: tree fetch failed ' + relative + ' ' + error);
      return new Response('Fetch failed', { status: 500 });
    });
  });
}

app.whenReady().then(() => {
  registerTreeProtocol();
  buildMenu();
  createWindow(startupURL());
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(startupURL());
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
