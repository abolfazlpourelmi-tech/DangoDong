// react-native-tapsell-plus ships plain JavaScript with JSDoc, so the surface
// this app uses is declared here. Kept deliberately narrow: only the calls we
// actually make, typed the way the package documents them.
declare module 'react-native-tapsell-plus' {
  export type TapsellPlusEvent = {
    response_id?: string;
    zone_id?: string;
    error_message?: string;
  };

  /** Fields a native ("همسان") zone hands back. Any of them may be absent. */
  export type TapsellPlusNativeAd = TapsellPlusEvent & {
    ad_id?: string;
    title?: string;
    description?: string;
    call_to_action_text?: string;
    icon_url?: string;
    portrait_static_image_url?: string;
    landscape_static_image_url?: string;
  };

  export const TapsellPlusBannerType: {
    BANNER_320x50: 1;
    BANNER_320x100: 2;
    BANNER_250x250: 3;
    BANNER_300x250: 4;
    BANNER_468x60: 5;
    BANNER_728x90: 6;
  };

  // The package labels these two the wrong way round: the "horizontal" enum
  // carries TOP/CENTER/BOTTOM and the "vertical" one carries LEFT/RIGHT/CENTER.
  // They are declared here exactly as the package exports them, so the call
  // site stays honest about which value goes into which argument.
  export const TapsellPlusHorizontalGravity: { TOP: 1; CENTER: 5; BOTTOM: 2 };
  export const TapsellPlusVerticalGravity: { LEFT: 3; RIGHT: 4; CENTER: 5 };

  export default class TapsellPlus {
    static initialize(appKey: string): void;
    static setDebugMode(logLevel: number): void;
    static requestInterstitialAd(zoneId: string): Promise<string>;
    static showInterstitialAd(
      responseId: string,
      onOpened: (event: TapsellPlusEvent) => void,
      onClosed: (event: TapsellPlusEvent) => void,
      onError: (event: TapsellPlusEvent) => void,
    ): void;
    static requestNativeAd(zoneId: string): Promise<string>;
    static showNativeAd(
      responseId: string,
      onOpened: (ad: TapsellPlusNativeAd) => void,
      onError: (event: TapsellPlusEvent) => void,
    ): void;
    static nativeAdClicked(responseId: string): void;
    static requestStandardBannerAd(zoneId: string, bannerType: number): Promise<string>;
    static showStandardBannerAd(
      responseId: string,
      horizontalGravity: number,
      verticalGravity: number,
      onOpened: (event: TapsellPlusEvent) => void,
      onError: (event: TapsellPlusEvent) => void,
    ): void;
    static destroyStandardBannerAd(responseId: string): Promise<string>;
    static hideStandardBanner(): void;
    static displayStandardBanner(): void;
  }
}
