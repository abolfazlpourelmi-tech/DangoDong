import { NativeModules } from 'react-native';
import TapsellPlus, {
  TapsellPlusBannerType,
  TapsellPlusHorizontalGravity,
  TapsellPlusVerticalGravity,
} from 'react-native-tapsell-plus';

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
const HOME_BANNER_ZONE_ID = '6a7ecb5ca192ce423b372711';

/**
 * The SDK needs a moment to reach Tapsell's servers, so a request fired in the
 * first moments after a cold start can arrive too early. One attempt is not
 * enough — a single early miss would otherwise mean no ads all session.
 */
const RETRY_DELAYS_MS = [4_000, 15_000, 45_000];

type AdKind = 'interstitial' | 'banner';

const lastFailure: Partial<Record<AdKind, string>> = {};

export type AdDiagnostics = {
  /** False means autolinking did not register the native module at all. */
  moduleLinked: boolean;
  interstitial: { ready: boolean; requesting: boolean; lastError?: string };
  banner: { wanted: boolean; visible: boolean; requesting: boolean; lastError?: string };
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

// ----------------------------------------------------------------- banner --

let bannerResponseId: string | null = null;
let bannerRequest: Promise<void> | null = null;
let bannerAttempt = 0;
let bannerTimer: ReturnType<typeof setTimeout> | null = null;
let bannerWanted = false;
let bannerOnScreen = false;
let onBannerVisible: ((visible: boolean) => void) | null = null;

/**
 * The banner is a native view pinned over the bottom of the screen, so the app
 * has to know when it is actually on screen — otherwise it sits on top of the
 * bottom navigation.
 */
export function setBannerVisibilityListener(listener: ((visible: boolean) => void) | null) {
  onBannerVisible = listener;
}

function scheduleBannerRetry() {
  const delay = RETRY_DELAYS_MS[bannerAttempt];
  if (delay === undefined) return;
  bannerAttempt += 1;
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    bannerTimer = null;
    if (bannerWanted) void showHomeBanner();
  }, delay);
}

export function showHomeBanner(): Promise<void> {
  ensureInitialised();
  bannerWanted = true;
  if (bannerResponseId || bannerRequest) return bannerRequest ?? Promise.resolve();

  bannerRequest = Promise.resolve(
    TapsellPlus.requestStandardBannerAd(HOME_BANNER_ZONE_ID, TapsellPlusBannerType.BANNER_320x50),
  )
    .then((responseId) => {
      // The screen may have been left while the request was in flight.
      if (!bannerWanted) {
        void TapsellPlus.destroyStandardBannerAd(responseId).catch(() => undefined);
        return;
      }
      bannerResponseId = responseId;
      bannerAttempt = 0;
      clearNote('banner');
      TapsellPlus.showStandardBannerAd(
        responseId,
        // The package's enum names are swapped: the "horizontal" one holds
        // TOP/CENTER/BOTTOM and the "vertical" one holds LEFT/RIGHT/CENTER.
        // Bottom of the screen, centred across it.
        TapsellPlusHorizontalGravity.BOTTOM,
        TapsellPlusVerticalGravity.CENTER,
        () => {
          clearNote('banner');
          bannerOnScreen = true;
          onBannerVisible?.(true);
        },
        (event) => {
          note('banner', 'show', event);
          bannerResponseId = null;
          bannerOnScreen = false;
          onBannerVisible?.(false);
          scheduleBannerRetry();
        },
      );
    })
    .catch((error: unknown) => {
      bannerResponseId = null;
      note('banner', 'request', error);
      scheduleBannerRetry();
    })
    .finally(() => {
      bannerRequest = null;
    });

  return bannerRequest;
}

/** Tears the banner down when leaving the home screen. */
export function hideHomeBanner() {
  bannerWanted = false;
  bannerAttempt = 0;
  if (bannerTimer) {
    clearTimeout(bannerTimer);
    bannerTimer = null;
  }
  if (bannerResponseId) {
    const responseId = bannerResponseId;
    bannerResponseId = null;
    try {
      TapsellPlus.hideStandardBanner();
      void Promise.resolve(TapsellPlus.destroyStandardBannerAd(responseId)).catch(() => undefined);
    } catch (error) {
      note('banner', 'destroy', error);
    }
  }
  bannerOnScreen = false;
  onBannerVisible?.(false);
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
    banner: {
      wanted: bannerWanted,
      visible: bannerOnScreen,
      requesting: Boolean(bannerRequest),
      lastError: lastFailure.banner,
    },
  };
}

/** Clears the backoff and asks for both slots again, for a manual retry. */
export function retryAds() {
  interstitialAttempt = 0;
  bannerAttempt = 0;
  if (interstitialTimer) { clearTimeout(interstitialTimer); interstitialTimer = null; }
  if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
  void preloadExpenseInterstitial();
  if (bannerWanted) void showHomeBanner();
}
