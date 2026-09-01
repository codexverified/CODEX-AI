# @codexverified/baileys

[![npm version](https://img.shields.io/npm/v/@codexverified/baileys.svg)](https://www.npmjs.com/package/@codexverified/baileys)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](#at-a-glance)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](#license-and-maintenance)
[![types](https://img.shields.io/badge/types-included-blue)](#at-a-glance)

> A readable, carefully maintained Baileys distribution for building reliable WhatsApp integrations with codexverified/baileys.

`@codexverified/baileys` is a Node.js and TypeScript library for creating WhatsApp automations over the Baileys protocol. It provides a socket-oriented API for authentication, messaging, media, interactive content, rich responses, newsletters, groups, communities, business features, account utilities, and carefully documented extensions.

The package is maintained by **Codex** under the **CodexVerified** organization. It is intended for developers who want a practical Baileys foundation with familiar interfaces, public TypeScript declarations, readable source code, explicit behavior, and room for carefully tested improvements.

## Table of contents

- [At a glance](#at-a-glance)
- [Installation](#installation)
- [Quick start](#quick-start)
- [CommonJS usage](#commonjs-usage)
- [Core capabilities](#core-capabilities)
- [Everyday message usage](#everyday-message-usage)
- [Rich menu example](#rich-menu-example)
- [Status, grids, tables, and flows](#status-grids-tables-and-flows)
- [Authentication and deployment guidance](#authentication-and-deployment-guidance)
- [Development workflow](#development-workflow)
- [Recent compatibility updates](#recent-compatibility-updates)
- [About Codex](#about-codex)
- [Package layout](#package-layout)
- [Security and responsible use](#security-and-responsible-use)
- [License and maintenance](#license-and-maintenance)
- [Compatibility additions](#compatibility-additions)
- [Comparison references](#comparison-references)
- [Additional functional compatibility helpers](#additional-functional-compatibility-helpers)
- [AI generation primitive](#ai-generation-primitive)

## At a glance

| Property | Value |
| --- | --- |
| Package | `@codexverified/baileys` |
| Version | `2.11.12` |
| Runtime | Node.js 20 or newer |
| Module format | ESM, with CommonJS compatibility where supported |
| Type declarations | Included at `lib/index.d.ts` |
| License | MIT, as declared by the package metadata |
| Maintainer | Codex |
| Entry point | `lib/index.js` |
| Repository | `https://github.com/codexverified/baileys` |

## Installation

| Method | Command | Notes |
| --- | --- | --- |
| From npm | `npm install @codexverified/baileys` | Standard install when published under your organization |
| From local archive | `npm install ./codex-baileys-2.11.12.tgz` | Place the `.tgz` beside your application |
| Source audit (no scripts) | `npm install --ignore-scripts` | Skips install hooks for local review |

Both npm and archive installs use the same import name:

```javascript
import { makeWASocket } from '@codexverified/baileys'
```

## Quick start

The following example creates a socket, stores multi-file authentication credentials, reconnects after an unexpected disconnect, and replies to incoming messages. Keep the session directory private and never commit it to a public repository.

```javascript
import {
  DisconnectReason,
  makeWASocket,
  useMultiFileAuthState
} from '@codexverified/baileys'
import P from 'pino'

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./session')

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' })
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('Connected with @codexverified/baileys')
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      if (statusCode !== DisconnectReason.loggedOut) {
        start().catch(console.error)
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages) {
      if (!message.message || message.key.fromMe) continue

      await sock.sendMessage(message.key.remoteJid, {
        text: 'Hello from @codexverified/baileys'
      })
    }
  })
}

start().catch(console.error)
```

## CommonJS usage

```javascript
const {
  makeWASocket,
  useMultiFileAuthState
} = require('@codexverified/baileys')
```

If your runtime or bundler does not support this interop path, use the ESM import form instead.

## Core capabilities

| Area | What it covers |
| --- | --- |
| Connections & authentication | WebSocket connection events, reconnect handling, browser identity configuration, pairing-code flows, connection state transitions |
| Auth persistence | Multi-file credentials, single-file state, SQLite-backed persistence (optional driver), cache-manager integrations |
| Messages & conversations | Text, mentions, replies, reactions, edits, deletions, forwards, polls, contacts, locations, events, group invitations, quoted messages, disappearing messages, view-once envelopes |
| Media & albums | Images, video, audio, documents, stickers, thumbnails, albums; sourced from URLs, local files, or buffers; optional `sharp` / `@napi-rs/image` / `jimp` image processing; GIF-style video playback |
| Interactive content | Buttons, lists, native flows, hydrated templates, carousel layouts, button grids |
| Rich content & previews | Code blocks, tables, inline entities, LaTeX-oriented content, link previews, structured response arrays |
| Rich menus (experimental) | Header image, row/carousel cards, stable button IDs, toast metadata, disclaimers, footer action |
| Groups & communities | Group creation, participant management, settings, metadata, invites, labels, community/subgroup relationships |
| Newsletters & channels | Channel metadata, follow/unfollow, posts, reactions, media, polls |
| Account, business & privacy | Profile/business helpers, product & catalog operations, privacy controls, username utilities, status publishing, favorites management |
| Storage & protocol utilities | In-memory and ordered-dictionary stores, cache-manager support, LID/phone-number resolution, event utilities, message normalization, media retry handling, TypeScript declarations |

## Everyday message usage

| Message type | Key options | Example |
| --- | --- | --- |
| Text | `text` | `sock.sendMessage(jid, { text: '...' })` |
| Media with caption | `image` / `video` / `audio` / `document`, `caption` | `sock.sendMessage(jid, { image: { url } , caption: '...' })` |
| GIF-style video | `video`, `gifPlayback: true` | `sock.sendMessage(jid, { video: { url }, gifPlayback: true })` |
| View-once media | `viewOnce: true` (also `viewOnceV2`, `viewOnceV2Extension`, `spoiler`) | `sock.sendMessage(jid, { image: { url }, viewOnce: true })` |
| Spoiler / view-once (new) | `mediaSpoilerMode: 'viewOnce' \| 'native'` | see below |

```javascript
await sock.sendMessage(jid, {
  text: 'A message from Codex'
})

await sock.sendMessage(jid, {
  image: { url: './media/photo.jpg' },
  caption: 'A photo message'
})

await sock.sendMessage(jid, {
  video: { url: './media/animation.mp4' },
  gifPlayback: true,
  caption: 'Animated media'
})

await sock.sendMessage(jid, {
  image: { url: './media/private-image.jpg' },
  caption: 'Open once',
  viewOnce: true
})

await sock.sendMessage(jid, {
  video: { url: './media/clip.mp4' },
  caption: 'View-once video',
  mediaSpoilerMode: 'viewOnce'
})

await sock.sendMessage(jid, {
  image: { url: './media/hidden-preview.jpg' },
  mediaSpoilerMode: 'native'
})
```

`mediaSpoilerMode` is an additional, opt-in path for supported image, video, document, or sticker media:

| Value | Effect |
| --- | --- |
| `viewOnce` | Wraps supported media in a view-once envelope |
| `native` | Applies the native spoiler context flag |

The existing `viewOnce`, `viewOnceV2`, `viewOnceV2Extension`, and `spoiler` options remain supported and take precedence over `mediaSpoilerMode` when explicitly set.

## Rich menu example

```javascript
await sock.richMenu(jid, {
  header: {
    title: 'Codex Menu',
    image: {
      url: 'https://example.com/menu.jpg',
      mime_type: 'image/jpeg'
    }
  },
  body: {
    row: true,
    carousel: false,
    cards: [
      {
        title: 'Account',
        buttons: [
          { id: 'profile', text: 'Profile' },
          { id: 'settings', text: 'Settings' }
        ]
      },
      {
        title: 'Support',
        buttons: ['help', 'contact']
      }
    ]
  },
  footer: {
    text: 'Codex Technology',
    url: 'https://example.com'
  }
})
```

| Rich menu field | Purpose |
| --- | --- |
| `header` | Optional title and image shown above the menu |
| `body.row` / `body.carousel` | Layout mode for the cards |
| `body.cards` | Rows of stable button IDs and labels |
| `footer` | Text plus an optional action URL |

## Status, grids, tables, and flows

| Helper | Purpose |
| --- | --- |
| `sendStatus` | Post a status update, optionally with mentions via `statusJidList` |
| `sendRichButtonGrid` | Send a card grid of stable-ID buttons |
| `sendInteractiveTable` | Send tabular content with headers, rows, and action buttons |
| `sendWhatsAppFlow` | Launch a published WhatsApp Flow |

```javascript
await sock.sendStatus({ text: 'New Codex status' }, {
  statusJidList: ['1234567890@s.whatsapp.net']
})

await sock.sendRichButtonGrid(jid, {
  text: 'Choose an option',
  cards: [{
    title: 'Actions',
    buttons: [
      { id: 'first_action', text: 'First action' },
      { id: 'second_action', text: 'Second action' }
    ]
  }]
})

await sock.sendInteractiveTable(jid, {
  title: 'Plans',
  headers: ['Name', 'Price'],
  rows: [['Basic', '$5'], ['Pro', '$10']],
  buttons: [{ id: 'choose_pro', text: 'Choose Pro' }],
  footer: 'Select a plan'
})

await sock.sendWhatsAppFlow(jid, {
  text: 'Open the form',
  flowId: 'your-flow-id',
  flowToken: 'your-flow-token',
  flowName: 'your-flow-name',
  flowAction: 'navigate',
  flowActionPayload: { screen: 'WELCOME' }
})
```

These helpers are protocol- and client-dependent. Use graceful fallbacks when an application serves a wide range of WhatsApp client versions.

## Authentication and deployment guidance

| Practice | Detail |
| --- | --- |
| Session privacy | Keep the session directory private and excluded from version control |
| Access control | Use a dedicated service account or restricted filesystem permissions where possible |
| Secrets handling | Do not place access tokens, private keys, phone numbers, or personal account data in the README, package archive, or a public repository |
| Dependency pinning | Pin dependencies with a lockfile for production deployments |
| Runtime | Use a supported Node.js runtime |
| Connection handling | Monitor connection events; handle logout separately from recoverable disconnects; avoid uncontrolled parallel sockets on reconnect |

## Development workflow

```bash
npm test
```

Before submitting changes, validate ESM syntax, CommonJS compatibility where applicable, generated protocol files, and the declarations in `lib/index.d.ts`. Keep package metadata, exports, runtime requirements, and documentation synchronized. When a protocol behavior is experimental, document the fallback behavior and the client versions used during testing.

## Recent compatibility updates

| Update | Detail |
| --- | --- |
| Album association fix | Album child messages use association type `1`, the compatible child-association wire value, rather than treating the `MEDIA_ALBUM` message category as the association value |
| View-once preserved | Explicit view-once implementations remain unchanged |
| `mediaSpoilerMode` | New opt-in path for a view-once envelope or native spoiler flag, without altering existing defaults |

## About Codex

This package is built and maintained by **Codex**, also known as **Dev Codex**. Codex is a developer from Nigeria who focuses on practical, accessible, and reliable software projects across the JavaScript and TypeScript ecosystem.

| | |
| --- | --- |
| Tech stack | JavaScript, HTML, TypeScript, Node.js, GitHub, Baileys, APIs, key-value stores |
| Project types | Application development, websites, WhatsApp bots, Telegram bots, API endpoints, games |
| Telegram | [@codexverified](https://t.me/codexverified) |
| Email | codexauthorized@gmail.com |

The developer's work is driven by a commitment to learning, experimentation, clear documentation, and useful software that developers can understand and extend. This package reflects that commitment through its readable source, public declarations, practical examples, and emphasis on responsible automation.

## Package layout

| Path | Contents |
| --- | --- |
| `lib/` | JavaScript implementation, supporting utilities, public TypeScript declarations |
| `WAProto/` | Generated WhatsApp protocol definitions |
| `engine-requirements.js` | Installation-time runtime checks |
| `package.json` | Package metadata, scripts, dependencies, exports |
| `README.md` | User-facing installation and usage guide |

## Security and responsible use

This library interacts with WhatsApp accounts and user communications.

| Guideline | Detail |
| --- | --- |
| Authorization | Use only with accounts and data you are authorized to control |
| Compliance | Respect WhatsApp's terms, applicable law, and message participants' privacy expectations |
| Messaging conduct | Avoid unsolicited messaging |
| Credential safety | Protect authentication state and never commit session files, tokens, private keys, or personal data to a public repository |
| Media access | Limit access to stored media |
| Transparency | Provide clear notice when an application performs automated actions |
| Dependency review | Review installation scripts and optional dependencies before deploying to production; use pinned versions for repeatable builds |

## License and maintenance

This distribution is provided under the license declared in `package.json` and the accompanying license file. Review those terms before redistributing or combining this package with third-party code.

**@codexverified/baileys is built and maintained by Codex under the CodexVerified organization.** Contributions, bug reports, and carefully documented improvements are welcome through the project repository.

## Compatibility additions

The current source includes several independently implemented compatibility helpers identified during comparison with the published upstream package. These additions preserve the Codex package identity and do not copy package-specific attribution enforcement or remote licensing checks.

### Copy-to-clipboard rich response

`sendCopyButton` creates a forwarded GenAI-style rich response with a copy-to-clipboard addon action.

| Option | Purpose |
| --- | --- |
| `text` | The content that gets copied |
| `label` | Optional visible button text |
| `alignment` | `END`, `START`, or `CENTER` |

```javascript
await sock.sendCopyButton(jid, {
  text: 'npm install @codexverified/baileys',
  label: 'Copy install command',
  alignment: 'END'
})
```

As with other private or experimental WhatsApp rich-response layouts, clients may fall back to plain rendering or ignore the addon action.

### Slot-machine HTML generator

`generateSlotMachineHtml` produces a self-contained five-reel Fruit Bonanza game with adjustable starting credits. It is a standalone HTML payload and performs no network requests.

| Option | Purpose |
| --- | --- |
| `title` | Display title for the generated page |
| `startingCredits` | Initial credit balance |

```javascript
import { generateSlotMachineHtml } from '@codexverified/baileys'

const html = generateSlotMachineHtml({
  title: 'Codex Fruit Bonanza',
  startingCredits: 500
})
```

The generator does not by itself send HTML through WhatsApp. Applications should only use an HTML-capable message primitive when that primitive is available and authorized for their deployment.

### Optional ban-status checker

`checkStatusWA` is an explicit, caller-invoked diagnostic helper. It is never called during installation, socket creation, reconnection, or message sending. The endpoint is configurable, credentials are not embedded, and callers should review the endpoint's terms and privacy implications before sending a phone number.

```javascript
import { checkStatusWA } from '@codexverified/baileys'

const result = await checkStatusWA('+447700900123', {
  diagnostic: true
})
console.log(result.status) // active, banned, blocked, not_registered, rate_limited, or unknown
```

| Status value | Meaning |
| --- | --- |
| `active` | Number appears active on WhatsApp |
| `banned` | Number appears banned |
| `blocked` | Number appears blocked |
| `not_registered` | Number is not registered on WhatsApp |
| `rate_limited` | Check was rate limited |
| `unknown` | Status could not be determined |

This helper is not an anti-ban guarantee, does not bypass enforcement, and should not be used for bulk enumeration or unsolicited checking.

## Comparison references

The feature comparison was based on the published package metadata and documentation available from [npm][1] and the independent package analysis page at [Socket][2]. The Codex implementation adds compatible behavior through readable, package-owned code rather than copying upstream-specific integrity, attribution, or remote-verification mechanisms.

[1]: https://www.npmjs.com/
[2]: https://socket.dev/

## Additional functional compatibility helpers

The source also exposes portable helpers for native-flow responses, view-once inspection, rich content preparation, HTML payload construction, and website previews. These are functional compatibility APIs only; package-specific identity checks, attribution enforcement, remote license gates, trusted-channel auto-follow behavior, and other ownership structures are not included.

| Helper | Purpose |
| --- | --- |
| `parseNativeFlowResponse` | Normalize quick-reply, single-select, and Flow response envelopes |
| `parseWhatsAppFlowResponse` | Return only responses identified as WhatsApp Flow responses |
| `buildWhatsAppFlowButton` / `makeWhatsAppFlowButton` | Build published Flow button parameters for a caller-owned Flow ID and token |
| `prepareRichTextMessage` | Build a forwarded rich text response |
| `prepareRichImageMessage` | Build a forwarded rich image response |
| `prepareRichLinkMessage` | Build a forwarded response with inline link entities |
| `prepareRichGenerationMessage` | Build a rich response from caller-provided rich content |
| `prepareHtmlMessage` | Build an HTML primitive payload for clients that support the experimental structure |
| `prepareSlotMachineMessage` | Wrap the local slot-machine generator as an HTML message payload |
| `generateLinkPreviewHtml` / `generateWebsitePreviewHtml` | Create escaped link cards or an explicitly requested metadata preview |
| `parseViewOnceInfo` and related helpers | Inspect, download, reconstruct, and apply explicit view-once policies |

All networked helpers are opt-in. Website previews fetch only when explicitly called, and Flow helpers require credentials and identifiers owned by the application. Experimental WhatsApp layouts remain client-dependent and should always have a plain-text fallback.

## AI generation primitive

`buildImaginePrimitive` creates the Meta-style AI image or animation generation-state payload used by rich responses. It is a pure payload builder — it does not call a generation service itself, generate media, or send anything on its own; callers wire it up to whatever AI generation backend they use, then pass the resulting primitive into a rich-response message.

| Field | Purpose |
| --- | --- |
| `state` | Generation status: `GENERATING`, `COMPLETE`, or `ERROR` |
| `mediaUrl` | URL of the generated media
