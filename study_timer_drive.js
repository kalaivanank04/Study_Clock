(() => {
  'use strict';

  const SESSIONS_KEY = 'studyflow.v1.sessions';
  const SUBJECTS_KEY = 'studyflow.v1.subjects';
  const SUBJECTS_UPDATED_KEY = 'studyflow.v1.subjectsUpdatedAt';
  const CLIENT_ID_KEY = 'studyflow.v1.googleClientId';
  const DRIVE_FILE_ID_KEY = 'studyflow.v1.googleDriveFileId';
  const TOMBSTONES_KEY = 'studyflow.v1.driveDeleted';
  const BASELINE_KEY = 'studyflow.v1.driveBaseline';
  const DRIVE_FILE = 'studyflow-sessions.json';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const button = document.createElement('button');
  const status = document.createElement('span');
  const clientDialog = document.createElement('dialog');
  const clientForm = document.createElement('form');
  const clientLabel = document.createElement('label');
  const clientInput = document.createElement('input');
  const dialogActions = document.createElement('div');
  const cancelButton = document.createElement('button');
  const continueButton = document.createElement('button');
  let token = null;
  let fileId = null;
  let syncing = false;
  let syncAgain = false;
  let syncTimer = null;

  button.type = 'button';
  button.className = 'ghost';
  button.textContent = localStorage.getItem(CLIENT_ID_KEY)
    ? 'Reconnect Google Drive'
    : 'Connect Google Drive';
  button.setAttribute('aria-label', 'Connect or disconnect Google Drive sync');
  status.setAttribute('role', 'status');
  status.textContent = location.protocol === 'file:'
    ? 'HTTPS hosting required for phone sync'
    : localStorage.getItem(CLIENT_ID_KEY)
      ? 'Drive setup remembered; reconnect to sync'
      : 'Not connected to Google Drive';
  status.style.cssText = 'color:#a9bad4;font-size:12px;min-width:110px';
  const actions = document.querySelector('.actions');
  const notice = document.querySelector('.notice');
  if (!actions) return;
  actions.insertBefore(button, actions.firstChild);
  actions.insertBefore(status, button.nextSibling);

  clientDialog.style.cssText = 'max-width:min(440px,calc(100vw - 32px));border:1px solid #334861;border-radius:12px;padding:24px;background:#121e32;color:#e9f0fa;box-shadow:0 18px 60px #0008';
  clientForm.noValidate = true;
  clientLabel.htmlFor = 'googleClientId';
  clientLabel.textContent = 'Google OAuth Web client ID';
  clientLabel.style.cssText = 'display:block;margin-bottom:8px;font-weight:700';
  clientInput.id = 'googleClientId';
  clientInput.type = 'text';
  clientInput.autocomplete = 'off';
  clientInput.spellcheck = false;
  clientInput.placeholder = '...apps.googleusercontent.com';
  clientInput.required = true;
  clientInput.style.cssText = 'width:100%;margin-bottom:16px';
  dialogActions.style.cssText = 'display:flex;justify-content:flex-end;gap:10px';
  cancelButton.type = 'button';
  cancelButton.className = 'ghost';
  cancelButton.textContent = 'Cancel';
  continueButton.type = 'submit';
  continueButton.className = 'primary';
  continueButton.textContent = 'Continue';
  dialogActions.append(cancelButton, continueButton);
  clientForm.append(clientLabel, clientInput, dialogActions);
  const clientHelp = document.createElement('p');
  clientHelp.textContent = 'This is the ID ending in .apps.googleusercontent.com, not a password or client secret.';
  clientHelp.style.cssText = 'color:#a9bad4;font-size:12px;margin:12px 0 0';
  clientForm.insertBefore(clientHelp, dialogActions);
  clientDialog.append(clientForm);
  document.body.append(clientDialog);
  cancelButton.addEventListener('click', () => clientDialog.close());

  function askForClientId() {
    clientInput.value = '';
    clientDialog.showModal();
    clientInput.focus();
    return new Promise(resolve => {
      clientForm.addEventListener('submit', event => {
        event.preventDefault();
        const clientId = clientInput.value.trim();
        if (!clientId) {
          clientInput.focus();
          return;
        }
        clientDialog.close();
        resolve(clientId);
      }, { once: true });
      clientDialog.addEventListener('close', () => resolve(''), { once: true });
    });
  }

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function readSessions() {
    return readArray(SESSIONS_KEY).filter(session =>
      session && Number.isFinite(session.start) && Number.isFinite(session.end) &&
      session.end > session.start && typeof session.subject === 'string' &&
      session.id !== undefined
    );
  }

  function normalizedSubjects(values) {
    const subjects = new Map();
    values.filter(subject => typeof subject === 'string').forEach(subject => {
      const name = subject.trim();
      if (name && !subjects.has(name.toLocaleLowerCase())) subjects.set(name.toLocaleLowerCase(), name);
    });
    return [...subjects.values()].slice(-5);
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.style.color = isError ? '#ffb4b9' : '#a9bad4';
  }

  function setConnectedNotice(connected) {
    if (!notice) return;
    notice.textContent = connected
      ? 'Sessions and saved subjects sync in studyflow-sessions.json. This app finds that file automatically. Connect the same Google account on your other devices; an active timer syncs after Stop & save.'
      : 'Sessions stay in this browser until Drive is connected. For phone access, host this page over HTTPS and connect the same Google account on each device.';
  }

  function loadGoogleIdentity() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load Google sign-in.'));
      document.head.appendChild(script);
    });
  }

  async function driveRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Google Drive returned ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    return response;
  }

  async function findDriveFile() {
    const query = `name='${DRIVE_FILE}' and trashed=false`;
    const params = new URLSearchParams({ q: query, fields: 'files(id,name)', pageSize: '10' });
    const response = await driveRequest(`https://www.googleapis.com/drive/v3/files?${params}`);
    const result = await response.json();
    return result.files?.[0] || null;
  }

  async function readDriveData(id) {
    const response = await driveRequest(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`
    );
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function writeDriveData(payload) {
    const body = JSON.stringify(payload);
    if (!fileId) {
      const boundary = `studyflow_${crypto.randomUUID()}`;
      const metadata = JSON.stringify({ name: DRIVE_FILE, mimeType: 'application/json' });
      const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
      const response = await driveRequest(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart }
      );
      fileId = (await response.json()).id;
      localStorage.setItem(DRIVE_FILE_ID_KEY, fileId);
      return;
    }
    await driveRequest(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }
    );
  }

  function normalizedSessions(sessions) {
    return sessions.slice().sort((left, right) =>
      left.start - right.start || String(left.id).localeCompare(String(right.id))
    );
  }

  async function syncDrive() {
    if (!token) return;
    if (syncing) {
      syncAgain = true;
      return;
    }
    syncing = true;
    setStatus('Syncing…');
    try {
      do {
        syncAgain = false;
        let localSessions = readSessions();
        const tombstones = new Set(readArray(TOMBSTONES_KEY).map(String));
        const baseline = readArray(BASELINE_KEY).map(String);
        const localIds = new Set(localSessions.map(session => String(session.id)));
        baseline.forEach(id => {
          if (!localIds.has(id)) tombstones.add(id);
        });

        let remote = null;
        if (!fileId) fileId = localStorage.getItem(DRIVE_FILE_ID_KEY);
        if (fileId) {
          try {
            remote = await readDriveData(fileId);
          } catch {
            fileId = null;
            localStorage.removeItem(DRIVE_FILE_ID_KEY);
          }
        }
        if (!fileId) {
          const file = await findDriveFile();
          if (file) {
            fileId = file.id;
            localStorage.setItem(DRIVE_FILE_ID_KEY, fileId);
            remote = await readDriveData(fileId);
          }
        }

        const remoteSessions = Array.isArray(remote) ? remote : (remote?.sessions || []);
        const remoteSubjects = Array.isArray(remote?.subjects) ? remote.subjects : [];
        const localSubjects = readArray(SUBJECTS_KEY);
        const remoteSubjectsUpdatedAt = Number.isFinite(remote?.subjectsUpdatedAt) ? remote.subjectsUpdatedAt : 0;
        const localSubjectsUpdatedAt = Number(localStorage.getItem(SUBJECTS_UPDATED_KEY)) || 0;
        const hasTimestampedSubjectList = remoteSubjectsUpdatedAt > 0 || localSubjectsUpdatedAt > 0;
        const localSubjectListIsNewer = localSubjectsUpdatedAt >= remoteSubjectsUpdatedAt;
        const mergedSubjects = hasTimestampedSubjectList
          ? normalizedSubjects(localSubjectListIsNewer ? localSubjects : remoteSubjects)
          : normalizedSubjects([...remoteSubjects, ...localSubjects]);
        const mergedSubjectsUpdatedAt = hasTimestampedSubjectList
          ? Math.max(remoteSubjectsUpdatedAt, localSubjectsUpdatedAt)
          : Date.now();
        (Array.isArray(remote?.deletedIds) ? remote.deletedIds : []).forEach(id => tombstones.add(String(id)));
        const merged = new Map();
        [...remoteSessions, ...localSessions].forEach(session => {
          if (session?.id !== undefined && !tombstones.has(String(session.id))) {
            merged.set(String(session.id), session);
          }
        });
        localSessions = normalizedSessions([...merged.values()]);

        const payload = {
          version: 1,
          updatedAt: new Date().toISOString(),
          sessions: localSessions,
          subjects: mergedSubjects,
          subjectsUpdatedAt: mergedSubjectsUpdatedAt,
          deletedIds: [...tombstones].sort()
        };
        const oldRemote = remote && !Array.isArray(remote) ? {
          sessions: normalizedSessions(remote.sessions || []),
          subjects: normalizedSubjects(Array.isArray(remote.subjects) ? remote.subjects : []),
          subjectsUpdatedAt: Number.isFinite(remote.subjectsUpdatedAt) ? remote.subjectsUpdatedAt : 0,
          deletedIds: [...(remote.deletedIds || [])].map(String).sort()
        } : null;
        const nextRemote = {
          sessions: payload.sessions,
          subjects: payload.subjects,
          subjectsUpdatedAt: payload.subjectsUpdatedAt,
          deletedIds: payload.deletedIds
        };
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(localSessions));
        localStorage.setItem(SUBJECTS_KEY, JSON.stringify(mergedSubjects));
        localStorage.setItem(SUBJECTS_UPDATED_KEY, String(mergedSubjectsUpdatedAt));
        localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(payload.deletedIds));
        localStorage.setItem(BASELINE_KEY, JSON.stringify(localSessions.map(session => String(session.id))));
        if (JSON.stringify(oldRemote) !== JSON.stringify(nextRemote)) await writeDriveData(payload);
        window.dispatchEvent(new Event('studyflow:render'));
      } while (syncAgain);
      setStatus('Drive synced');
      setConnectedNotice(true);
    } catch (error) {
      setStatus(error.message || 'Drive sync failed', true);
    } finally {
      syncing = false;
    }
  }

  function requestDriveAccess(clientId) {
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: response => {
          if (response.error) reject(new Error(response.error_description || response.error));
          else resolve(response.access_token);
        },
        error_callback: error => reject(new Error(error.message || 'Google sign-in was closed.'))
      });
      client.requestAccessToken();
    });
  }

  button.addEventListener('click', async () => {
    if (token) {
      if (syncTimer) clearInterval(syncTimer);
      token = null;
      fileId = null;
      button.textContent = 'Connect Google Drive';
      setStatus('Disconnected');
      setConnectedNotice(false);
      return;
    }
    if (location.protocol === 'file:') {
      setStatus('Host this page on HTTPS first', true);
      return;
    }
    let clientId = localStorage.getItem(CLIENT_ID_KEY);
    if (!clientId) {
      clientId = await askForClientId();
      if (!clientId) return;
      localStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    button.disabled = true;
    try {
      await loadGoogleIdentity();
      token = await requestDriveAccess(clientId);
      await syncDrive();
      if (token) {
        button.textContent = 'Disconnect Drive';
        syncTimer = setInterval(syncDrive, 30000);
      }
    } catch (error) {
      token = null;
      setStatus(error.message || 'Google Drive connection failed', true);
    } finally {
      button.disabled = false;
    }
  });

  document.addEventListener('click', event => {
    if (event.target.closest('#stop, #clear, #clearToday, #history .icon-btn')) {
      setTimeout(syncDrive, 250);
    }
  });

  document.addEventListener('change', event => {
    if (event.target.matches('#deleteSession')) setTimeout(syncDrive, 250);
  });

  window.addEventListener('storage', event => {
    if (event.key === SESSIONS_KEY) syncDrive();
  });

  window.addEventListener('studyflow:subjects', syncDrive);
})();