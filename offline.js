(() => {
  'use strict';
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {
        // Offline caching is unavailable until the app is served over HTTPS or localhost.
      });
    });
  }
})();
