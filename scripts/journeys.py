"""Pull raw AppMetrica logs and read them back as one journey per person.

With ~30 users a conversion rate is not a measurement: one person is three
percentage points, and some of those installs are us. What thirty *is* small
enough for is reading every journey end to end, which is the only thing that
says why somebody stopped rather than just where.

So this does two jobs, kept apart on purpose because the API has quotas and the
reading gets repeated:

    python3 scripts/journeys.py fetch --since 2026-08-01 --until 2026-09-04
    python3 scripts/journeys.py report
    python3 scripts/journeys.py report --user <appmetrica_device_id>

`fetch` writes CSVs under analytics-data/ (gitignored — the export carries
device ids and cities, and that belongs nowhere near the repo). `report` reads
only those files and never touches the network.

Authorisation is a Yandex OAuth token with the `appmetrica:read` scope — NOT
the SDK key in src/analytics.native.ts, and NOT the «Post API key», which is a
write credential for pushing events *into* AppMetrica and is rejected here with
a 403. Getting one is a browser round trip through Yandex ID:

    1. https://oauth.yandex.com/client/new
    2. Platform «Web services», redirect URI
       https://oauth.yandex.com/verification_code
    3. Data access: appmetrica:read
    4. Copy the ClientID, then open
       https://oauth.yandex.ru/authorize?response_type=token&client_id=<ClientID>
    5. The token is in the fragment of the URL you land on

The script asks for it rather than taking it on the command line, so it stays
out of shell history.

Three datasets are pulled, because the most important question this app has
right now cannot be answered by events alone. `tab_opened` only fires once
AuthGate has let somebody through, so events say nothing about the people who
never got that far. Installations and session starts are collected by the SDK
itself, before any of our code runs, and the gap between the three is the
onboarding drop-off we are otherwise blind to.
"""

import argparse
import collections
import csv
import getpass
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = 'https://api.appmetrica.yandex.com/logs/v1/export'
APPLICATION_ID = '6349213'  # DangoDong, per src/analytics.native.ts
OUT_DIR = 'analytics-data'
# Gitignored. Optional: the key can also come from the environment or a prompt.
TOKEN_FILE = '.appmetrica-token'

# A gap this long starts a new session, matching SESSION_TIMEOUT_SECONDS in
# src/analytics.native.ts so what we read here matches what AppMetrica counts.
SESSION_GAP_SECONDS = 120

# Field names are the API's, not ours. If a request comes back 400 complaining
# about one, drop it here or pass --fields; the error body is printed verbatim
# so it says which name it did not like.
DATASETS = {
    'events': (
        'events.csv',
        'profile_id,appmetrica_device_id,event_name,event_json,event_datetime,'
        'app_version_name,os_name,device_model,country_iso_code,city',
    ),
    'installations': (
        'installations.csv',
        'appmetrica_device_id,install_datetime,app_version_name,os_name,device_model,city',
    ),
    'sessions': (
        'sessions_starts.csv',
        'appmetrica_device_id,session_start_datetime,app_version_name,os_name',
    ),
}

# The journey this app exists to complete, in order. Names come from
# src/analytics.d.ts; keeping them here means a renamed event shows up as a
# milestone nobody reaches rather than silently vanishing from the report.
MILESTONES = [
    ('اپ را باز کرد (از onboarding رد شد)', lambda e: True),
    ('ماجرا ساخت یا به ماجرا پیوست', lambda e: e in ('story_created', 'story_joined')),
    ('خرج ثبت کرد', lambda e: e == 'expense_added'),
    ('تسویه را ثبت کرد', lambda e: e == 'transfer_marked_paid'),
    ('ماجرا را تمام کرد', lambda e: e == 'story_finished'),
]


def fetch_one(token, dataset, since, until, fields):
    path, default_fields = DATASETS[dataset]
    query = urllib.parse.urlencode({
        'application_id': APPLICATION_ID,
        'date_since': f'{since} 00:00:00',
        'date_until': f'{until} 23:59:59',
        'date_dimension': 'default',
        'fields': fields or default_fields,
    })
    url = f'{BASE}/{path}?{query}'
    request = urllib.request.Request(url, headers={'Authorization': f'OAuth {token}'})

    # The API queues the export and answers 202 until the file is built. That
    # can take minutes on a cold request; polling is the documented flow.
    for attempt in range(60):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                if response.status == 200:
                    return response.read().decode('utf-8')
                wait = min(15, 3 + attempt)
                print(f'  … {dataset}: در حال آماده‌سازی (HTTP {response.status})، {wait}s صبر')
                time.sleep(wait)
        except urllib.error.HTTPError as error:
            body = error.read().decode('utf-8', 'replace')[:600]
            if error.code == 202:
                time.sleep(min(15, 3 + attempt))
                continue
            hint = {
                400: 'یکی از field ها را قبول نکرده. نامش در متن بالاست؛ '
                     'همان را از DATASETS (بالای همین فایل) بردار یا با --fields لیست بده.',
                401: 'کلید پذیرفته نشد. مطمئن شو Post API key را ست کرده‌ای، نه SDK key.',
                403: 'توکن پذیرفته نشد.\n'
                     '  اگر Post API key یا SDK key داده‌ای، هیچ‌کدام برای Logs API کار نمی‌کنند.\n'
                     '  یک Yandex OAuth token با دسترسی appmetrica:read لازم است:\n'
                     '    ۱. https://oauth.yandex.com/client/new\n'
                     '    ۲. پلتفرم «Web services»، redirect URI:\n'
                     '       https://oauth.yandex.com/verification_code\n'
                     '    ۳. در Data access بزن: appmetrica:read\n'
                     '    ۴. ClientID را بردار و این را باز کن:\n'
                     '       https://oauth.yandex.ru/authorize?response_type=token&client_id=<ClientID>\n'
                     '    ۵. توکن در خودِ آدرسی است که به آن می‌رسی (بعد از #access_token=)\n'
                     f'  اگر توکن درست بود، بررسی کن application_id={APPLICATION_ID} درست باشد.',
                429: 'سهمیهٔ API پر شده؛ کمی بعد دوباره.',
            }.get(error.code, 'متن خطا بالاست.')
            raise SystemExit(
                f'\n{dataset}: HTTP {error.code}\n'
                + (f'{body}\n' if body.strip() else '')
                + f'\n{hint}'
            )
    raise SystemExit(f'{dataset}: بعد از چند دقیقه هنوز آماده نشد؛ بعداً دوباره امتحان کن.')


def resolve_token():
    """The token goes into an HTTP header, which is latin-1 only.

    A pasted placeholder, a smart quote or an RTL mark therefore blows up deep
    inside http.client with a UnicodeEncodeError that says nothing about the
    real problem. Catch it here, where we still know what the value was meant
    to be, and never print the token itself back out.
    """
    token = os.environ.get('APPMETRICA_TOKEN', '')
    source = 'APPMETRICA_TOKEN'
    if not token.strip() and os.path.exists(TOKEN_FILE):
        token = io.open(TOKEN_FILE, encoding='utf-8').read()
        source = TOKEN_FILE
    if not token.strip() and sys.stdin.isatty():
        # Asked for rather than required on the command line: this way the key
        # never lands in shell history, in a file, or in a screenshot of the
        # terminal. It is a read credential for every event the app collects.
        print('Yandex OAuth token با دسترسی appmetrica:read.')
        print('نه SDK key، نه Post API key — راهنمای گرفتنش بالای همین فایل است.')
        print('(ورودی نمایش داده نمی‌شود)')
        token = getpass.getpass('  کلید: ')
        source = 'ورودی'
    token = token.strip().strip('\'"<>')
    if not token:
        raise SystemExit(
            'توکنی داده نشد. یکی از این دو:\n'
            '  export APPMETRICA_TOKEN=<yandex-oauth-token>\n'
            f'  یا توکن را در فایل {TOKEN_FILE} بگذار'
        )
    try:
        token.encode('latin-1')
    except UnicodeEncodeError:
        raise SystemExit(
            f'{source}: کاراکتر غیرانگلیسی دارد — احتمالاً متن راهنما را '
            'به‌جای خود کلید کپی کرده‌ای.\n'
            '  فقط خود کلید، بدون گیومه و بدون < >:\n'
            '  export APPMETRICA_TOKEN=572f81db-0000-0000-0000-000000000000'
        ) from None
    if ' ' in token:
        raise SystemExit(f'{source}: کلید فاصله دارد؛ فقط خود کلید باید باشد.')
    return token


def command_fetch(args):
    token = resolve_token()
    os.makedirs(args.out, exist_ok=True)
    wanted = [args.dataset] if args.dataset else list(DATASETS)
    for dataset in wanted:
        print(f'کشیدن {dataset} …')
        body = fetch_one(token, dataset, args.since, args.until, args.fields)
        target = os.path.join(args.out, f'{dataset}.csv')
        with io.open(target, 'w', encoding='utf-8') as handle:
            handle.write(body)
        rows = max(0, body.count('\n') - 1)
        print(f'  ✓ {target} — {rows} ردیف')
    print('\nحالا: python3 scripts/journeys.py report')


def read_csv(path):
    if not os.path.exists(path):
        return []
    with io.open(path, encoding='utf-8') as handle:
        return list(csv.DictReader(handle))


def pick(row, *names):
    for name in names:
        if row.get(name):
            return row[name]
    return ''


def params_of(row):
    raw = row.get('event_json') or ''
    if not raw or raw == '{}':
        return ''
    try:
        data = json.loads(raw)
    except ValueError:
        return raw[:90]
    return ' '.join(f'{k}={v}' for k, v in data.items())[:90]


def command_report(args):
    events = read_csv(os.path.join(args.data, 'events.csv'))
    installs = read_csv(os.path.join(args.data, 'installations.csv'))
    sessions = read_csv(os.path.join(args.data, 'sessions.csv'))
    if not events and not installs:
        raise SystemExit(f'{args.data}/ خالی است. اول fetch را اجرا کن.')

    by_device = collections.defaultdict(list)
    for row in events:
        device = pick(row, 'appmetrica_device_id', 'profile_id')
        when = pick(row, 'event_datetime', 'event_receive_datetime')
        if device and when:
            by_device[device].append((when, row.get('event_name', '?'), params_of(row)))
    for timeline in by_device.values():
        timeline.sort()

    installed = {pick(r, 'appmetrica_device_id') for r in installs} - {''}
    launched = {pick(r, 'appmetrica_device_id') for r in sessions} - {''}
    acted = set(by_device)

    if args.user:
        print_timeline(args.user, by_device.get(args.user, []))
        return

    print('=' * 68)
    print('  ONBOARDING — جایی که هیچ رویدادی نداریم')
    print('=' * 68)
    print(f'  نصب کرد                        {len(installed):>4}')
    print(f'  اپ را دست‌کم یک بار باز کرد     {len(launched or acted):>4}')
    print(f'  از AuthGate رد شد (رویداد داد) {len(acted):>4}')
    lost = (launched or installed) - acted
    if lost:
        print(f'\n  ⚠  {len(lost)} نفر اپ را باز کردند و هیچ رویدادی نفرستادند.')
        print('     یعنی پشت صفحهٔ ورود ماندند — anonymous sign-in یا پیامک.')

    print()
    print('=' * 68)
    print('  مسیر تا هدف اپ (هر نفر یک بار شمرده می‌شود)')
    print('=' * 68)
    base = len(acted) or 1
    for label, matches in MILESTONES:
        reached = {d for d, t in by_device.items() if any(matches(name) for _, name, _ in t)}
        bar = '█' * round(28 * len(reached) / base)
        print(f'  {len(reached):>3}  {bar:<28} {label}')

    print()
    print('=' * 68)
    print('  آخرین کاری که هر نفر کرد و بعد دیگر برنگشت')
    print('=' * 68)
    endings = collections.Counter(t[-1][1] for t in by_device.values() if t)
    for name, count in endings.most_common():
        print(f'  {count:>3}  {name}')

    failures = [(name, extra) for t in by_device.values() for _, name, extra in t if name == 'action_failed']
    print()
    print('=' * 68)
    print(f'  شکست‌های واقعی — {len(failures)} مورد')
    print('=' * 68)
    if failures:
        for extra, count in collections.Counter(e for _, e in failures).most_common(15):
            print(f'  {count:>3}  {extra}')
    else:
        print('  هیچ action_failed ثبت نشده.')

    print()
    print('=' * 68)
    print(f'  {len(by_device)} سفر، یکی‌یکی')
    print('=' * 68)
    for device, timeline in sorted(by_device.items(), key=lambda kv: -len(kv[1])):
        print_timeline(device, timeline, compact=True)


def command_all(args):
    command_fetch(args)
    print()
    args.data, args.user = args.out, None
    command_report(args)


def print_timeline(device, timeline, compact=False):
    if not timeline:
        print(f'{device}: هیچ رویدادی ندارد.')
        return
    reached = {name for _, name, _ in timeline}
    goal = 'تسویه کرد ✓' if 'transfer_marked_paid' in reached else 'به تسویه نرسید'
    print(f'\n  {device[:18]}…  ({len(timeline)} رویداد · {goal})')
    # A handful of very busy devices would otherwise bury the thirty journeys
    # this report exists to make readable; --user prints one in full.
    limit = 40 if compact else len(timeline)
    previous = None
    for index, (when, name, extra) in enumerate(timeline):
        if index >= limit:
            print(f'    … و {len(timeline) - limit} رویداد دیگر — journeys.py report --user {device}')
            break
        stamp = time.mktime(time.strptime(when[:19], '%Y-%m-%d %H:%M:%S'))
        if previous is not None and stamp - previous > SESSION_GAP_SECONDS:
            gap = int((stamp - previous) / 60)
            print(f'      ---- {gap} دقیقه بعد، سشن تازه ----')
        previous = stamp
        flag = '  ⚠' if name == 'action_failed' else '   '
        print(f'    {when[11:19]}{flag} {name}' + (f'  ({extra})' if extra else ''))


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest='command', required=True)

    grab = sub.add_parser('fetch', help='raw logs را از AppMetrica بکش')
    grab.add_argument('--since', required=True, help='YYYY-MM-DD')
    grab.add_argument('--until', required=True, help='YYYY-MM-DD')
    grab.add_argument('--out', default=OUT_DIR)
    grab.add_argument('--dataset', choices=list(DATASETS), help='فقط یکی را بکش')
    grab.add_argument('--fields', help='لیست field ها را دستی بده')
    grab.set_defaults(handler=command_fetch)

    both = sub.add_parser('all', help='بکش و بلافاصله بخوان — همه‌چیز در یک دستور')
    both.add_argument('--since', default='2026-06-01', help='YYYY-MM-DD')
    both.add_argument('--until', default=time.strftime('%Y-%m-%d'), help='YYYY-MM-DD')
    both.add_argument('--out', default=OUT_DIR)
    both.add_argument('--dataset', choices=list(DATASETS), help=argparse.SUPPRESS)
    both.add_argument('--fields', help=argparse.SUPPRESS)
    both.set_defaults(handler=command_all)

    show = sub.add_parser('report', help='سفرها را از فایل‌های کش‌شده بخوان')
    show.add_argument('--data', default=OUT_DIR)
    show.add_argument('--user', help='فقط تایم‌لاین این device id')
    show.set_defaults(handler=command_report)

    args = parser.parse_args()
    args.handler(args)


if __name__ == '__main__':
    main()
