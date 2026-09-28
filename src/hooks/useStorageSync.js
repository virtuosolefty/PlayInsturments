import { useEffect, useRef } from 'react';

/**
 * Syncs component state with localStorage mutations. When localStorage changes
 * (via recordSession or other writes), forces dependents to recalculate.
 *
 * This solves the race condition where recordSession writes synchronously to
 * localStorage, but React batches the state update, causing memos to see stale
 * data momentarily.
 */
export function useStorageSync(callback) {
  const lastWriteRef = useRef(0);

  useEffect(() => {
    // Listen for storage mutations via custom event (since recordSession is same-tab)
    const handleStorageWrite = () => {
      lastWriteRef.current = Date.now();
      callback();
    };

    // Custom event fired by storage wrapper
    window.addEventListener('storage-write', handleStorageWrite);

    // Also listen for standard storage events (other tabs/windows)
    const handleStorageChange = () => {
      callback();
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage-write', handleStorageWrite);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [callback]);
}
