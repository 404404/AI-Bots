# Android predictive back: SDK58 compatibility

The reference is an intra-app predictive transition: the outgoing page scales/rounds while revealing the previous stack page, with reversible cancellation. A system back-to-home animation alone does not satisfy it.

## Official support and current app

- [Expo SDK58 ExperimentalStack](https://docs.expo.dev/versions/v58.0.0/sdk/router/experimental-stack/) supports predictive back with `android.predictiveBackGestureEnabled=true`, but is Alpha/testing-only. Its documented options cover title and basic header visibility. It does not support modal/form-sheet presentation or custom headers. Android cannot mix it with standard Stack.
- [Android migration guide](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture) separates system transitions from application-owned progress/cancel/commit handling.
- [Screens maintainer discussion](https://github.com/software-mansion/react-native-screens/discussions/2540) explains the v4 synchronous fragment-transaction constraint.

Local SDK58 pins Expo Router58.0.23 and screens4.30.0. Router's installed `ExperimentalStackView.js` exposes only four supported option keys and renders `StackV5.Host`; the standard application renders `Stack` in root and nested layouts. The generated installed Android manifest explicitly disables OnBackInvokedCallback. Root profiles/settings require formSheet, remote views require fullScreenModal, and SheetStack requires a custom header.

## Decision and next qualification gate

Keep the stable stack for this navigation-island slice. A manifest opt-in alone cannot deliver the requested previous-page preview. Do not silently replace the accepted sheet behavior with ordinary pushes or add a second JavaScript route stack.

Re-evaluate when ExperimentalStack supports the required presentation/header options and Android coexistence, or a stable successor supports the entire app. Then change CNG configuration, rebuild the native client, and qualify chat/notification links, nested settings, full-screen remote views, keyboard-first back, left/right-edge cancellation, one-pop completion and background/resume. Check both gesture and three-button navigation; keep iOS unchanged. Migration is not shipped or claimed here.
