import {
  BannerPosition,
  BannerSize,
  destroyBannerAd,
  requestBannerAd,
  requestInterstitialAd,
  showBannerAd,
  showInterstitialAd,
} from '@react-native-tapsell-mediation/tapsell';

const EXPENSE_INTERSTITIAL_ZONE_ID = '6a7e3fb7c946be46b1574ee5';
const ACCOUNT_BANNER_ZONE_ID = '6a7ecb5ca192ce423b372711';

/**
 * The SDK initialises itself through androidx-startup and has to reach
 * Tapsell's servers before it can serve anything, so a request fired in the
 * first moments after a cold start routinely arrives too early. Previously
 * there was exactly one attempt and its failure was discarded, which left the
 * app with no ads for the rest of the session and no way to find out why.
 */
const RETRY_DELAYS_MS = [4_000, 15_000, 45_000];

type AdKind = 'interstitial' | 'banner';

const lastFailure: Partial<Record<AdKind, string>> = {};

/** Last known reason each ad slot came up empty. Surfaced for diagnostics. */
export function getAdDiagnostics(): Partial<Record<AdKind, string>> {
  return { ...lastFailure };
}

function note(kind: AdKind, stage: string, reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);
  lastFailure[kind] = `${stage}: ${message}`;
  // Visible with: adb logcat -s ReactNativeJS:V
  console.warn(`[tapsell] ${kind} ${stage} failed — ${message}`);
}

function clearNote(kind: AdKind) {
  delete lastFailure[kind];
}

// ----------------------------------------------------------- interstitial --

let interstitialAdId: string | null = null;
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
  if (interstitialAdId) return Promise.resolve();
  if (interstitialRequest) return interstitialRequest;

  interstitialRequest = requestInterstitialAd(EXPENSE_INTERSTITIAL_ZONE_ID)
    .then((adId) => {
      interstitialAdId = adId;
      interstitialAttempt = 0;
      clearNote('interstitial');
    })
    .catch((error) => {
      interstitialAdId = null;
      note('interstitial', 'request', error);
      scheduleInterstitialRetry();
    })
    .finally(() => {
      interstitialRequest = null;
    });

  return interstitialRequest;
}

export async function showExpenseInterstitial(): Promise<boolean> {
  if (!interstitialAdId) {
    // Nothing cached: start filling for next time rather than blocking now.
    void preloadExpenseInterstitial();
    return false;
  }

  const adId = interstitialAdId;
  interstitialAdId = null;

  try {
    showInterstitialAd(adId, {
      onAdImpression: () => clearNote('interstitial'),
      onAdClicked: () => undefined,
      onAdClosed: () => {
        interstitialAttempt = 0;
        void preloadExpenseInterstitial();
      },
      onAdFailed: (error) => {
        note('interstitial', 'show', error);
        interstitialAttempt = 0;
        void preloadExpenseInterstitial();
      },
    });
    return true;
  } catch (error) {
    note('interstitial', 'show', error);
    void preloadExpenseInterstitial();
    return false;
  }
}

// ----------------------------------------------------------------- banner --

let bannerAdId: string | null = null;
let bannerRequest: Promise<void> | null = null;
let bannerAttempt = 0;
let bannerTimer: ReturnType<typeof setTimeout> | null = null;
let bannerWanted = false;
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
    if (bannerWanted) void showAccountBanner();
  }, delay);
}

export function showAccountBanner(): Promise<void> {
  bannerWanted = true;
  if (bannerAdId || bannerRequest) return bannerRequest ?? Promise.resolve();

  bannerRequest = requestBannerAd(ACCOUNT_BANNER_ZONE_ID, BannerSize.BANNER_320_50)
    .then((adId) => {
      // The screen may have been left while the request was in flight.
      if (!bannerWanted) {
        destroyBannerAd(adId);
        return;
      }
      bannerAdId = adId;
      bannerAttempt = 0;
      clearNote('banner');
      showBannerAd(adId, BannerPosition.Bottom, {
        onAdImpression: () => {
          clearNote('banner');
          onBannerVisible?.(true);
        },
        onAdClicked: () => undefined,
        onAdFailed: (error) => {
          note('banner', 'show', error);
          bannerAdId = null;
          onBannerVisible?.(false);
          scheduleBannerRetry();
        },
      });
    })
    .catch((error) => {
      bannerAdId = null;
      note('banner', 'request', error);
      scheduleBannerRetry();
    })
    .finally(() => {
      bannerRequest = null;
    });

  return bannerRequest;
}

/** Tears the banner down when leaving the screen that hosts it. */
export function hideAccountBanner() {
  bannerWanted = false;
  bannerAttempt = 0;
  if (bannerTimer) {
    clearTimeout(bannerTimer);
    bannerTimer = null;
  }
  if (bannerAdId) {
    try {
      destroyBannerAd(bannerAdId);
    } catch (error) {
      note('banner', 'destroy', error);
    }
    bannerAdId = null;
  }
  onBannerVisible?.(false);
}
