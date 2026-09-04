/**
 * The contract App.tsx sees. The implementation is split per platform the same
 * way the ad module is: a native file that talks to the SDK, a web file where
 * every entry point is a no-op.
 */

/**
 * Every event the app reports, spelled out so a typo becomes a build error
 * instead of a second series in the dashboard that nobody notices for a month.
 * Names are stable: renaming one splits its history in AppMetrica.
 */
export type AnalyticsEvent =
  | 'tab_opened'
  | 'story_created'
  | 'story_joined'
  | 'story_finished'
  | 'story_deleted'
  | 'expense_added'
  | 'expense_edited'
  | 'expense_deleted'
  | 'member_added'
  | 'member_edited'
  | 'member_removed'
  | 'transfer_marked_paid'
  | 'invite_copied'
  | 'invite_shared'
  | 'card_copied'
  | 'phone_link_started'
  | 'phone_link_confirmed'
  | 'account_saved'
  | 'signed_out'
  | 'action_failed'
  // Added after the first look at real data. 57 outings existed; 17 never got
  // an expense and 31 got expenses but never a settlement. The events above
  // only record successes, so they say where people stopped and nothing about
  // why. These four are the "why": what they opened and left, what blocked
  // them, and what the settlement screen could actually offer them.
  | 'onboarding_stage'
  | 'sheet_opened'
  | 'sheet_abandoned'
  | 'flow_blocked'
  | 'settlement_viewed';

export type AnalyticsParams = Record<string, string | number | boolean>;

export function startAnalytics(): void;
export function identifyUser(userId: string | null): void;
export function track(event: AnalyticsEvent, params?: AnalyticsParams): void;
export function trackFailure(action: string, error: unknown): void;
