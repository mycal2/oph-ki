"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ApiResponse } from "@/lib/types";

const HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
const POLL_INTERVAL_MS = 60 * 1000; // 60 seconds (for read-only users)

export interface LockState {
  /** Whether the order is currently locked by another user. */
  isLockedByOther: boolean;
  /** Whether the current user holds the lock. */
  isOwnLock: boolean;
  /** Display name of the user holding the lock. */
  lockedByName: string | null;
  /** Timestamp when the lock was acquired. */
  lockedAt: string | null;
  /** Whether the lock state has been determined (initial loading done). */
  isReady: boolean;
  /** Whether the user's own lock has expired (they were away). */
  lockExpired: boolean;
  /** Release the lock (for admin override). */
  releaseLock: () => Promise<boolean>;
}

interface LockInfo {
  orderId: string;
  lockedByUserId: string;
  lockedByName: string;
  lockedAt: string;
  expiresAt: string;
  isOwnLock: boolean;
}

export function useOrderLock(orderId: string): LockState {
  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [isOwnLock, setIsOwnLock] = useState(false);
  const [lockedByName, setLockedByName] = useState<string | null>(null);
  const [lockedAt, setLockedAt] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [lockExpired, setLockExpired] = useState(false);

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasLockRef = useRef(false);

  // Acquire lock on mount
  useEffect(() => {
    let cancelled = false;

    async function acquireLock() {
      try {
        const res = await fetch(`/api/orders/${orderId}/lock`, { method: "POST" });
        const json = (await res.json()) as ApiResponse<LockInfo>;

        if (cancelled) return;

        if (res.ok && json.success && json.data) {
          // Lock acquired
          setIsOwnLock(true);
          setIsLockedByOther(false);
          setLockedByName(null);
          setLockedAt(null);
          hasLockRef.current = true;
          startHeartbeat();
        } else if (res.status === 409 && json.data) {
          // Locked by another user
          const lockData = json.data as LockInfo;
          if (lockData.isOwnLock) {
            // Same user, different tab — treat as own lock
            setIsOwnLock(true);
            setIsLockedByOther(false);
            hasLockRef.current = true;
            startHeartbeat();
          } else {
            setIsLockedByOther(true);
            setIsOwnLock(false);
            setLockedByName(lockData.lockedByName);
            setLockedAt(lockData.lockedAt);
            hasLockRef.current = false;
            startPolling();
          }
        }
      } catch {
        // Network error — treat as unlocked to not block the user
        if (!cancelled) {
          setIsOwnLock(true);
          setIsLockedByOther(false);
          hasLockRef.current = false;
        }
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }

    function startHeartbeat() {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/orders/${orderId}/lock`, { method: "PUT" });
          if (!res.ok) {
            // Lock lost (expired or broken by admin)
            hasLockRef.current = false;
            setLockExpired(true);
            if (heartbeatRef.current) {
              clearInterval(heartbeatRef.current);
              heartbeatRef.current = null;
            }
          }
        } catch {
          // Network issue — will retry on next interval
        }
      }, HEARTBEAT_INTERVAL_MS);
    }

    function startPolling() {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/orders/${orderId}/lock`);
          const json = (await res.json()) as ApiResponse<LockInfo | null>;

          if (cancelled) return;

          if (res.ok && json.success) {
            if (!json.data) {
              // Lock released! Try to acquire
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
              setIsLockedByOther(false);
              setLockedByName(null);
              setLockedAt(null);
              // Auto-acquire the lock
              acquireLock();
            } else if (json.data.isOwnLock) {
              // We somehow got the lock (e.g. admin broke it and we re-acquired)
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
              setIsLockedByOther(false);
              setIsOwnLock(true);
              hasLockRef.current = true;
              startHeartbeat();
            }
          }
        } catch {
          // Network error — keep polling
        }
      }, POLL_INTERVAL_MS);
    }

    acquireLock();

    // Release lock on unmount
    return () => {
      cancelled = true;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (hasLockRef.current) {
        // Use sendBeacon for reliable delivery on page close
        navigator.sendBeacon(`/api/orders/${orderId}/lock?_method=DELETE`);
        // Also try fetch as sendBeacon doesn't support DELETE
        fetch(`/api/orders/${orderId}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
      }
    };
  }, [orderId]);

  const releaseLock = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/orders/${orderId}/lock`, { method: "DELETE" });
      if (res.ok) {
        setIsLockedByOther(false);
        setLockedByName(null);
        setLockedAt(null);
        hasLockRef.current = false;
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [orderId]);

  return {
    isLockedByOther,
    isOwnLock,
    lockedByName,
    lockedAt,
    isReady,
    lockExpired,
    releaseLock,
  };
}
