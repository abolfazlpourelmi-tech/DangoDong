/**
 * Supabase and Postgres speak English, in the vocabulary of the database:
 * "new row violates row-level security policy", "JWT expired", "Network
 * request failed". Every catch block in this file used to hand that straight
 * to a toast, so the one moment a user most needs a sentence they can act on
 * was the one moment the app stopped speaking Persian. The raw text still goes
 * to the console for support; the reader gets the reason and what to do next.
 */
export function friendlyError(error: unknown, fallback: string) {
  const raw = String((error as { message?: unknown })?.message ?? error ?? '');
  if (!raw) return fallback;
  console.warn('[dong]', raw);
  const lower = raw.toLowerCase();
  if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('timeout') || lower.includes('offline')) {
    return 'به اینترنت وصل نیستی. اتصالت را چک کن و دوباره امتحان کن.';
  }
  if (lower.includes('jwt') || lower.includes('token') || lower.includes('not authenticated') || lower.includes('session')) {
    return 'ورودت منقضی شده. اپ را ببند و دوباره باز کن.';
  }
  if (lower.includes('row-level security') || lower.includes('permission') || lower.includes('policy') || lower.includes('denied')) {
    return 'اجازه این کار را نداری؛ فقط سازنده ماجرا می‌تواند این تغییر را بدهد.';
  }
  if (lower.includes('member has expenses')) {
    return 'چون در بعضی خرج‌ها هست، نمی‌شود حذفش کرد. اول آن خرج‌ها را پاک یا ویرایش کن.';
  }
  if (lower.includes('member has settlements')) {
    return 'چون تسویه‌ای به نامش ثبت شده، نمی‌شود حذفش کرد.';
  }
  if (lower.includes('only guest members can be removed')) {
    return 'او خودش در اپ حساب دارد؛ حذفش از اینجا ممکن نیست.';
  }
  if (lower.includes('duplicate') || lower.includes('unique')) {
    return 'این مورد از قبل ثبت شده است.';
  }
  // Persian in the message means somebody wrote it for the reader on purpose.
  if (/[\u0600-\u06FF]/.test(raw)) return raw;
  return fallback;
}

