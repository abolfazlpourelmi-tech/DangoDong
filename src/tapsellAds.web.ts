// The web preview has no ad SDK; every entry point is a no-op so callers do
// not need platform checks.
//
// The one exception is the native creative. The card is drawn by the app, not
// by the SDK, so on localhost it is handed a stand-in — otherwise the only way
// to check that an ad slot sits where it should on five different screens is
// to build an APK and look at a phone.
export type NativeAdContent = {
  responseId: string;
  title?: string;
  description?: string;
  callToAction?: string;
  iconUrl?: string;
  imageUrl?: string;
};

export function preloadExpenseInterstitial() {
  return Promise.resolve();
}

export function showExpenseInterstitial() {
  return Promise.resolve(false);
}

const isLocalWebPreview = typeof window !== 'undefined'
  && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const PLACEHOLDER: NativeAdContent = {
  responseId: 'local-preview',
  title: 'جای تبلیغ (نمونهٔ محلی)',
  description: 'این کارت فقط روی پیش‌نمایش محلی دیده می‌شود تا جای اسلات معلوم باشد.',
  callToAction: 'مشاهده',
};

let listener: ((ad: NativeAdContent | null) => void) | null = null;
let wanted = false;

export function loadNativeAd() {
  wanted = true;
  if (isLocalWebPreview) listener?.(PLACEHOLDER);
  return Promise.resolve();
}

export function clearNativeAd() {
  wanted = false;
  listener?.(null);
}

export function setNativeAdListener(next: ((ad: NativeAdContent | null) => void) | null) {
  listener = next;
  next?.(isLocalWebPreview && wanted ? PLACEHOLDER : null);
}


export function reportNativeAdClick(_responseId: string) {
  // no-op
}

export function getAdDiagnostics() {
  return {
    moduleLinked: false,
    interstitial: { ready: false, requesting: false, lastError: 'روی وب تبلیغی وجود ندارد' },
    nativeAd: { loaded: false, requesting: false, lastError: 'روی وب تبلیغی وجود ندارد' },
  };
}

export function retryAds() {
  // no-op
}
