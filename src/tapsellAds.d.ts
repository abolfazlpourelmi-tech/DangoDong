export type NativeAdContent = {
  responseId: string;
  title?: string;
  description?: string;
  callToAction?: string;
  iconUrl?: string;
  imageUrl?: string;
};

export type AdDiagnostics = {
  moduleLinked: boolean;
  interstitial: { ready: boolean; requesting: boolean; lastError?: string };
  nativeAd: { loaded: boolean; requesting: boolean; lastError?: string };
};

export function preloadExpenseInterstitial(): Promise<void>;
export function showExpenseInterstitial(): Promise<boolean>;
export function loadHomeNativeAd(): Promise<void>;
export function clearHomeNativeAd(): void;
export function setNativeAdListener(listener: ((ad: NativeAdContent | null) => void) | null): void;
export function reportNativeAdClick(responseId: string): void;
export function getAdDiagnostics(): AdDiagnostics;
export function retryAds(): void;
