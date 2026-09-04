import type { Session } from '@supabase/supabase-js';
import { type ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { track } from './analytics';
import { toIranPhone, toLatinDigits } from './phone';
import { isSupabaseConfigured, supabase } from './supabase';

type Stage = 'welcome' | 'phone' | 'otp' | 'profile' | 'unreachable' | 'ready';

const OTP_EXPIRY_SECONDS = 60;
const isLocalWebPreview = Platform.OS === 'web'
  && typeof window !== 'undefined'
  && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

function friendlyError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('anonymous') && lower.includes('disabled')) {
    return 'شروع بدون شماره هنوز در سرور فعال نشده است. چند لحظه دیگر دوباره امتحان کن.';
  }
  if (lower.includes('unsupported phone provider') || lower.includes('sms')) {
    return 'ارسال پیامک هنوز فعال نشده است. برای تست باید Test OTP در Supabase تنظیم شود و برای نسخه واقعی ملی‌پیامک متصل شود.';
  }
  if (lower.includes('token') || lower.includes('otp')) return 'کد واردشده صحیح نیست یا منقضی شده است.';
  if (lower.includes('rate')) return 'تعداد درخواست‌ها زیاد شده؛ کمی بعد دوباره تلاش کنید.';
  if (lower.includes('hook') || lower.includes('service currently unavailable')) {
    return 'سرویس ارسال پیامک موقتاً پاسخ نداد؛ چند لحظه بعد دوباره تلاش کنید.';
  }
  return message;
}

export function AuthGate({ children }: { children: ReactNode }) {
  // Until now this whole component was silent: the SDK was activated before it
  // rendered, so installs and sessions were counted, but nothing said whether
  // somebody got past the first screen. Anyone who stopped here left no trace.
  const reportStage = (stage: Stage, outcome: string) => track('onboarding_stage', { stage, outcome });
  // Matches App.tsx: the edge-to-edge window never resizes for the keyboard, so
  // the inset has to be applied by hand instead of via KeyboardAvoidingView.
  const insets = useSafeAreaInsets();
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [stage, setStage] = useState<Stage>('welcome');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [phone, setPhone] = useState('');
  const [submittedPhone, setSubmittedPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');

  async function resolveAccount(nextSession: Session | null) {
    setSession(nextSession);
    if (!nextSession || !supabase) {
      setStage('welcome');
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, phone')
      .eq('id', nextSession.user.id)
      .maybeSingle();

    reportStage('welcome', profile ? 'returning' : profileError ? 'unreadable' : 'new');
    if (profileError) {
      // A profile that could not be *read* used to land on "اسمت چیه؟", so a
      // dropped connection at launch asked a returning user to introduce
      // themselves again — and saving that form overwrote the name they
      // already had. A failed read gets a retry, not a form.
      setError(friendlyError(profileError.message));
      setStage('unreachable');
    } else if (profile) {
      setStage('ready');
    } else {
      setFullName('');
      setStage('profile');
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => resolveAccount(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void resolveAccount(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => setKeyboardInset(event.endCoordinates?.height ?? 0));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardInset(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!otpExpiresAt) return;
    const updateRemainingTime = () => {
      const remaining = Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    };
    updateRemainingTime();
    const timer = setInterval(updateRemainingTime, 1000);
    return () => clearInterval(timer);
  }, [otpExpiresAt]);

  async function requestOtp() {
    if (!supabase) return;
    const formatted = toIranPhone(phone);
    if (!formatted) {
      setError('شماره موبایل را به شکل ۰۹۱۲۱۲۳۴۵۶۷ وارد کنید.');
      return;
    }
    setSubmitting(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithOtp({ phone: formatted });
    setSubmitting(false);
    if (authError) {
      setError(friendlyError(authError.message));
      return;
    }
    reportStage('phone', 'code_sent');
    setSubmittedPhone(formatted);
    setSecondsRemaining(OTP_EXPIRY_SECONDS);
    setOtpExpiresAt(Date.now() + OTP_EXPIRY_SECONDS * 1000);
    setStage('otp');
  }

  async function startWithoutPhone() {
    if (!supabase) return;
    setSubmitting(true);
    setError('');
    const { data, error: authError } = await supabase.auth.signInAnonymously();
    setSubmitting(false);
    if (authError) {
      // The failure the app's own error copy anticipates: anonymous sign-in
      // switched off server-side stops every new user dead, and nothing has
      // ever reported it.
      reportStage('welcome', 'anonymous_failed');
      setError(friendlyError(authError.message));
      return;
    }
    reportStage('welcome', 'anonymous_ok');
    await resolveAccount(data.session);
  }

  async function verifyOtp() {
    if (!supabase) return;
    if (secondsRemaining <= 0) {
      setError('اعتبار کد تمام شده؛ دوباره کد بگیر.');
      return;
    }
    const token = toLatinDigits(otp);
    if (token.length !== 6) {
      setError('کد شش‌رقمی را کامل وارد کنید.');
      return;
    }
    setSubmitting(true);
    setError('');
    const { data, error: authError } = await supabase.auth.verifyOtp({ phone: submittedPhone, token, type: 'sms' });
    setSubmitting(false);
    if (authError) {
      reportStage('otp', 'rejected');
      setError(friendlyError(authError.message));
      // Otherwise the next attempt starts by deleting six wrong digits by hand.
      setOtp('');
      return;
    }
    reportStage('otp', 'verified');
    await resolveAccount(data.session);
  }

  /** Retry needs to look like it is doing something, or it gets pressed again. */
  async function retryAccountRead() {
    setSubmitting(true);
    setError('');
    await resolveAccount(session);
    setSubmitting(false);
  }

  /** The way out of a stage that will not complete, so nobody is ever stuck. */
  async function abandonSession() {
    if (!supabase) return;
    setSubmitting(true);
    await supabase.auth.signOut();
    setSubmitting(false);
    setError('');
    setOtp('');
    setFullName('');
    reportStage('profile', 'abandoned');
    setStage('welcome');
  }

  async function saveProfile() {
    if (!supabase || !session) return;
    const name = fullName.trim();
    if (name.length < 2) {
      setError('نام و نام خانوادگی را کامل وارد کنید.');
      return;
    }
    setSubmitting(true);
    setError('');
    // The current profiles table requires a unique, non-null phone value.
    // Keep anonymous accounts distinct without ever displaying this internal
    // identifier as a phone number in the app.
    const normalizedPhone = session.user.phone || submittedPhone || `anonymous:${session.user.id}`;
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: session.user.id,
      full_name: name,
      phone: normalizedPhone,
      updated_at: new Date().toISOString(),
    });
    if (profileError) {
      setSubmitting(false);
      setError(friendlyError(profileError.message));
      return;
    }
    setSubmitting(false);
    reportStage('profile', 'saved');
    setStage('ready');
  }

  if (!isSupabaseConfigured) return <>{children}</>;
  // Local browser previews must never consume SMS credits. Production Android
  // builds do not satisfy this localhost-only condition.
  if (isLocalWebPreview) return <>{children}</>;
  if (loading) return <View style={[styles.page, { paddingTop: insets.top }]}><ActivityIndicator size="large" color="#6652D9" /></View>;
  if (stage === 'ready') return <>{children}</>;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.center, { paddingBottom: 28 + Math.max(keyboardInset, insets.bottom) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}><Text style={styles.brandLetter}>د</Text></View>
        <Text style={styles.title}>{stage === 'profile' ? 'اسمت چیه؟' : stage === 'unreachable' ? 'حسابت خوانده نشد' : stage === 'welcome' ? 'دنگودونگ' : 'ورود با شماره موبایل'}</Text>
        <Text style={styles.subtitle}>
          {stage === 'welcome' && 'خرج‌های دوستانه را اینجا ثبت کن تا آخرش معلوم شود هر کس چقدر به چه کسی بدهکار است.'}
          {stage === 'phone' && 'شماره موبایلت را وارد کن تا کد ورود برایت پیامک شود.'}
          {stage === 'otp' && 'کد شش‌رقمی که پیامک شد را وارد کن.'}
          {stage === 'profile' && 'همین اسم را بقیه در ماجراهای مشترک می‌بینند.'}
          {stage === 'unreachable' && 'اطلاعات حسابت این بار دریافت نشد. حسابت سر جایش است؛ فقط باید دوباره امتحان کنیم.'}
        </Text>

        {stage === 'welcome' && (
          <View style={styles.welcomeActions}>
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={startWithoutPhone}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, submitting && styles.buttonDisabled]}
            >
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>شروع کنیم</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={submitting} onPress={() => { setError(''); setStage('phone'); }} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>قبلاً حساب داشتم</Text>
            </Pressable>
            <Text style={styles.anonymousNotice}>شماره موبایل لازم نیست. هر وقت خواستی، بعداً از «حساب من» ثبتش کن.</Text>
          </View>
        )}
        {stage === 'phone' && (
          <>
            <TextInput
              accessibilityLabel="شماره موبایل"
              autoFocus
              keyboardType="phone-pad"
              maxLength={11}
              onChangeText={(value) => setPhone(toLatinDigits(value).slice(0, 11))}
              placeholder="۰۹۱۲۱۲۳۴۵۶۷"
              placeholderTextColor="#A19BA9"
              style={styles.input}
              textAlign="center"
              value={phone}
            />
            <Pressable onPress={() => { setError(''); setStage('welcome'); }}><Text style={styles.link}>بی‌خیال، بدون شماره شروع می‌کنم</Text></Pressable>
          </>
        )}
        {stage === 'otp' && (
          <>
            <TextInput
              accessibilityLabel="کد ورود"
              autoFocus
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={(value) => setOtp(toLatinDigits(value).slice(0, 6))}
              placeholder="ــــــ"
              placeholderTextColor="#A19BA9"
              style={[styles.input, styles.otpInput]}
              textAlign="center"
            value={otp}
            />
            <Text style={styles.otpTimer}>
              {secondsRemaining > 0
                ? `اعتبار کد: ${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`
                : 'اعتبار کد تمام شده؛ دوباره کد بگیر.'}
            </Text>
            {/* "دوباره کد بگیر" with nothing to press was a dead end at the
                very first step: the only way onwards was to guess that going
                back to the phone screen and re-submitting would do it. */}
            {secondsRemaining === 0 && (
              <Pressable accessibilityRole="button" disabled={submitting} onPress={() => { setOtp(''); void requestOtp(); }}><Text style={styles.link}>ارسال دوباره کد</Text></Pressable>
            )}
            <Pressable onPress={() => { setStage('phone'); setOtp(''); setOtpExpiresAt(null); setSecondsRemaining(0); setError(''); }}><Text style={styles.link}>اصلاح شماره موبایل</Text></Pressable>
          </>
        )}
        {stage === 'profile' && (
          <View style={styles.fields}>
            <Text style={styles.label}>اسم تو</Text>
            <TextInput accessibilityLabel="اسم تو" onChangeText={setFullName} placeholder="مثلاً امیر" placeholderTextColor="#A19BA9" style={styles.input} textAlign="right" value={fullName} />
          </View>
        )}

        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        {stage !== 'welcome' && <Pressable
          accessibilityRole="button"
          disabled={submitting || (stage === 'otp' && toLatinDigits(otp).length !== 6)}
          onPress={stage === 'phone' ? requestOtp : stage === 'otp' ? verifyOtp : stage === 'unreachable' ? () => void retryAccountRead() : saveProfile}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, (submitting || (stage === 'otp' && toLatinDigits(otp).length !== 6)) && styles.buttonDisabled]}
        >
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{stage === 'phone' ? 'برایم کد بفرست' : stage === 'otp' ? 'تأیید و ورود' : stage === 'unreachable' ? 'تلاش دوباره' : 'شروع'}</Text>}
        </Pressable>}
        {/* Both of these stages sit behind the app with no other control on
            them. Without a way out, a profile save or a profile read that keeps
            failing is the end of the session — reinstalling is not a fix. */}
        {(stage === 'profile' || stage === 'unreachable') && (
          <Pressable accessibilityRole="button" disabled={submitting} onPress={() => void abandonSession()}>
            <Text style={styles.escapeLink}>خروج و شروع دوباره</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFF8EF', alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, width: '100%' },
  center: { flexGrow: 1, width: '100%', maxWidth: 440, alignSelf: 'center', paddingHorizontal: 28, paddingTop: 28, alignItems: 'center', justifyContent: 'center' },
  brand: { width: 68, height: 68, borderRadius: 24, backgroundColor: '#6652D9', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  brandLetter: { color: '#FFFFFF', fontSize: 36, fontWeight: '900' },
  title: { color: '#25203A', fontSize: 26, fontWeight: '800', writingDirection: 'rtl', marginBottom: 8 },
  subtitle: { color: '#777184', fontSize: 15, lineHeight: 25, textAlign: 'center', writingDirection: 'rtl', marginBottom: 24 },
  fields: { width: '100%' },
  label: { color: '#25203A', fontSize: 14, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl', marginBottom: 7 },
  input: { width: '100%', minHeight: 56, borderWidth: 1, borderColor: '#E5DCD2', borderRadius: 18, backgroundColor: '#FFFFFF', color: '#25203A', paddingHorizontal: 16, fontSize: 16, marginBottom: 16 },
  otpInput: { fontSize: 25, letterSpacing: 10 },
  otpTimer: { color: '#777184', fontSize: 13, fontWeight: '700', marginTop: -6, marginBottom: 14, writingDirection: 'rtl' },
  hint: { color: '#777184', fontSize: 12, textAlign: 'right', writingDirection: 'rtl', marginTop: -6, marginBottom: 10 },
  error: { width: '100%', color: '#C84359', backgroundColor: '#FFE8EC', borderRadius: 14, padding: 12, textAlign: 'right', writingDirection: 'rtl', lineHeight: 21, marginBottom: 14 },
  welcomeActions: { width: '100%', gap: 12 },
  secondaryButton: { width: '100%', minHeight: 52, borderRadius: 18, borderWidth: 1, borderColor: '#D8CFEC', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#6652D9', fontSize: 15, fontWeight: '800', writingDirection: 'rtl' },
  anonymousNotice: { color: '#777184', fontSize: 12, lineHeight: 20, textAlign: 'center', writingDirection: 'rtl', marginTop: 2 },
  button: { width: '100%', minHeight: 56, borderRadius: 18, backgroundColor: '#6652D9', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonPressed: { backgroundColor: '#4936B6', transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', writingDirection: 'rtl' },
  link: { color: '#6652D9', fontSize: 14, fontWeight: '700', marginBottom: 14, writingDirection: 'rtl' },
  escapeLink: { color: '#777184', fontSize: 13, fontWeight: '700', marginTop: 16, writingDirection: 'rtl' },
});
