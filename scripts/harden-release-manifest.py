"""Close the security findings an automated store scan reports on this app.

`expo prebuild` regenerates android/ every CI run, so this runs afterwards.
None of it changes what the app does — it makes the manifest say what the app
already does, because scanners read the manifest, not runtime behaviour.

Every change is anchored to text this script asserts it found, so a drifted
template fails the build instead of silently shipping unhardened.
"""

import io
import os
import re

MANIFEST = 'android/app/src/main/AndroidManifest.xml'
NETWORK_CONFIG = 'android/app/src/main/res/xml/dangodong_network_security_config.xml'

# react-native-tapsell-plus merges android:usesCleartextTraffic="true" into the
# application tag, but the config it ships alongside permits cleartext only for
# 127.0.0.1, localhost and the emulator loopbacks — no real host. The flag is
# leftover noise, and it is the single most reported finding in an APK scan.
# This config says the same thing without the loophole: nothing in cleartext.
NETWORK_CONFIG_BODY = """<?xml version="1.0" encoding="utf-8"?>
<!-- Every request this app makes is HTTPS. Nothing is exempt. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
</network-security-config>
"""


def read(path):
    return io.open(path, encoding='utf-8').read()


def write(path, text):
    io.open(path, 'w', encoding='utf-8').write(text)


def main():
    manifest = read(MANIFEST)

    if 'tools:replace' in manifest:
        raise SystemExit('%s already hardened' % MANIFEST)

    # The tools namespace is already declared by the blockedPermissions config.
    if 'xmlns:tools=' not in manifest:
        raise SystemExit('%s is missing the tools namespace' % MANIFEST)

    app = re.search(r'<application\b[^>]*>', manifest)
    if not app:
        raise SystemExit('no <application> tag in %s' % MANIFEST)
    tag = app.group(0)

    # allowBackup=true lets `adb backup` pull the database off a device with USB
    # debugging on. This app holds who owes whom and card numbers.
    if 'android:allowBackup="true"' not in tag:
        raise SystemExit('expected android:allowBackup="true", got: %s' % tag)
    hardened = tag.replace('android:allowBackup="true"', 'android:allowBackup="false"')

    # Both attributes arrive from a library, so overriding them needs an
    # explicit tools:replace or the merger fails the build with a conflict.
    hardened = hardened.replace(
        '>',
        ' android:usesCleartextTraffic="false"'
        ' android:networkSecurityConfig="@xml/dangodong_network_security_config"'
        ' tools:replace="android:usesCleartextTraffic,android:networkSecurityConfig">',
        1)

    manifest = manifest.replace(tag, hardened, 1)

    # Not touched: expo-clipboard's exported ClipboardFileProvider. Making it
    # android:exported="false" is what force-closed 1.26.5 — the library
    # asserts it is exported inside attachInfo(), and providers are built at
    # process start, so the app died before drawing anything:
    #
    #   java.lang.AssertionError: ClipboardFileProvider must be exported
    #       at expo.modules.clipboard.ClipboardFileProvider.attachInfo
    #
    # It only ever serves an image you copied, out of the app's own cache dir.
    # Leave it alone.

    write(MANIFEST, manifest)

    directory = os.path.dirname(NETWORK_CONFIG)
    if not os.path.isdir(directory):
        os.makedirs(directory)
    write(NETWORK_CONFIG, NETWORK_CONFIG_BODY)

    print('hardened: no cleartext traffic, no adb backup')


if __name__ == '__main__':
    main()
