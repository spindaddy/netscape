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

(function () {
  const state = window.netscape.state;
  const urlInput = document.getElementById('url');
  const status = document.getElementById('status');
  const security = document.getElementById('security');
  const throbber = document.getElementById('throbber-img');
  const iconRoot = '../cmd/xfe/icons/images/';
  const animRoot = '../cmd/xfe/icons/anim/main/';
  const frames = [];
  for (let i = 0; i < 30; i++) {
    frames.push(animRoot + 'AnimSm' + String(i).padStart(2, '0') + '.gif');
  }

  let frame = 0;
  let timer = null;
  let loading = false;
  let canBack = false;
  let canForward = false;

  const guidePages = [
    ['Welcome', 'pages/home.html'],
    ["What's New?", 'l10n/us/xp/mozilla.html'],
    ["What's Cool?", 'xpcom/doc/ObjectModel.html'],
    ['The Internet', 'README/mozilla/unix-build.html'],
    ['Net Search', 'README/mozilla/win-build.html'],
    ['People', 'l10n/us/xp/authors2.html'],
    ['Yellow Pages', 'README/mozilla/mac-build.html'],
    ['Software', 'README/nglayout/winbuild.html'],
    ['Groups', 'xpcom/doc/c++tips.html']
  ];

  function repoFileURL(relativePath) {
    const encoded = relativePath.split('/').map(encodeURIComponent).join('/');
    return state.rootURL + '/' + encoded;
  }

  function setStatus(text) {
    status.textContent = text || '';
  }

  function looksLikeURL(text) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
      return true;
    }
    if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?([/?#].*)?$/i.test(text)) {
      return true;
    }
    return /^[\w.-]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(text);
  }

  function normalize(input) {
    const text = String(input || '').trim();
    if (!text) {
      return '';
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
      return text;
    }
    if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?([/?#].*)?$/i.test(text)) {
      return 'http://' + text;
    }
    if (looksLikeURL(text)) {
      return 'https://' + text;
    }
    if (state.searchURL) {
      return state.searchURL + encodeURIComponent(text);
    }
    return text;
  }

  function navigate(url) {
    if (!url) {
      return;
    }
    window.netscape.loadURL(url).catch((error) => setStatus(String(error)));
  }

  function iconPath(name, suffix) {
    return iconRoot + name + (suffix || '') + '.gif';
  }

  function wireIconButton(button) {
    const name = button.getAttribute('data-icon');
    const image = button.querySelector('img');
    button.addEventListener('mouseenter', () => {
      if (!button.disabled) {
        image.src = iconPath(name, '.mo');
      }
    });
    button.addEventListener('mouseleave', () => {
      image.src = iconPath(name, button.disabled ? '.i' : '');
    });
    button.addEventListener('mousedown', () => {
      if (!button.disabled) {
        image.src = iconPath(name, '.md');
      }
    });
    button.addEventListener('mouseup', () => {
      image.src = iconPath(name, button.disabled ? '.i' : '.mo');
    });
  }

  function setDisabled(id, disabled) {
    const button = document.getElementById(id);
    button.disabled = disabled;
    const image = button.querySelector('img');
    const name = button.getAttribute('data-icon');
    image.src = iconPath(name, disabled ? '.i' : '');
  }

  function updateNav() {
    setDisabled('back', !canBack);
    setDisabled('forward', !canForward);
    setDisabled('stop', !loading);
  }

  function setLoading(active) {
    loading = active;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (active) {
      timer = setInterval(() => {
        frame = (frame + 1) % frames.length;
        throbber.src = frames[frame];
      }, 80);
      setStatus('Connecting...');
    } else {
      frame = 0;
      throbber.src = frames[0];
    }
    updateNav();
  }

  function updateSecurity(url) {
    const secure = /^https:/i.test(url || '');
    security.src = iconPath(secure ? 'TB_Secure' : 'TB_Unsecure');
  }

  function showLocation(url) {
    if (document.activeElement !== urlInput) {
      urlInput.value = url || '';
    }
    updateSecurity(url || '');
  }

  function reportBounds() {
    const region = document.getElementById('content-wrap');
    const rect = region.getBoundingClientRect();
    window.netscape.setPageBounds({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    });
  }

  document.querySelectorAll('.toolbar button').forEach(wireIconButton);

  if (!state.showToolbar) {
    document.getElementById('toolbar').classList.add('hidden');
  }
  if (!state.showUrlBar) {
    document.getElementById('location-row').classList.add('hidden');
  }
  if (!state.showStatusBar) {
    status.classList.add('hidden');
  }

  const directory = document.getElementById('directory');
  if (state.showDirectoryButtons) {
    guidePages.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry[0];
      button.title = entry[1];
      button.addEventListener('click', () => {
        const target = entry[1] === 'pages/home.html' ? state.homeURL : repoFileURL(entry[1]);
        navigate(target);
      });
      directory.appendChild(button);
    });
  } else {
    directory.classList.add('hidden');
  }

  document.getElementById('back').addEventListener('click', () => window.netscape.pageCommand('back'));
  document.getElementById('forward').addEventListener('click', () => window.netscape.pageCommand('forward'));
  document.getElementById('reload').addEventListener('click', () => window.netscape.pageCommand('reload'));
  document.getElementById('stop').addEventListener('click', () => window.netscape.pageCommand('stop'));
  document.getElementById('home').addEventListener('click', () => navigate(state.homeURL));
  document.getElementById('print').addEventListener('click', () => window.netscape.pageCommand('print'));
  document.getElementById('search').addEventListener('click', () => {
    urlInput.focus();
    urlInput.select();
  });
  document.getElementById('guide').addEventListener('click', () => {
    directory.classList.toggle('hidden');
    reportBounds();
  });

  document.getElementById('location-row').addEventListener('submit', (event) => {
    event.preventDefault();
    const url = normalize(urlInput.value);
    if (url) {
      navigate(url);
    }
  });

  window.netscape.onPageEvent((payload) => {
    if (payload.type === 'start') {
      setLoading(true);
      return;
    }
    if (payload.type === 'status') {
      setStatus(payload.url || '');
      return;
    }
    if (payload.type === 'fail') {
      setStatus(payload.description || 'Load failed');
      return;
    }
    if (payload.url) {
      showLocation(payload.url);
    }
    if (payload.title) {
      document.title = 'Netscape - ' + payload.title;
    }
    canBack = !!payload.canBack;
    canForward = !!payload.canForward;
    if (payload.type === 'stop') {
      setLoading(false);
      setStatus(payload.title || 'Done');
    } else {
      updateNav();
    }
  });

  window.netscape.onViewSource((payload) => {
    window.netscape.viewSource(payload.html, payload.url);
  });

  window.netscape.onCommand((command) => {
    if (command === 'back' || command === 'forward' || command === 'reload' || command === 'stop' ||
        command === 'cut' || command === 'copy' || command === 'paste' || command === 'selectAll' ||
        command === 'viewSource') {
      window.netscape.pageCommand(command);
    } else if (command === 'home') {
      navigate(state.homeURL);
    } else if (command === 'blank') {
      navigate('about:blank');
    } else if (command.indexOf('open:') === 0) {
      navigate(command.slice(5));
    }
  });

  urlInput.value = state.startupURL || '';
  setDisabled('back', true);
  setDisabled('forward', true);
  setDisabled('stop', true);
  window.addEventListener('resize', reportBounds);
  reportBounds();
})();
