/**
 * useOwnerNotifications
 *
 * Obtains an FCM push token from the device and exposes it for the
 * WebView to consume.  Registration with the backend is intentionally
 * NOT done here — it happens inside the WebView (see comments below).
 *
 * WHY WE DO NOT CALL THE BACKEND DIRECTLY FROM HERE:
 *   • React Native fetch has no browser session cookies, so Django sees
 *     request.user = AnonymousUser.
 *   • Direct calls hit entergym.onrender.com (no subdomain), so
 *     GymMiddleware cannot derive request.gym — the device would be saved
 *     with gym=None and never match filter(gym=gym, active=True).
 *   • The fix: let the WebView's already-authenticated browser context
 *     make the registration call so Django gets the real user + gym.
 */

import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// ─── Notification display behaviour ────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound:  true,
    shouldSetBadge:   true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

// ─── Android channels ───────────────────────────────────────────────────────
async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('entergym_orders', {
    name:             'New Orders',
    importance:       Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor:       '#ff4d00',
  });
  await Notifications.setNotificationChannelAsync('entergym_expiry', {
    name:             'Membership Reminders',
    importance:       Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor:       '#ff4d00',
  });
}

// ─── Token acquisition ──────────────────────────────────────────────────────
async function getDeviceToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('[Notif] Not a physical device — skipping token fetch');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notif] Permission denied');
    return null;
  }

  try {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    console.log('[Notif] FCM token obtained:', tokenData.data?.slice(0, 20) + '…');
    return tokenData.data;
  } catch (err) {
    console.warn('[Notif] Failed to get FCM token:', err);
    return null;
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────
/**
 * Returns the FCM token (or null while pending / on failure).
 * The caller (WebView screen) passes this token to
 * buildStaffRegistrationJS() and injects it once the page has loaded.
 */
export function useOwnerNotifications(): string | null {
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener     = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await ensureAndroidChannels();
      const token = await getDeviceToken();
      console.log("FCM TOKEN:", token);
      if (token && !cancelled) {
        setFcmToken(token);   // hand off to WebView for authenticated registration
      }
    })();
     // ── ADD THIS: listen for token rotation ──────────────────────────
      const tokenRefreshSub = Notifications.addPushTokenListener((newToken) => {
        if (!cancelled && newToken.data) {
          console.log('[Notif] FCM token refreshed:', newToken.data.slice(0, 20) + '…');
          setFcmToken(newToken.data);
        }
      });

    notificationListener.current = Notifications.addNotificationReceivedListener(
      (_notification) => {}
    );
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (_response) => {}
    );

    return () => {
      cancelled = true;
      tokenRefreshSub.remove();  // ← add this
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return fcmToken;
}