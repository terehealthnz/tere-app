# Mobile App Build & Release — Tere Health

The mobile apps for terehealth.co.nz are Capacitor wrappers around the same React SPA that runs on the web. The app bundles the built `dist/` locally, so it works offline and boots instantly. Every prod release cuts a new native build and submits to Apple App Store + Google Play.

- Bundle ID: **co.nz.terehealth.app**
- App Name: **Tere Health**
- Native shell: `ios/` + `android/` (committed to repo)
- Capacitor config: `capacitor.config.json`
- Native push wiring: `src/lib/push.js` + `src/components/patient/WaitingRoom.jsx`

## Prerequisites (one-time)

**macOS host required** for iOS builds.

```bash
# Xcode from App Store (~30 GB, includes iOS Simulator)
# Then:
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer

# CocoaPods
brew install cocoapods

# Android Studio (either from https://developer.android.com/studio
# or via brew):
brew install --cask android-studio

# Apple Developer account: https://developer.apple.com/programs — US$99/yr
# Google Play Console:     https://play.google.com/console — US$25 one-time
```

## Everyday workflow

```bash
# After any React code change, rebuild + push into both platforms:
npm run app:sync

# Open iOS project in Xcode (build/run/archive there):
npm run app:ios

# Open Android project in Android Studio:
npm run app:android
```

`npm run app:sync` runs `vite build` → `cap sync`, which copies `dist/` into `ios/App/App/public/` and `android/app/src/main/assets/public/`, and updates any plugin bindings.

## Cutting a release

### iOS (TestFlight → App Store)

1. `npm run app:ios` — opens Xcode
2. Xcode → target `App` → General → bump **Version** (e.g. 1.0.1) and **Build** (e.g. 12)
3. Product → Scheme → Edit Scheme → Build Configuration = **Release**
4. Product → Archive
5. In the Organizer window that opens: Distribute App → App Store Connect → Upload
6. In App Store Connect (appstoreconnect.apple.com): assign the new build to a TestFlight group for internal testing, then Submit for Review

### Android (Play Internal Testing → Production)

1. `npm run app:android` — opens Android Studio
2. Bump `versionCode` (integer) + `versionName` in `android/app/build.gradle`
3. Build → Generate Signed App Bundle → `.aab`
4. In Play Console (play.google.com/console): create a new release in Internal Testing, upload the `.aab`, roll to Production when validated

## Icons & splash

Both platforms currently ship with default Capacitor icons. To replace:

- **iOS**: drop 1024×1024 PNG into `ios/App/App/Assets.xcassets/AppIcon.appiconset/` (use Xcode's asset catalogue tool for the smaller sizes)
- **Android**: put icons in `android/app/src/main/res/mipmap-*/ic_launcher.*` (or use Android Studio → Image Asset wizard)
- Splash: `ios/App/App/Assets.xcassets/Splash.imageset/` and `android/app/src/main/res/drawable*/splash.png`

Or generate everything from a single source with `npx @capacitor/assets generate` (add `@capacitor/assets` first).

## Push notifications

Native push is wired via `src/lib/push.js`. On first launch, `WaitingRoom.jsx` calls `PushNotifications.requestPermissions()` and registers the device with our server.

- **iOS**: needs an APNs key (Apple Developer → Certificates → Keys → Apple Push Notifications) linked to the app ID
- **Android**: needs Firebase. `GoogleService-Info.plist` (iOS) and `google-services.json` (Android) already exist in the repo; regenerate from Firebase console if the project changes

## App Store review — health/medical considerations

Tere is a medical adjacent app. Apple's App Review Guidelines Section 1.4 (Medical) and 5.1.1 (Privacy) apply. Key items to nail in the reviewer notes:

- **rPPG vitals**: describe as "patient-facing measurement, not diagnostic. WAND-registered under Medsafe. Clinician reviews readings in consult." Cite the WAND certificate.
- **Privacy policy URL**: point to https://terehealth.co.nz/privacy (must be public + reachable without login)
- **Demo account**: create a reviewer account with pre-populated demo data. Include credentials in reviewer notes.
- **Data collection disclosure**: match the health data types declared on App Store Connect to what the app actually collects (name, DOB, NHI, symptoms, video, vitals).
- **Backend hosting**: mention AWS Sydney (BAA-covered).

Apple has rejected similar telehealth apps for insufficient regulator citations. Include the HDC + Privacy Act + HISO 10029 evidence in the reviewer notes. If Apple rejects on the rPPG feature, the fallback is a runtime flag that disables the vitals card on iOS (server-driven, no re-submit needed).

## Google Play — extras

- Data Safety declaration: match the same data types disclosed above
- Health & Fitness category: complete the extra questionnaire truthfully
- Target audience: adults 18+ (unless we're publishing the child-safeguarding pathway to consumers, which we're not)

## Local testing without a build

For quick iteration without going through Xcode/Android Studio:

- **iOS Simulator**: `npx cap run ios` (requires Xcode installed)
- **Android emulator**: `npx cap run android` (requires an AVD configured in Android Studio)
- **Real device (dev)**: enable USB debugging (Android) or trust the dev cert (iOS), then Run in Xcode/Android Studio

## Fallback: hosted mode

If we later want deploys to update the app instantly (bypassing App Store review latency for content-only changes), uncomment the `server.url` block in `capacitor.config.json` and re-run `npx cap sync`. Note: Apple's Guideline 4.7 requires the app to still offer meaningful native functionality (push, camera, biometrics — we already do), and reviewers sometimes push back on "web-only wrappers."
