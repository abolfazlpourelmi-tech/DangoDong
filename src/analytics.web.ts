// The web preview has no analytics SDK; every entry point is a no-op so
// callers do not need platform checks.

export function startAnalytics() {}

export function identifyUser(_userId: string | null) {}

export function track(_event: string, _params?: Record<string, string | number | boolean>) {}

export function trackFailure(_action: string, _error: unknown) {}
