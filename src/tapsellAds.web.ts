// The web preview has no ad SDK; every entry point is a no-op so callers do
// not need platform checks.
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

export function loadHomeNativeAd() {
  return Promise.resolve();
}

export function clearHomeNativeAd() {
  // no-op
}

export function setNativeAdListener(listener: ((ad: NativeAdContent | null) => void) | null) {
  listener?.(null);
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
