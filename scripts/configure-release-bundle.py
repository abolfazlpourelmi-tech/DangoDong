"""Prepare the generated Android project for a release App Bundle.

`expo prebuild` rewrites android/ from scratch on every CI run, so anything we
need there has to be applied afterwards rather than committed. This makes three
changes and refuses to run if the template has drifted from what it expects.
"""

import io
import sys

PATH = 'android/app/build.gradle'

# The same two architectures the APK ships. A bundle splits by ABI anyway, so
# this is not about download size: it keeps the bundle and the APK carrying
# identical native code, so a phone behaves the same whichever it installs.
ABI_FILTERS = """
        ndk {
            abiFilters 'armeabi-v7a', 'arm64-v8a'
        }"""

# Expo's template signs release builds with the debug key. The APK job repairs
# that afterwards because apksigner replaces an existing signature. An .aab is
# an ordinary jar and jarsigner would only append a second signature, so the
# real key has to be in place while Gradle builds.
RELEASE_SIGNING = """
        release {
            storeFile file(System.getenv('DANGODONG_KEYSTORE'))
            storePassword System.getenv('DANGODONG_KEYSTORE_PASSWORD')
            keyAlias System.getenv('DANGODONG_KEY_ALIAS')
            keyPassword System.getenv('DANGODONG_KEY_PASSWORD')
        }"""

# Every string the reader sees lives in the JS bundle, so splitting by language
# saves nothing and only risks a device fetching an incomplete set of library
# resources. ABI and density splits are where the saving comes from; they stay.
NO_LANGUAGE_SPLIT = """    bundle {
        language {
            enableSplit = false
        }
    }
"""


def insert_after(source, anchor, addition):
    found = source.count(anchor)
    if found != 1:
        raise SystemExit('expected one %r in %s, found %d' % (anchor, PATH, found))
    index = source.index(anchor) + len(anchor)
    return source[:index] + addition + source[index:]


def main():
    source = io.open(PATH, encoding='utf-8').read()

    if 'abiFilters' in source:
        raise SystemExit('%s already sets abiFilters' % PATH)
    source = insert_after(source, 'defaultConfig {', ABI_FILTERS)

    if 'DANGODONG_KEYSTORE' in source:
        raise SystemExit('%s already has a release signing config' % PATH)
    source = insert_after(source, '    signingConfigs {', RELEASE_SIGNING)

    debug_signing = 'signingConfig signingConfigs.debug'
    found = source.count(debug_signing)
    if found != 2:
        raise SystemExit('expected a debug and a release build type, found %d' % found)
    head, _, tail = source.rpartition(debug_signing)
    source = head + 'signingConfig signingConfigs.release' + tail

    anchor = '    androidResources {'
    found = source.count(anchor)
    if found != 1:
        raise SystemExit('expected one %r, found %d' % (anchor, found))
    source = source.replace(anchor, NO_LANGUAGE_SPLIT + anchor, 1)

    io.open(PATH, 'w', encoding='utf-8').write(source)
    print('configured: release signing, arm-only ABIs, no language split')


if __name__ == '__main__':
    sys.exit(main())
