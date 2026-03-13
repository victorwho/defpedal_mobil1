
import { useEffect, useCallback, useRef } from 'react';

/**
 * A hook to manage the Screen Wake Lock API.
 * It allows requesting to keep the screen on, and handles re-acquiring the
 * lock when the page becomes visible again.
 */
export const useWakeLock = () => {
  const wakeLockSentinel = useRef<WakeLockSentinel | null>(null);
  // Ref to track if the wake lock is desired, even if it's been released by the browser.
  const isLockDesired = useRef(false);

  const requestWakeLock = useCallback(async () => {
    isLockDesired.current = true;
    
    // Check for browser support
    if (!('wakeLock' in navigator)) {
        console.warn('Screen Wake Lock API not supported.');
        return;
    }

    // Proactively check permission status to avoid throwing an error
    // This is especially useful in environments with strict permission policies
    if ('permissions' in navigator) {
        try {
            // TypeScript may not have the latest PermissionName values, so we cast
            const result = await navigator.permissions.query({ name: 'screen-wake-lock' as PermissionName });
            if (result.state === 'denied') {
                console.warn('Screen Wake Lock permission has been denied by the user or browser settings.');
                isLockDesired.current = false;
                return;
            }
        } catch (e) {
            console.warn('Could not query screen-wake-lock permission state.', e);
        }
    }

    // Don't request if a lock is already active
    if (wakeLockSentinel.current) {
      return;
    }

    try {
      const sentinel = await navigator.wakeLock.request('screen');
      
      sentinel.addEventListener('release', () => {
        // The lock was released by the system (e.g., user switched tabs).
        // We set the sentinel to null, but isLockDesired remains true,
        // so we can re-acquire it later if the page becomes visible again.
        wakeLockSentinel.current = null;
      });

      wakeLockSentinel.current = sentinel;
    } catch (err: any) {
      // The error should be less frequent now, but we still handle it
      console.error(`Failed to acquire wake lock: ${err.name}, ${err.message}`);
      isLockDesired.current = false; // If request fails, we no longer desire it.
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    isLockDesired.current = false;
    
    if (wakeLockSentinel.current) {
      await wakeLockSentinel.current.release();
      wakeLockSentinel.current = null;
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      // If the tab becomes visible and we still want the lock, re-acquire it.
      if (document.visibilityState === 'visible' && isLockDesired.current) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup on component unmount
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Ensure the lock is released when the component unmounts.
      releaseWakeLock();
    };
  }, [requestWakeLock, releaseWakeLock]);
  
  return { requestWakeLock, releaseWakeLock };
};
