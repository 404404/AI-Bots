# iOS scroll edge element

This local Expo module lets a floating React Native view take part in UIKit's
scroll edge effect on iOS 26, the way a system toolbar does. It wraps its
children in a view that carries a `UIScrollEdgeElementContainerInteraction`
for the nearest sibling scroll view, so UIKit draws the soft edge under it. UIKit shapes that edge when the
interaction is added, so the `revision` prop re-adds it whenever the
container's height or the keyboard changes.

The chat composer uses it for the bottom edge; the native header already gives
the top edge. Before iOS 26 the view is a plain container.

The JavaScript binding lives in `src/ui/primitives/scroll-edge-element.ios.tsx`.
Builds without this module keep the drawn `EdgeMaterial` fade. **Adding this
module requires a native rebuild**; an OTA update alone cannot install it.
