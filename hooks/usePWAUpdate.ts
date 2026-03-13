import { useState, useEffect, useCallback } from 'react';

export const usePWAUpdate = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Register the Service Worker
    navigator.serviceWorker.register('/sw.js').then(registration => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          // If the new worker is installed and there is an existing controller,
          // it means this is an update, not the first time install.
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
            setWaitingWorker(newWorker);
          }
        });
      });
    });

    // Listen for the controlling service worker changing
    // This fires when the waiting worker becomes active (after we send SKIP_WAITING)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  const updateApp = useCallback(() => {
    if (waitingWorker) {
      // Send message to SW to skip waiting and activate immediately
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [waitingWorker]);

  return { updateAvailable, updateApp };
};
