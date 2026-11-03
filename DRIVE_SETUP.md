# StudyFlow Google Drive Setup

The app can sync completed study sessions through the Google Drive API. The HTML file must be hosted at an HTTPS address before Google sign-in works; opening it directly from the computer will not enable Drive sync or phone access.

## Host the app

1. Create a GitHub repository for the app and add `study_timer.html` and `study_timer_drive.js` to its root.
2. In the repository, open **Settings > Pages** and publish from the `main` branch and `/ (root)`.
3. Open the published `study_timer.html` URL on your computer. It will look like `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/study_timer.html`.

## Enable Google Drive

1. In the Google Cloud Console, create or select a project and enable the **Google Drive API**.
2. Configure the OAuth consent screen. If the app is in testing mode, add your Google account as a test user.
3. Create an OAuth client ID of type **Web application**.
4. Add the published site's origin under **Authorized JavaScript origins**. For the example URL above, use `https://YOUR-USERNAME.github.io` (no repository path or trailing slash).
5. In the published app, choose **Connect Google Drive** and paste the OAuth client ID when prompted. Approve access to the app's Drive file.

The OAuth client ID is not a password or client secret. Do not put a client secret in this static app.

## Use it on your phone

Open the same published URL on your phone, choose **Connect Google Drive**, enter the same OAuth client ID, and sign in to the same Google account. The app creates `studyflow-sessions.json` in that account's Drive and syncs completed sessions after you stop a timer, delete a session, or clear history. It also checks for updates periodically while open. A running timer is not synced until it is stopped and saved.

Google OAuth setup and site publishing require signing in to your own Google and GitHub accounts; this folder cannot be linked to those accounts automatically.
