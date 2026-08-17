// The web preview has no ad SDK; every entry point is a no-op so callers do
// not need platform checks.
export function preloadExpenseInterstitial() {
  return Promise.resolve();
}

export function showExpenseInterstitial() {
  return Promise.resolve(false);
}

export function showHomeBanner() {
  return Promise.resolve();
}

export function hideHomeBanner() {
  // no-op
}

export function setBannerVisibilityListener(_listener: ((visible: boolean) => void) | null) {
  // no-op
}

export function getAdDiagnostics() {
  return {
    moduleLinked: false,
    interstitial: { ready: false, requesting: false, lastError: 'روی وب تبلیغی وجود ندارد' },
    banner: { wanted: false, visible: false, requesting: false, lastError: 'روی وب تبلیغی وجود ندارد' },
  };
}

export function retryAds() {
  // no-op
}
