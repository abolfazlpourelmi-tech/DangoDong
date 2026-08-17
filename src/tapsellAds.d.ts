export function preloadExpenseInterstitial(): Promise<void>;
export function showExpenseInterstitial(): Promise<boolean>;
export function showAccountBanner(): Promise<void>;
export function hideAccountBanner(): void;
export function setBannerVisibilityListener(listener: ((visible: boolean) => void) | null): void;
export function getAdDiagnostics(): Partial<Record<'interstitial' | 'banner', string>>;
