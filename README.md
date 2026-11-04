# Userscripts

My browser userscripts, published on [Greasy Fork](https://greasyfork.org/en/users/567951-stuart-saddler).

The initial imports preserved the Greasy Fork downloads exactly, including their versions and metadata. A source-location comment was then added to each script to verify automatic synchronization; behavior and versions were unchanged. This repository includes the public scripts and additional unlisted scripts supplied by the author for public hosting. Install from the existing Greasy Fork listings to keep receiving updates through Greasy Fork.

## Scripts

| Script | Initial/imported version | Source | Greasy Fork |
| --- | --- | --- | --- |
| Reddit Advanced Content Filter | 3.1.0 | [reddit-advanced-content-filter.user.js](reddit-advanced-content-filter.user.js) | [Listing](https://greasyfork.org/en/scripts/516666) |
| Remove Disable Adblock Nag Screen on 1mov.lol | 1.5 | [remove-disable-adblock-nag-screen.user.js](remove-disable-adblock-nag-screen.user.js) | [Listing](https://greasyfork.org/en/scripts/513207) |
| Bluesky Content Manager | 3.5.2 | [bluesky-content-manager.user.js](bluesky-content-manager.user.js) | [Listing](https://greasyfork.org/en/scripts/518614) |
| Bluesky Multi-Column | 1.7 | [bluesky-enhanced-layout.user.js](bluesky-enhanced-layout.user.js) | [Listing](https://greasyfork.org/en/scripts/520439-bluesky-multi-column) |
| Bluesky Unified Block & Hide | 1.2 | [bluesky-unified-block-hide.user.js](bluesky-unified-block-hide.user.js) | [Listing](https://greasyfork.org/en/scripts/522022) |
| DeepSeek Wide Mode | 1.1 | [deepseek-wide-mode.user.js](deepseek-wide-mode.user.js) | [Listing](https://greasyfork.org/en/scripts/524537) |
| Anime News Network Layout Fix | 1.1 | [anime-news-network-layout-fix.user.js](anime-news-network-layout-fix.user.js) | [Listing](https://greasyfork.org/en/scripts/530579) |
| ReadTheory: Proficiency Leaderboard | 1.1 | [readtheory-proficiency-leaderboard.user.js](readtheory-proficiency-leaderboard.user.js) | [Listing](https://greasyfork.org/en/scripts/557056) |
| Reddit Floating Back Button | 1.0 | [reddit-floating-back-button.user.js](reddit-floating-back-button.user.js) | [Listing](https://greasyfork.org/en/scripts/574640) |
| ReadTheory Average Grade Level Calculator (Past 10 Quizzes) | 1.16 | [readtheory-average-grade-level-calculator.user.js](readtheory-average-grade-level-calculator.user.js) | [Listing](https://greasyfork.org/en/scripts/514010) |
| Inoreader Feed Manager with Whitelist and Enhanced URL Filtering (Debug Version) | 2.9 | [inoreader-feed-manager.user.js](inoreader-feed-manager.user.js) | [Listing](https://greasyfork.org/en/scripts/522378) |
| Reddit Sidebar Cleaner + Content Expander | 1.3 | [reddit-sidebar-cleaner-content-expander.user.js](reddit-sidebar-cleaner-content-expander.user.js) | [Listing](https://greasyfork.org/en/scripts/531104) |
| Reddit Advanced Content Filter (Beta) | 3.8 | [reddit-advanced-content-filter-beta.user.js](reddit-advanced-content-filter-beta.user.js) | [Listing](https://greasyfork.org/en/scripts/542298) |
| 1337x Enhancements + Ratings | 2026.10.23.1 | [1337x-enhancements-ratings.user.js](1337x-enhancements-ratings.user.js) | [Listing](https://greasyfork.org/en/scripts/546143) |
| Knowt Flashcards - Printable Double-Sided | 1.2.0 | [knowt-flashcards-printable-double-sided.user.js](knowt-flashcards-printable-double-sided.user.js) | [Listing](https://greasyfork.org/en/scripts/584409) |
| ReadWorks Book of Knowledge - Comment Exporter | 1.6.0 | [readworks-book-of-knowledge-comment-exporter.user.js](readworks-book-of-knowledge-comment-exporter.user.js) | [Listing](https://greasyfork.org/en/scripts/584410) |
| ReadWorks Response Assessor v3 | 3.3.20 | [readworks-response-assessor-v3.user.js](readworks-response-assessor-v3.user.js) | [Listing](https://greasyfork.org/en/scripts/589898) |
| Gmail Clear Conversations | 0.4.1 | [gmail-clear-conversations.user.js](gmail-clear-conversations.user.js) | [Listing](https://greasyfork.org/en/scripts/602917) |
| Reddit Multi-Column Robust (unlisted) | 2026.11.2.2 | [reddit-multi-column-robust.user.js](reddit-multi-column-robust.user.js) | [Listing](https://greasyfork.org/en/scripts/603358) |

## AI test editions — GitHub only

These separate editions use Liquid Ultra for topic filtering and Gemini 2.5 Flash-Lite for optional picture scanning, with Preview/Hide actions and review history. They retain the original filters and whitelist overrides. New installations start with AI disabled; configure your own OpenRouter key and topics. Keys stay in userscript-manager storage and are excluded from settings exports. Disable the original filter for that site while testing its AI edition.

| Script | Version | Source |
| --- | --- | --- |
| Reddit Advanced Content Filter AI | 0.1.2 | [reddit-advanced-content-filter-ai.user.js](reddit-advanced-content-filter-ai.user.js) |
| BlueSky Content Manager AI | 0.1.9 | [bluesky-content-manager-ai.user.js](bluesky-content-manager-ai.user.js) |

When picture analysis is enabled, Gemini receives eligible pictures and returns descriptions; Liquid receives the post text and those descriptions, applies topic exceptions, and makes the final filtering decision. Gemini receives no original post text or user topics, and Liquid receives no image data. Both stages use the existing OpenRouter key and count toward the existing daily limits. The key must permit both models. Failed or incomplete scans keep posts visible. Updating preserves saved preferences and credentials; the existing picture toggle controls Gemini.

Reddit AI v0.1.2 fixes repeated AI requests after returning to a feed when Reddit's account header is unavailable. The fallback identity now survives navigation and reloads in the same tab. Saved decisions remain bounded to 1,000 entries and seven days; changed content or topics require a new check. Identified accounts remain separate, and unidentified independent tabs use separate identities. When tab storage is blocked, the fallback lasts only for the current document.

Greasy Fork publication is on hold. This upload does not create or relist either AI edition there. The original non-AI scripts and their synchronization remain unchanged. These are testing builds; model decisions can be wrong, and enabled AI sends eligible post content to OpenRouter and its provider.

## Greasy Fork synchronization

The Greasy Fork listings in the tables are connected to their matching raw files on `main` and use **Webhook** syncing. The active GitHub webhook sends push events as JSON with SSL verification enabled. Its secret is stored in the services, outside this repository.

Verified on November 1, 2026: GitHub's signed ping and a push touching all 18 scripts received HTTP 200 responses. Greasy Fork reported every script updated and no failures. Every resulting Greasy Fork download matched its GitHub source byte for byte, and all versions were preserved. No Greasy Fork listing visibility settings were changed.

Added November 2, 2026: Reddit Multi-Column Robust is **unlisted** on Greasy Fork, with public source in this repository. It uses the same source-sync connection and webhook. Its userscript metadata points installed copies to Greasy Fork for updates; script identity and behavior are preserved.

Updated November 2, 2026: **Bluesky Multi-Column** replaces the former Bluesky Enhanced Layout code on existing listing **520439**. The stable source filename remains `bluesky-enhanced-layout.user.js`, preserving its webhook connection. Release **2026.11.2.2** imports the current Greasy Fork implementation and keeps its script identity, update links, credits, and MIT license. Future changes should be made in this GitHub file so the existing webhook can publish them to Greasy Fork.

The table below records the configured source URLs. To reconnect a listing, open **Admin > Source Syncing**, enter its matching raw URL, choose **Manual** while setting up, and select **Update and sync now**. Use the existing listing so its history, feedback, and installation links stay together.

| Script | Raw URL for Source Syncing |
| --- | --- |
| Reddit Advanced Content Filter | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/reddit-advanced-content-filter.user.js) |
| Remove Disable Adblock Nag Screen on 1mov.lol | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/remove-disable-adblock-nag-screen.user.js) |
| Bluesky Content Manager | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/bluesky-content-manager.user.js) |
| Bluesky Multi-Column | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/bluesky-enhanced-layout.user.js) |
| Bluesky Unified Block & Hide | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/bluesky-unified-block-hide.user.js) |
| DeepSeek Wide Mode | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/deepseek-wide-mode.user.js) |
| Anime News Network Layout Fix | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/anime-news-network-layout-fix.user.js) |
| ReadTheory: Proficiency Leaderboard | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/readtheory-proficiency-leaderboard.user.js) |
| Reddit Floating Back Button | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/reddit-floating-back-button.user.js) |
| ReadTheory Average Grade Level Calculator (Past 10 Quizzes) | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/readtheory-average-grade-level-calculator.user.js) |
| Inoreader Feed Manager with Whitelist and Enhanced URL Filtering (Debug Version) | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/inoreader-feed-manager.user.js) |
| Reddit Sidebar Cleaner + Content Expander | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/reddit-sidebar-cleaner-content-expander.user.js) |
| Reddit Advanced Content Filter (Beta) | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/reddit-advanced-content-filter-beta.user.js) |
| 1337x Enhancements + Ratings | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/1337x-enhancements-ratings.user.js) |
| Knowt Flashcards - Printable Double-Sided | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/knowt-flashcards-printable-double-sided.user.js) |
| ReadWorks Book of Knowledge - Comment Exporter | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/readworks-book-of-knowledge-comment-exporter.user.js) |
| ReadWorks Response Assessor v3 | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/readworks-response-assessor-v3.user.js) |
| Gmail Clear Conversations | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/gmail-clear-conversations.user.js) |
| Reddit Multi-Column Robust (unlisted) | [Raw source](https://raw.githubusercontent.com/thepick/userscripts/main/reddit-multi-column-robust.user.js) |

To recreate the webhook if needed, open [Greasy Fork webhook setup](https://greasyfork.org/en/users/webhook-info) while signed in. In this repository, open **Settings > Webhooks > Add webhook**. Copy the payload URL and secret from Greasy Fork, use `application/json`, choose **Just the push event**, leave **Active** checked, and keep SSL verification enabled. Keep the secret out of this repository.

The first matching webhook changes a script's sync type to **Webhook**. This has been verified for every script above. For future releases, check GitHub's webhook delivery response and Greasy Fork's published code and version.

## Future updates

### Reddit Advanced Content Filter 3.2.0

- Remembers up to **5,000 blocked-post decisions for 30 days** in local userscript storage. Cache hits require the same authoritative Reddit post ID, content fingerprint, and filter lists. The cache stores IDs, fingerprints, and reasons, not copied titles or post bodies. Triggers longer than 5,000 characters still filter normally and are rechecked instead of cached, keeping derived records small.
- Preserves regular-plural, literal-phrase, subreddit, and whitelist-override behavior on old and modern Reddit. Existing `blocklist` and `whitelist` keys migrate without being overwritten. Native saved lists and phrases receive no new size limit; imported backup files are limited to 2 MB.
- Excludes votes, timestamps, action buttons, and comment controls from content matching. These changing interface labels no longer invalidate unchanged post decisions. Duplicate updates remain batched, and filtering now uses its own `raf-filtered` class so it does not unhide another userscript's content.
- Adds larger light/dark settings with labeled editors, list search and unique counts, a rule preview, visible recovery errors, keyboard focus wrapping, Escape-to-close, and actions that stay visible on narrow screens.
- Adds local JSON export/import. Exports include unsaved editor changes and settings only. Imports fill the editors for review before Save changes; import and save operations cannot overlap.
- Adds search across the complete linked session history, rendering 100 records per page. Session history is retained when filters change and clears on page reload. The persistent decision cache remains bounded independently of that session history.
- Saves settings as one validated snapshot, applies them without reloading, and restores newly allowed posts. Conflicting edits from another tab are surfaced. Delayed reads cannot undo a newer save; notifications arriving during a read cause a fresh read. Corrupt list fields and revision metadata are recovered independently where possible, with originals retained until an explicit save.

Checks use only Node's standard library and browser fixtures:

```text
node --check reddit-advanced-content-filter.user.js
node --test
node tests/build-reddit-browser-fixture.cjs reddit-fixture.html
```

Serve the generated HTML on localhost and open it for the old/modern DOM, persistence, storage-race, settings, and history cases. It uses dummy lists and stubbed userscript storage. Relative Reddit URL resolution is adapted only in the fixture because localhost is not reddit.com. Do not commit the generated fixture. The audit's local server can retain the optional `/results` receipt. Live authenticated Reddit and installed userscript-manager behavior still need testing; the attempted public page displayed Reddit's humanity challenge.

### Bluesky Content Manager 3.6.0

This release remembers blocked posts in local userscript storage and uses saved decisions when the same post appears again. It checks the post's own permalink and a SHA-256 fingerprint of relevant content. Changes to content, filters, account, or followed-account overrides cause a new check. The derived cache keeps up to 5,000 recent blocked decisions for 30 days; it does not store post bodies. Settings and a small, account-specific follows snapshot also stay in local userscript storage. Browsing history in the settings window remains complete for the current page session and renders 50 entries per page.

Filtering now rechecks late-loaded text, images, descriptions, labels, and inserted post wrappers. It restores newly allowed posts and keeps its hiding class separate from other userscripts. Keyword patterns are compiled once, duplicate updates share a processing queue, and menu/history refreshes are batched. Manual `@handle` or `@did:...` entries match author identities from validated own-profile links; content terms retain their whitelist precedence. Repost headers and quoted-post links are excluded from the post's identity.

The settings window supports keyboard navigation and Escape, follows the site's light/dark preference, and fits narrow screens. It includes list counts and search, a matching preview, local JSON export/import, a searchable linked session history, visible recovery errors, and Save changes without a page reload. Imports fill the editors for review before saving. Settings are written as a single validated snapshot, while existing legacy keys remain available for migration and recovery.

Matching rules remain compatible with 3.5.2: plain English words of at least three letters allow `s`, `es`, `ed`, `ing`, `er`, and `ers`; other entries use literal substring matching. For example, `city` does not match `cities`, while `cat` matches `cater`. The matching preview makes these rules explicit. Post action buttons, counters, and timestamp labels are excluded from content matching and fingerprinting.

Followed accounts are fetched through the public Bluesky AppView without access tokens. The explicit active account is used, and stale responses from a previous account are ignored. A recent local snapshot allows quick startup; follows refresh while browsing and through a settings button. If no valid follows list is available, filtering pauses while the enabled followed-account override loads, with status and Retry controls. When a refresh fails after a successful load, the last list stays active and the failure is shown.

Focused checks use Node's built-in test runner, without installed dependencies:

```text
node --check bluesky-content-manager.user.js
node --test
node tests/build-bluesky-browser-fixture.cjs browser-fixture.html
```

Serve the generated HTML on localhost and open it to run the DOM, cache, storage, follow/account, and settings regressions. It uses dummy settings and stubbed public API responses, not a signed-in Bluesky account. Results appear in the page; the audit's local server can also save the `/results` receipt. Do not commit the generated fixture. Browser tests do not replace checking the installed userscript manager and authenticated Bluesky.

- Make and test changes before pushing them to `main`. Changes pushed to the linked files can be published automatically on Greasy Fork.
- Increase `@version` for each script update. Preserve `@name` and `@namespace` so installed scripts retain their identity.
- Edit the GitHub files after synchronization is enabled. Direct edits on Greasy Fork can be overwritten by the next synchronization.
- Greasy Fork controls when a new version is published there. Installed copies update according to each user's userscript manager settings.

## License

Licenses and author credits are preserved as provided. Check each script's `@license` header; some imported scripts do not declare a license. This repository does not add a blanket license.

## References

- [Greasy Fork API and webhook documentation](https://greasyfork.org/en/help/api)
- [Greasy Fork metadata requirements](https://greasyfork.org/en/help/meta-keys)
- [Greasy Fork webhook setup instructions](https://greasyfork.org/en/users/webhook-info)
