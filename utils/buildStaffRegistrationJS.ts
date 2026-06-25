import * as Device from "expo-device";

export function buildStaffRegistrationJS(fcmToken: string): string {
  if (!fcmToken || typeof fcmToken !== "string" || fcmToken.length < 10) {
    return "true;";
  }

  const deviceName =
    `${Device.brand ?? ""} ${Device.modelName ?? ""}`.trim() || "Unknown";

  const safeToken      = JSON.stringify(fcmToken);
  const safeDeviceName = JSON.stringify(deviceName);

  return `
(async function registerStaffDevice() {
  var controller = new AbortController();
  var timeoutId  = setTimeout(function() { controller.abort(); }, 10000);

  try {
    var res = await fetch(window.location.origin + '/devices/register/', {
      method:      'POST',
      credentials: 'same-origin',
      signal:      controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token:       ${safeToken},
        device_name: ${safeDeviceName},
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn('[Notif] Staff device registration HTTP error:', res.status);
      return;
    }

    var contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.warn('[Notif] Staff device registration: unexpected content-type');
      return;
    }

    var data = await res.json();

    if (typeof data !== 'object' || data === null) {
      console.warn('[Notif] Staff device registration: malformed response');
      return;
    }

    if (data.ok !== true) {
      console.warn('[Notif] Staff device registration rejected by server.');
    }

  } catch (err) {
    clearTimeout(timeoutId);
    if (err && err.name === 'AbortError') {
      console.warn('[Notif] Staff device registration timed out.');
    }
  }
})();
true;
  `.trim();
}