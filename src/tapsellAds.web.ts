// The web preview has no ad SDK; every entry point is a no-op so callers do
// not need platform checks.
export function preloadExpenseInterstitial() {
  return Promise.resolve();
}

export function showExpenseInterstitial() {
  return Promise.resolve(false);
}

export function showAccountBanner() {
  return Promise.resolve();
}

export function hideAccountBanner() {
  // no-op
}

export function setBannerVisibilityListener(_listener: ((visible: boolean) => void) | null) {
  // no-op
}

export function getAdDiagnostics(): Partial<Record<'interstitial' | 'banner', string>> {
  return {};
}
