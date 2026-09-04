import { NativeModules } from 'react-native';
import TapsellPlus from 'react-native-tapsell-plus';

/**
 * These come from the Tapsell publisher dashboard at app.tapsell.ir, under the
 * دنگودونگ app: the "کلید تپسل" and the two ad zones registered there,
 * «پس از ثبت هزینه» (ویدئو آنی) and «نوار زیر وضعیت حساب» (بنر استاندارد).
 *
 * The app previously used the Tapsell Mediation SDK, which is a separate
 * product with its own dashboard and its own UUID-shaped keys. This account has
 * no Mediation platform, so those requests could never match anything and every
 * slot came back empty. They are client-side identifiers and already readable
 * inside the shipped APK, so there is nothing secret about them.
 */
const APP_KEY = 'dqihompffbhoojnktithkstseikdnislmqntlhibcqflgggoijpkanodelbjnfejtbfhqi';
const EXPENSE_INTERSTITIAL_ZONE_ID = '6a7e3fb7c946be46b1574ee5';
// A native ("بنر همسان") zone, not a standard banner, and the reason is worth
// keeping: a standard banner is a view the SDK pins to a screen edge by
// gravity. In this app that edge is already taken — the floating bottom nav
// sits there, and under edge-to-edge the banner's own bottom lands behind the
// system navigation bar. A banner on every screen would therefore cover the
// navigation on every screen. A native zone hands back the raw creative
// instead, which the app renders as its own card wherever it belongs.
//
// One zone serves every screen. Only one screen is visible at a time, so a
// separate zone per screen would only split the reporting.
const NATIVE_ZONE_ID = '6a83374bb471e817c86ad892';

/**
 * The SDK needs a moment to reach Tapsell's servers, so a request fired in the
 * first moments after a cold start can arrive too early. One attempt is not
 * enough — a single early miss would otherwise mean no ads all session.
 */
const RETRY_DELAYS_MS = [4_000, 15_000, 45_000];

type AdKind = 'interstitial' | 'native';

const lastFailure: Partial<Record<AdKind, string>> = {};

export type AdDiagnostics = {
  /** False means autolinking did not register the native module at all. */
  moduleLinked: boolean;
  interstitial: { ready: boolean; requesting: boolean; lastError?: string };
  nativeAd: { loaded: boolean; requesting: boolean; lastError?: string };
};

function describe(reason: unknown) {
  if (typeof reason === 'string') return reason;
  if (reason && typeof reason === 'object') {
    const event = reason as { error_message?: string; message?: string };
    if (event.error_message) return event.error_message;
    if (event.message) return event.message;
  }
  return String(reason);
}

function note(kind: AdKind, stage: string, reason: unknown) {
  const message = describe(reason);
  lastFailure[kind] = `${stage}: ${message}`;
  console.warn(`[tapsell] ${kind} ${stage} failed — ${message}`);
}

function clearNote(kind: AdKind) {
  delete lastFailure[kind];
}

// ------------------------------------------------------------- lifecycle --

let initialised = false;

/** Safe to call repeatedly; only the first call reaches the SDK. */
function ensureInitialised() {
  if (initialised) return;
  try {
    TapsellPlus.initialize(APP_KEY);
    initialised = true;
  } catch (error) {
    note('interstitial', 'initialize', error);
  }
}

// ----------------------------------------------------------- interstitial --

let interstitialResponseId: string | null = null;
let interstitialRequest: Promise<void> | null = null;
let interstitialAttempt = 0;
let interstitialTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleInterstitialRetry() {
  const delay = RETRY_DELAYS_MS[interstitialAttempt];
  if (delay === undefined) return; // Give up until something asks again.
  interstitialAttempt += 1;
  if (interstitialTimer) clearTimeout(interstitialTimer);
  interstitialTimer = setTimeout(() => {
    interstitialTimer = null;
    void preloadExpenseInterstitial();
  }, delay);
}

export function preloadExpenseInterstitial(): Promise<void> {
  ensureInitialised();
  if (interstitialResponseId) return Promise.resolve();
  if (interstitialRequest) return interstitialRequest;

  interstitialRequest = Promise.resolve(TapsellPlus.requestInterstitialAd(EXPENSE_INTERSTITIAL_ZONE_ID))
    .then((responseId) => {
      interstitialResponseId = responseId;
      interstitialAttempt = 0;
      clearNote('interstitial');
    })
    .catch((error: unknown) => {
      interstitialResponseId = null;
      note('interstitial', 'request', error);
      scheduleInterstitialRetry();
    })
    .finally(() => {
      interstitialRequest = null;
    });

  return interstitialRequest;
}

export async function showExpenseInterstitial(): Promise<boolean> {
  ensureInitialised();
  if (!interstitialResponseId) {
    // Nothing cached: start filling for next time rather than blocking now.
    void preloadExpenseInterstitial();
    return false;
  }

  const responseId = interstitialResponseId;
  interstitialResponseId = null;

  try {
    TapsellPlus.showInterstitialAd(
      responseId,
      () => clearNote('interstitial'),
      () => {
        interstitialAttempt = 0;
        void preloadExpenseInterstitial();
      },
      (event) => {
        note('interstitial', 'show', event);
        interstitialAttempt = 0;
        void preloadExpenseInterstitial();
      },
    );
    return true;
  } catch (error) {
    note('interstitial', 'show', error);
    void preloadExpenseInterstitial();
    return false;
  }
}

// ------------------------------------------------------------- native ad --

export type NativeAdContent = {
  responseId: string;
  title?: string;
  description?: string;
  callToAction?: string;
  iconUrl?: string;
  imageUrl?: string;
};

let nativeAd: NativeAdContent | null = null;
let nativeRequest: Promise<void> | null = null;
let nativeAttempt = 0;
let nativeTimer: ReturnType<typeof setTimeout> | null = null;
let nativeWanted = false;
let onNativeAd: ((ad: NativeAdContent | null) => void) | null = null;

/** The app renders the creative itself, so it needs to be handed the content. */
export function setNativeAdListener(listener: ((ad: NativeAdContent | null) => void) | null) {
  onNativeAd = listener;
  if (listener) listener(nativeAd);
}

function scheduleNativeRetry() {
  const delay = RETRY_DELAYS_MS[nativeAttempt];
  if (delay === undefined) return;
  nativeAttempt += 1;
  if (nativeTimer) clearTimeout(nativeTimer);
  nativeTimer = setTimeout(() => {
    nativeTimer = null;
    if (nativeWanted) void loadNativeAd();
  }, delay);
}

export function loadNativeAd(): Promise<void> {
  ensureInitialised();
  nativeWanted = true;
  if (nativeAd || nativeRequest) return nativeRequest ?? Promise.resolve();

  nativeRequest = Promise.resolve(TapsellPlus.requestNativeAd(NATIVE_ZONE_ID))
    .then((responseId) => {
      if (!nativeWanted) return; // Screen was left while the request was in flight.
      TapsellPlus.showNativeAd(
        responseId,
        (event) => {
          nativeAttempt = 0;
          clearNote('native');
          nativeAd = {
            responseId,
            title: event.title,
            description: event.description,
            callToAction: event.call_to_action_text,
            iconUrl: event.icon_url,
            imageUrl: event.portrait_static_image_url ?? event.landscape_static_image_url,
          };
          onNativeAd?.(nativeAd);
        },
        (event) => {
          note('native', 'show', event);
          nativeAd = null;
          onNativeAd?.(null);
          scheduleNativeRetry();
        },
      );
    })
    .catch((error: unknown) => {
      nativeAd = null;
      note('native', 'request', error);
      scheduleNativeRetry();
    })
    .finally(() => {
      nativeRequest = null;
    });

  return nativeRequest;
}

/** Stops retrying and drops the creative when the host screen goes away. */
export function clearNativeAd() {
  nativeWanted = false;
  nativeAttempt = 0;
  if (nativeTimer) {
    clearTimeout(nativeTimer);
    nativeTimer = null;
  }
  nativeAd = null;
  onNativeAd?.(null);
}

/** Tapsell counts the click only if it is reported back. */
export function reportNativeAdClick(responseId: string) {
  try {
    TapsellPlus.nativeAdClicked(responseId);
  } catch (error) {
    note('native', 'click', error);
  }
}

// ------------------------------------------------------------ diagnostics --

/**
 * Surfaced on a hidden panel in the account screen: Google's Android tooling
 * cannot be installed here, so adb logcat is not available to read these from.
 */
export function getAdDiagnostics(): AdDiagnostics {
  return {
    moduleLinked: Boolean(NativeModules.RNTapsellPlus),
    interstitial: {
      ready: Boolean(interstitialResponseId),
      requesting: Boolean(interstitialRequest),
      lastError: lastFailure.interstitial,
    },
    nativeAd: {
      loaded: Boolean(nativeAd),
      requesting: Boolean(nativeRequest),
      lastError: lastFailure.native,
    },
  };
}

/** Clears the backoff and asks for both slots again, for a manual retry. */
export function retryAds() {
  interstitialAttempt = 0;
  nativeAttempt = 0;
  if (interstitialTimer) { clearTimeout(interstitialTimer); interstitialTimer = null; }
  if (nativeTimer) { clearTimeout(nativeTimer); nativeTimer = null; }
  void preloadExpenseInterstitial();
  if (nativeWanted) void loadNativeAd();
}
