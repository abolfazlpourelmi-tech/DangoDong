import {
  BannerPosition,
  BannerSize,
  requestBannerAd,
  requestInterstitialAd,
  showBannerAd,
  showInterstitialAd,
} from '@react-native-tapsell-mediation/tapsell';

const EXPENSE_INTERSTITIAL_ZONE_ID = '6a7e3fb7c946be46b1574ee5';
const ACCOUNT_BANNER_ZONE_ID = '6a7ecb5ca192ce423b372711';

let cachedAdId: string | null = null;
let requestInProgress: Promise<void> | null = null;
let bannerAdId: string | null = null;
let bannerRequestInProgress: Promise<void> | null = null;

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

export async function showExpenseInterstitial() {
  if (!cachedAdId) await preloadExpenseInterstitial();

  const adId = cachedAdId;
  cachedAdId = null;
  if (!adId) return false;

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

/**
 * بنر استاندارد تپسل به‌صورت native در پایین صفحه نمایش داده می‌شود. برای
 * جلوگیری از درخواست‌های تکراری، تا وقتی یک بنر فعال داریم دوباره درخواست
 * نمی‌فرستیم.
 */
export function preloadAccountBanner() {
  if (bannerAdId || bannerRequestInProgress) {
    return bannerRequestInProgress ?? Promise.resolve();
  }

  bannerRequestInProgress = requestBannerAd(
    ACCOUNT_BANNER_ZONE_ID,
    BannerSize.BANNER_320_50,
  )
    .then((adId) => {
      bannerAdId = adId;
      showBannerAd(adId, BannerPosition.Bottom, {
        onAdImpression: () => undefined,
        onAdClicked: () => undefined,
        onAdFailed: () => {
          bannerAdId = null;
        },
      });
    })
    .catch(() => {
      // موجود نبودن تبلیغ نباید عملکرد اصلی اپ را تغییر دهد.
      bannerAdId = null;
    })
    .finally(() => {
      bannerRequestInProgress = null;
    });

  return bannerRequestInProgress;
}
