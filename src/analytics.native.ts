import AppMetrica from '@appmetrica/react-native-analytics';

/**
 * The SDK key of the «DangoDong» app at appmetrica.yandex.com (Application ID
 * 6349213), from Settings → General settings → «API key (for SDK)». Not the
 * «Post API key» below it — that one reads the collected data back out and has
 * no business being inside a shipped APK.
 *
 * Like the Tapsell keys this is a client-side identifier that ships readable
 * in the bundle, so there is nothing secret about it being here.
 */
const API_KEY = '8609c490-6d59-4415-aba7-1febccc1375f';

/** Matches AppMetrica's own default: a gap this long starts a new session. */
const SESSION_TIMEOUT_SECONDS = 120;

let started = false;

/**
 * Safe to call repeatedly; only the first call reaches the SDK. Reporting
 * before activation is dropped by the SDK, so every entry point below goes
 * through here rather than trusting a particular call order at startup.
 */
function ensureStarted() {
  if (started) return;
  started = true;
  try {
    AppMetrica.activate({
      apiKey: API_KEY,
      sessionTimeout: SESSION_TIMEOUT_SECONDS,
      // Nothing in this app is location-aware and nothing here targets ads, so
      // neither the device's coordinates nor its advertising ID is collected.
      // Both default to on; leaving them on would mean declaring collection we
      // do not need in the store listing and the privacy policy.
      locationTracking: false,
      advIdentifiersTracking: false,
      crashReporting: true,
      logs: __DEV__,
    });
  } catch (error) {
    started = false;
    console.warn('[appmetrica] activate failed —', describe(error));
  }
}

function describe(reason: unknown) {
  if (typeof reason === 'string') return reason;
  if (reason && typeof reason === 'object') {
    const event = reason as { message?: string };
    if (event.message) return event.message;
  }
  return String(reason);
}

export function startAnalytics() {
  ensureStarted();
}

/**
 * Ties the session to the Supabase user so one person on two devices reads as
 * one person. Pass null on sign-out; the SDK then goes back to counting the
 * device on its own.
 */
export function identifyUser(userId: string | null) {
  ensureStarted();
  try {
    AppMetrica.setUserProfileID(userId ?? undefined);
  } catch (error) {
    console.warn('[appmetrica] setUserProfileID failed —', describe(error));
  }
}

/**
 * Analytics is never worth a crash: a failure to report is swallowed, because
 * the alternative is an unhandled rejection inside a button the user pressed.
 */
export function track(event: string, params?: Record<string, string | number | boolean>) {
  ensureStarted();
  try {
    if (params) AppMetrica.reportEvent(event, params);
    else AppMetrica.reportEvent(event);
  } catch (error) {
    console.warn(`[appmetrica] reportEvent ${event} failed —`, describe(error));
  }
}

/**
 * Failures are the point of this whole exercise: a funnel that stops at a step
 * only says where people leave, not why. `action` is the caller's own fallback
 * message, which is already unique per call site.
 */
export function trackFailure(action: string, error: unknown) {
  ensureStarted();
  const reason = describe(error);
  try {
    AppMetrica.reportEvent('action_failed', { action, reason });
    AppMetrica.reportError(action, reason);
  } catch (reportingError) {
    console.warn('[appmetrica] reportError failed —', describe(reportingError));
  }
}
