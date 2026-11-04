(() => {
  'use strict';

  const SESSION_KEY = 'studyflow.v1.sessions';
  const SUBJECT_KEY = 'studyflow.v1.subjects';
  const SUBJECT_UPDATED_KEY = 'studyflow.v1.subjectsUpdatedAt';
  const DELETED_KEY = 'studyflow.v1.driveDeleted';
  const actions = document.querySelector('.actions');
  const csvButton = document.getElementById('csv');
  const notice = document.querySelector('.notice');
  if (!actions || !csvButton) return;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  fileInput.setAttribute('aria-label', 'Choose StudyFlow JSON backup');

  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'ghost';
  exportButton.textContent = '↓ Export backup';

  const importButton = document.createElement('button');
  importButton.type = 'button';
  importButton.className = 'ghost';
  importButton.textContent = '↑ Import backup';

  const feedback = document.createElement('span');
  feedback.className = 'sub';
  feedback.setAttribute('role', 'status');
  feedback.textContent = 'JSON backup includes sessions and subjects for manual Drive transfer.';

  actions.insertBefore(exportButton, csvButton);
  actions.insertBefore(importButton, csvButton);
  actions.insertBefore(fileInput, csvButton);
  actions.append(feedback);

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function validSession(session) {
    return session && Number.isFinite(session.start) && Number.isFinite(session.end) &&
      session.end > session.start && typeof session.subject === 'string';
  }

  function dateStamp(time) {
    const date = new Date(time);
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function updateNotice(message) {
    feedback.textContent = message;
    if (notice) notice.textContent = message;
  }

  exportButton.addEventListener('click', () => {
    const payload = {
      format: 'studyflow-backup',
      version: 1,
      exportedAt: Date.now(),
      sessions: readArray(SESSION_KEY).filter(validSession),
      subjects: readArray(SUBJECT_KEY).filter(subject => typeof subject === 'string').slice(-5),
      subjectsUpdatedAt: Number(localStorage.getItem(SUBJECT_UPDATED_KEY)) || 0,
      deletedIds: readArray(DELETED_KEY).map(String)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `studyflow-backup-${dateStamp(Date.now())}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    updateNotice('Backup downloaded. Upload this JSON file to Drive, then download and import it on another device.');
  });

  importButton.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;

    try {
      const backup = JSON.parse(await file.text());
      if (!backup || !Array.isArray(backup.sessions) ||
          (backup.format !== undefined && backup.format !== 'studyflow-backup')) {
        throw new Error('Choose a StudyFlow JSON backup file.');
      }

      const localSessions = readArray(SESSION_KEY).filter(validSession);
      const importedSessions = backup.sessions.filter(validSession).map(session => ({
        ...session,
        id: session.id ?? `legacy-${session.start}-${session.end}-${session.subject}`
      }));
      const deletedIds = new Set([
        ...readArray(DELETED_KEY),
        ...(Array.isArray(backup.deletedIds) ? backup.deletedIds : [])
      ].map(String));
      const merged = new Map();
      [...localSessions, ...importedSessions].forEach(session => {
        const id = String(session.id);
        if (!deletedIds.has(id)) merged.set(id, session);
      });
      const sessions = [...merged.values()].sort((left, right) =>
        left.start - right.start || String(left.id).localeCompare(String(right.id))
      );
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
      localStorage.setItem(DELETED_KEY, JSON.stringify([...deletedIds]));

      const localSubjects = readArray(SUBJECT_KEY).filter(subject => typeof subject === 'string');
      const importedSubjects = Array.isArray(backup.subjects)
        ? backup.subjects.filter(subject => typeof subject === 'string')
        : [];
      const localUpdatedAt = Number(localStorage.getItem(SUBJECT_UPDATED_KEY)) || 0;
      const importedUpdatedAt = Number(backup.subjectsUpdatedAt) || 0;
      const subjects = importedUpdatedAt > localUpdatedAt
        ? [...new Set(importedSubjects.map(subject => subject.trim()).filter(Boolean))].slice(-5)
        : [...new Set([...localSubjects, ...importedSubjects].map(subject => subject.trim()).filter(Boolean))].slice(-5);
      localStorage.setItem(SUBJECT_KEY, JSON.stringify(subjects));
      localStorage.setItem(SUBJECT_UPDATED_KEY, String(Math.max(Date.now(), localUpdatedAt, importedUpdatedAt)));

      window.dispatchEvent(new Event('studyflow:render'));
      window.dispatchEvent(new Event('studyflow:subjects'));
      updateNotice(`Backup imported and merged. ${importedSessions.length} sessions checked; ${sessions.length} sessions are now available.`);
    } catch (error) {
      updateNotice(error.message || 'Could not import that backup file.');
    }
  });
})();
