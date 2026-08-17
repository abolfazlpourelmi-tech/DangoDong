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
import { toIranPhone, toLatinDigits } from './phone';
import { isSupabaseConfigured, supabase } from './supabase';

type Stage = 'welcome' | 'phone' | 'otp' | 'profile' | 'ready';

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

    if (profileError) {
      setError(friendlyError(profileError.message));
      setStage('profile');
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
      setError(friendlyError(authError.message));
      return;
    }
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
      setError(friendlyError(authError.message));
      return;
    }
    await resolveAccount(data.session);
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
        <Text style={styles.title}>{stage === 'profile' ? 'حساب دنگودونگ تو' : stage === 'welcome' ? 'شروع با دنگودونگ' : 'ورود به دنگودونگ'}</Text>
        <Text style={styles.subtitle}>
          {stage === 'welcome' && 'بدون واردکردن شماره شروع کن. برای بازیابی اطلاعات روی گوشی دیگر، بعداً می‌توانی شماره‌ات را ثبت کنی.'}
          {stage === 'phone' && 'شماره موبایلت را وارد کن تا کد ورود برایت ارسال شود.'}
          {stage === 'otp' && 'کد شش‌رقمی ارسال‌شده را وارد کن.'}
          {stage === 'profile' && 'فقط نامت را وارد کن؛ این نام در ماجراهای مشترک به دیگران نمایش داده می‌شود.'}
        </Text>

        {stage === 'welcome' && (
          <View style={styles.welcomeActions}>
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={startWithoutPhone}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, submitting && styles.buttonDisabled]}
            >
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>شروع بدون شماره</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={submitting} onPress={() => { setError(''); setStage('phone'); }} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>ورود یا بازیابی با شماره</Text>
            </Pressable>
            <Text style={styles.anonymousNotice}>بدون شماره هم همه‌چیز کار می‌کند، اما تا وقتی شماره‌ات را ثبت نکرده‌ای با حذف اپ یا خروج از حساب اطلاعاتت برنمی‌گردد. هر وقت خواستی از «حساب من» شماره‌ات را اضافه کن.</Text>
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
            <Pressable onPress={() => { setError(''); setStage('welcome'); }}><Text style={styles.link}>بازگشت به شروع بدون شماره</Text></Pressable>
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
            <Pressable onPress={() => { setStage('phone'); setOtp(''); setOtpExpiresAt(null); setSecondsRemaining(0); setError(''); }}><Text style={styles.link}>اصلاح شماره موبایل</Text></Pressable>
          </>
        )}
        {stage === 'profile' && (
          <View style={styles.fields}>
            <Text style={styles.label}>نام و نام خانوادگی</Text>
            <TextInput accessibilityLabel="نام و نام خانوادگی" onChangeText={setFullName} placeholder="مثلاً امیر رضایی" placeholderTextColor="#A19BA9" style={styles.input} textAlign="right" value={fullName} />
          </View>
        )}

        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        {stage !== 'welcome' && <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={stage === 'phone' ? requestOtp : stage === 'otp' ? verifyOtp : saveProfile}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, submitting && styles.buttonDisabled]}
        >
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{stage === 'phone' ? 'دریافت کد ورود' : stage === 'otp' ? 'تأیید و ورود' : 'ذخیره و شروع'}</Text>}
        </Pressable>}
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
});
