# StudyFlow Google Drive Setup

The app syncs completed study sessions and saved subjects through the Google Drive API. It keeps the five most recently added subjects; adding a sixth replaces the oldest. Sync data is stored as `studyflow-sessions.json`, not CSV, so the file can preserve session intervals, subjects, and timestamps. The app finds that named file automatically and creates it in Drive if it does not exist. CSV remains available as a manual export. The HTML file must be hosted at an HTTPS address before Google sign-in works; opening it directly from the computer will not enable Drive sync or phone access.

## Host the app

1. Add all app files to the repository root: `study_timer.html`, `study_timer_drive.js`, `manual_backup.js`, `study_status.html`, `chart.umd.min.js`, `offline.js`, `service-worker.js`, `manifest.webmanifest`, and `studyflow-icon.svg`.
2. In the repository, open **Settings > Pages** and publish from the `main` branch and `/ (root)`.
3. Open the published `study_timer.html` URL on your computer. It will look like `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/study_timer.html`.

## Enable Google Drive

1. In the Google Cloud Console, create or select a project and enable the **Google Drive API**.
2. Configure the OAuth consent screen. If the app is in testing mode, add your Google account as a test user.
3. Create an OAuth client ID of type **Web application**.
4. Add the published site's origin under **Authorized JavaScript origins**. For the example URL above, use `https://YOUR-USERNAME.github.io` (no repository path or trailing slash).
5. In the published app, choose **Connect Google Drive** and paste the OAuth client ID in the dialog. Approve access to the app's Drive file.

The OAuth client ID is not a password or client secret. Do not put a client secret in this static app.

## Use it on your phone

Open the same published URL on your phone, choose **Connect Google Drive**, enter the same OAuth client ID, and sign in to the same Google account. The app automatically finds the same `studyflow-sessions.json` file in that account's Drive. It syncs saved subjects when added, plus completed sessions after you stop a timer, delete a session, or clear history. It also checks for updates periodically while open. A running or paused timer is not synced until it is stopped and saved.

The app remembers the OAuth client ID and selected Drive file ID in each browser, so you do not have to select the data file manually. For security, it does not save your Google password or a long-lived login token. After Google authorization expires or when using another device, choose **Reconnect Google Drive** and approve access again if Google asks.

## Offline use without Drive

Each device stores its own sessions and subjects in that browser. Visit the published app while online at least once so its pages and chart library can be cached, then install it from the browser menu. On iPhone/iPad, use Safari's **Share > Add to Home Screen**. Once installed and cached, the timer, saved local data, and status charts can be used without internet. Data does not automatically transfer between devices unless Google Drive sync is connected.

## Manual Drive transfer without OAuth

Use **Export backup** to download a JSON file, upload it to Drive manually, then download it on another device and choose **Import backup**. The import merges session IDs and avoids duplicates. Stop and save any active timer before exporting. This manual process does not automatically sync; repeat the export/upload/import steps when you want to transfer newer data.

Google OAuth setup and site publishing require signing in to your own Google and GitHub accounts; this folder cannot be linked to those accounts automatically.
