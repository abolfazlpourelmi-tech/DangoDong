import {
  requestInterstitialAd,
  showInterstitialAd,
} from '@react-native-tapsell-mediation/tapsell';

const EXPENSE_INTERSTITIAL_ZONE_ID = '6a7e3fb7c946be46b1574ee5';

let cachedAdId: string | null = null;
let requestInProgress: Promise<void> | null = null;

export function preloadExpenseInterstitial() {
  if (cachedAdId || requestInProgress) return requestInProgress ?? Promise.resolve();

  requestInProgress = requestInterstitialAd(EXPENSE_INTERSTITIAL_ZONE_ID)
    .then((adId) => {
      cachedAdId = adId;
    })
    .catch(() => {
      // نبودن اینترنت یا موجود نبودن تبلیغ نباید ثبت هزینه را مختل کند.
      cachedAdId = null;
    })
    .finally(() => {
      requestInProgress = null;
    });

  return requestInProgress;
}

export function showExpenseInterstitial() {
  const adId = cachedAdId;
  cachedAdId = null;

  if (!adId) {
    void preloadExpenseInterstitial();
    return false;
  }

  try {
    showInterstitialAd(adId, {
      onAdImpression: () => undefined,
      onAdClicked: () => undefined,
      onAdClosed: () => {
        void preloadExpenseInterstitial();
      },
      onAdFailed: () => {
        void preloadExpenseInterstitial();
      },
    });
    return true;
  } catch {
    void preloadExpenseInterstitial();
    return false;
  }
}
