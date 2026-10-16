# Android profile sheets and chat keyboard

The Android development app uses native form sheets for Bot and group profiles, Android nested scrolling for their lists, and keyboard-frame animation for the chat composer. iOS keeps its existing form-sheet grabber and keyboard implementation.

## Sub-features

- `profile-scroll` scrolls profile content back toward its top before a downward gesture moves the expanded sheet.
- `profile-handle` keeps a visible handle above the list. Dragging it dismisses the sheet; its accessible Close action dismisses it too.
- `chat-keyboard` moves the composer through intermediate positions during the native keyboard animation and keeps it above the final IME bounds.

## How to get to it (user POV)

- Open a Bot DM or group Channel from Chats, then tap its title to open the profile. Expand the sheet, scroll its content, and drag down within the list. Drag the fixed top handle to close.
- Open the chat again and focus the message input. Watch its movement while the keyboard opens and closes.

## Driving it with verify-app

Use the designated [shared Windows Android runner](../../../../docs/agents/android-device-qa.md), with a matching active lease, a native development build containing `react-native-keyboard-controller`, Metro, and an isolated paired Host. Seed a QA Bot through the CLI. Do not use a Human's private conversation as test data. A model is unnecessary for these gestures; a real reply must be checked separately when claiming chat/model functionality.

Open the designated QA chat with its keyboard hidden, then run:

```powershell
node scripts/e2e-mobile-android-interactions.mjs --serial <serial> --owner <task> --batch <batch> --title "QA Bot name" --mode profile --label profile
node scripts/e2e-mobile-android-interactions.mjs --serial <serial> --owner <task> --batch <batch> --title "QA Bot name" --mode keyboard --label keyboard
```

The profile journey opens the title button, checks the fixed handle, expands and scrolls beyond the profile header, then asserts that a small downward content drag leaves the sheet's native bounds unchanged. It finally drags the handle and checks that the chat input returns. The profile must contain enough content to scroll beyond its header; do not count a short non-scrolling sheet as a pass. Repeat the path in a seeded group to qualify the group surface independently.

The keyboard journey requires `ffmpeg` on PATH and the dark portrait QA theme. It captures a five-second native screen recording, focuses the empty composer, checks the final input bounds against the real Android IME, and tracks the composer fill at 30 fps. It fails `COMPOSER_JUMPS` when the movement has fewer than four intermediate positions or one frame contains at least half the travel. Keep the theme, IME, viewport, draft and frame rate fixed across A/B runs. Read the MP4 too: the bounded pixel check detects a jump and final overlap, not every possible timing defect.

## Gotchas

PNG/XML, MP4 and JSON proof stay in the batch's machine-local evidence directory. The script refuses capture on a pairing-link screen. It does not create a Host, change a model, send a message, erase storage, or prove iOS behavior, notifications or background delivery.

Android accessibility can include the dimmed chat behind the sheet. Check the title within the sheet list bounds. The keyboard pixel detector samples unused input space beside the microphone; placeholder glyphs must not stand in for composer movement. A missing or obscured composer still fails the motion check.
