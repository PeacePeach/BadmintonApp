# Branching

| Branch | Purpose |
| --- | --- |
| `main` | Release code only: what is on TestFlight / the App Store. Never commit features here. |
| `develop` | The next version. All new work lands here first. |
| `feature/<name>`, `fix/<name>` | Short-lived. Branch from `develop`, PR back into `develop`. |
| `hotfix/<name>` | Urgent fix for the released build. Branch from `main`, PR into `main`, then merge or cherry-pick into `develop`. |

**Day to day:** `develop` → `feature/focus` → PR → `develop`.

**Release** (only when the owner says the version is ready): final regression test on `develop` → PR `develop` → `main` → merge → tag (`vX.Y.Z-buildN`) → build / archive / TestFlight. Being ahead of `main` is not a reason to release.

**Hotfix:** `main` → `hotfix/<name>` → PR → `main` → tag → bring the same fix into `develop` so the next version keeps it.

## Preparing an iOS build

The Capacitor iOS project lives on the release Mac, not in this repo. On that Mac, run:

```sh
curl -fsSL https://raw.githubusercontent.com/PeacePeach/BadmintonApp/develop/scripts/prepare-ios-release.sh | bash -s -- --require <commit>
```

It updates a local checkout of `develop`, copies `project/` into the Capacitor project's `webDir` (backing it up first), runs `npx cap sync ios`, checks that Bundle ID, version, build number and signing did not change, and makes sure Simplified Chinese is declared. It also installs `@capacitor-community/speech-recognition` (voice input; WKWebView has no working Web Speech API) and adds the microphone and speech recognition permission texts to Info.plist if they are missing. Add `--cap "<folder with capacitor.config>"` if it can't find the project. Then raise the build number, archive and upload in Xcode. See `scripts/prepare-ios-release.sh` for details.
