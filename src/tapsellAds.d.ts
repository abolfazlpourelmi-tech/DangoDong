export type AdDiagnostics = {
  moduleLinked: boolean;
  interstitial: { ready: boolean; requesting: boolean; lastError?: string };
  banner: { wanted: boolean; visible: boolean; requesting: boolean; lastError?: string };
};

export function preloadExpenseInterstitial(): Promise<void>;
export function showExpenseInterstitial(): Promise<boolean>;
export function showAccountBanner(): Promise<void>;
export function hideAccountBanner(): void;
export function setBannerVisibilityListener(listener: ((visible: boolean) => void) | null): void;
export function getAdDiagnostics(): AdDiagnostics;
export function retryAds(): void;
