# Cloud navigation and sharing

User-confirmed direction, issue [#2161](https://github.com/BotHarness/DeepSeekBot/issues/2161). This document describes the target UX; the first implementation only marks existing direct-cloud channel titles. UAT only; no merge or Prod.

## Channel identity

Place an outline cloud glyph directly after a cloud channel's displayed name in the channel list and conversation header. Keep the name as text, allow wrapping/ellipsis according to its existing surface, reserve glyph space and announce "Cloud channel" to assistive technology. Cloud identity is stable provenance, not presence, connectivity, subscription status or an unread indicator. Disconnection does not remove the mark.

A local group with mirrored external messages is still a local group. Its cloud connection can be shown separately, but neither the last author nor presence of a cloud-origin message proves remote channel ownership. Desktop list/header need the same authoritative origin projection before using the cloud-channel mark. Do not rename stored channel names or append a Unicode symbol to API data.

## One left sheet, two kinds of destination

Reuse the native app's existing left sheet. Group destinations into Computers and Cloud workspaces. Computer entries retain current Host connection/switching behavior. Cloud entries use the cloud instance and organization as their identity; selecting one filters channels through the cloud service and does not require a local Host.

A cloud organization entry may represent full membership or access to only one or more invited channels. Both show the organization name/icon. Channel guests are labeled "Guest" and see only granted channels; they cannot list other channels, members, organization settings, or create channels. An organization icon is a navigation aid, not proof of membership. Server authorization enforces this before returning data. If a user has both membership and a direct grant, show one organization entry; removing membership must recompute access from the remaining grants.

Use `(instanceId, organizationId)` keys so identical names across self-hosted services do not collide. Show the service domain in details or when names collide. Keep selected cloud destination separate from selected local Host. No channel-only guest is auto-promoted into an organization.

## Create, share, join

Organization creation leads to its channels and a Share organization action. Channel creation opens the conversation with Share channel. Existing destinations expose the same actions in their details/menu. Sharing uses one sheet with a visible target and scope:

| Scope        | Recipient gets                                                                   |
| ------------ | -------------------------------------------------------------------------------- |
| Organization | Organization membership and its ordinary channels, subject to role/history rules |
| Channel      | Only the selected channel; organization identity for navigation                  |

The sheet offers Copy invitation link, Show QR code and Save QR image. These are representations of the same invitation. A resource URL is not an invitation and cannot grant access. Invitation expiry, revocation and any recipient restrictions are server-owned. Existing email-bound invitations remain email-bound unless a separate scoped share-link capability is deliberately introduced; displaying an invitation ID as a URL must not bypass that rule.

The recipient opens the link/scans → sees service domain, organization/channel and access scope → trusts/selects the instance → signs in to that instance → explicitly accepts → lands in the destination. Never send existing credentials to a server solely because its address appeared in a QR code. QR content never contains administrator, WorkOS or Agent credentials. Unknown/expired/revoked/wrong-account invitations show actionable failure and do not partially join.

## Delivery order

1. Cloud name marks on actual direct-cloud list/title surfaces, with accessible name and assigned device evidence. Desktop gets the same mark only when its origin projection is authoritative.
2. Existing left sheet lists cloud organizations including channel guests. Actual user A invites B only to channel X; B sees the organization entry and X, cannot fetch sibling Y through UI or CLI. Revoke X and refresh removes that destination when no grants remain.
3. Owner creates a channel → shares an invitation URL/QR → a second account accepts → both see the same channel. Add equivalent CLI/API and retry/revocation checks. Preserve existing default join-history and local Bot execution boundaries.
4. Save/share QR natively, deep-link cold launch, long names, duplicate service names, offline states, light/dark and large text; qualify iOS and Android separately.

The current cloud collaboration goal remains active. This UX work does not claim WebSocket, organization-wide Agent membership, arbitrary local work or enterprise authorization to be complete.
