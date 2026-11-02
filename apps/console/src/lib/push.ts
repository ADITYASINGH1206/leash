/**
 * Web Push Notification Client Helper
 */

import { GATEWAY_BASE_URL } from './api';

export interface PushStatus {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  endpoint?: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Registers the Service Worker for the Approvals PWA
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    return reg;
  } catch (err) {
    console.warn('Service Worker registration skipped or failed:', err);
    return null;
  }
}

/**
 * Retrieves the current Web Push notification status
 */
export async function getPushStatus(): Promise<PushStatus> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return {
      supported: false,
      permission: 'default',
      subscribed: false,
    };
  }

  const permission = Notification.permission;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return {
      supported: true,
      permission,
      subscribed: sub !== null,
      endpoint: sub?.endpoint,
    };
  } catch {
    return {
      supported: true,
      permission,
      subscribed: false,
    };
  }
}

/**
 * Subscribes to Web Push notifications and registers endpoint with Gateway
 */
export async function subscribeToWebPush(
  gatewayUrl: string = GATEWAY_BASE_URL
): Promise<{ success: boolean; error?: string }> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return { success: false, error: 'Web Push is not supported in this browser' };
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return { success: false, error: 'Notification permission was denied' };
    }

    const reg = await navigator.serviceWorker.ready;

    // Fetch VAPID public key from Gateway
    let vapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckj0WgW45Vpdsh4i95p9v1K4b4xYmU';
    try {
      const keyRes = await fetch(`${gatewayUrl}/api/v1/push/public-key`);
      if (keyRes.ok) {
        const keyData = await keyRes.json();
        if (keyData.publicKey) vapidKey = keyData.publicKey;
      }
    } catch {
      // Use fallback key
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidKey);

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as unknown as BufferSource,
    });

    // Send subscription to Gateway
    await fetch(`${gatewayUrl}/api/v1/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
