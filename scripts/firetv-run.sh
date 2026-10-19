#!/usr/bin/env bash
# Find a Fire OS Fire TV on this Wi-Fi, build Milo for it, install and launch.
# Run on your Mac from milo/:   bash scripts/firetv-run.sh            (auto-find)
#                               bash scripts/firetv-run.sh 192.168.1.42  (known IP)
# Needs: adb (brew install android-platform-tools), Android SDK (Android Studio),
# and on the Fire Stick: Developer Options > ADB Debugging ON.
set -euo pipefail
cd "$(dirname "$0")/.."
PKG=com.zoraplay.tv
APK=firetv/app/build/outputs/apk/debug/app-debug.apk

command -v adb >/dev/null || { echo "adb not found: brew install android-platform-tools"; exit 1; }

IP="${1:-}"
if [ -z "$IP" ]; then
  # Already connected?
  IP=$(adb devices | awk '/:5555[[:space:]]+device$/ {sub(":5555","",$1); print $1; exit}')
fi
if [ -z "$IP" ]; then
  echo "Scanning your Wi-Fi for devices with ADB open (port 5555)..."
  MYIP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
  [ -n "$MYIP" ] || { echo "Couldn't read this Mac's Wi-Fi IP. Pass the Fire Stick IP: bash scripts/firetv-run.sh <ip>"; exit 1; }
  NET=${MYIP%.*}
  FOUND=$(for i in $(seq 1 254); do (nc -z -G 1 "$NET.$i" 5555 >/dev/null 2>&1 && echo "$NET.$i") & done; wait)
  [ -n "$FOUND" ] || { echo "No device with ADB on $NET.0/24. On the Fire Stick: Settings > My Fire TV > Developer Options > ADB Debugging ON. Or pass its IP (Settings > My Fire TV > About > Network)."; exit 1; }
  for cand in $FOUND; do
    adb connect "$cand:5555" >/dev/null 2>&1 || true
    MODEL=$(adb -s "$cand:5555" shell getprop ro.product.manufacturer 2>/dev/null | tr -d '\r' || true)
    if [ "$MODEL" = "Amazon" ]; then IP=$cand; break; fi
  done
  [ -n "$IP" ] || { echo "Found ADB on: $FOUND but none reported as an Amazon device yet. Accept the 'Allow USB debugging?' prompt on the TV, then rerun."; exit 1; }
fi

echo "Connecting to $IP:5555 (accept 'Allow USB debugging?' on the TV the first time)..."
adb connect "$IP:5555"
for _ in $(seq 1 20); do adb -s "$IP:5555" get-state 2>/dev/null | grep -q device && break; sleep 1; done
adb -s "$IP:5555" get-state | grep -q device || { echo "Not authorized yet: accept the prompt on the TV and rerun."; exit 1; }
echo "Device: $(adb -s "$IP:5555" shell getprop ro.product.model | tr -d '\r') (Fire OS $(adb -s "$IP:5555" shell getprop ro.build.version.release | tr -d '\r'))"

SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [ ! -f firetv/local.properties ]; then
  [ -d "$SDK" ] || { echo "Android SDK not found at $SDK. Install Android Studio (it installs the SDK), or set ANDROID_HOME."; exit 1; }
  echo "sdk.dir=$SDK" > firetv/local.properties
fi
echo "Building Milo..."
npm run -s build
node scripts/copy-to-firetv.mjs
( cd firetv && ./gradlew -q assembleDebug )

echo "Installing and launching..."
adb -s "$IP:5555" install -r "$APK"
adb -s "$IP:5555" shell am start -n "$PKG/com.miloplay.tvbuddy.firetv.MainActivity"
echo "Milo is running on the TV. Logs: adb -s $IP:5555 logcat | grep -iE 'chromium|milo'"
