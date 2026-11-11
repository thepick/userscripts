# Unified Filter Backup v1

Bluesky Content Manager 4.05 and Reddit Content Manager 4.04 export one file that either script can import. This is a manual transfer, not automatic synchronization. Export the current draft from **Backups & reset**, import it in the other script, review it, and choose **Save changes**. Importing alone does not change active filtering or saved settings. Replacing a modified draft requires confirmation.

```json
{
  "format": "unified-content-filter-backup",
  "version": 1,
  "exportedAt": "2026-11-09T00:00:00.000Z",
  "shared": { "blocklist": ["spoiler"], "allowlist": ["science"], "aiTopics": ["Sports except MMA"] },
  "platforms": {
    "bluesky": { "autoWhitelistEnabled": true, "altTextEnforcementEnabled": false },
    "reddit": {}
  }
}
```

Both lists are required. `platforms` and either platform section may be absent. Each section can contain `ai` with the existing fields `enabled`, `mode`, `scope`, `analyzeImages`, `budget`, and `requestLimit`. Bluesky accepts `news` or `all` scope; Reddit accepts `all`. No API keys, account tokens, cache, history, or Keep overrides belong in this format. Unknown platform/option fields are rejected rather than retained as an unchecked container for credentials. Unknown root fields are ignored and are not re-exported.

Import replaces the shared lists and, when present, shared AI prompts. An explicit empty `aiTopics` list clears the prompts; an old lists-only backup leaves them unchanged. Present settings for the active platform update the draft; absent settings keep the current draft values. Settings for the other platform are validated and retained through Save, reload, and re-export. Partial retained sections merge with previously retained options. Export refreshes the active section from the current draft. The inactive section is only a saved copy: it cannot know about later changes made in the other script.

## Compatibility and limits

Both scripts also read version 1 `bluesky-content-manager-settings` (nested `settings`) and `reddit-advanced-content-filter-settings` / `reddit-advanced-content-filter-ai-settings` (top-level lists). Cross-platform legacy import transfers shared lists and AI prompts and retains the source platform's supported options. Same-platform legacy import applies its supported settings. New exports always use the unified format; older installed versions cannot read that format. Upgrade both scripts before exchanging unified backups.

| Limit | Definition |
| --- | --- |
| File | 10 MiB (10,485,760 bytes) of UTF-8 JSON |
| Each list | 100,000 unique entries after trimming and lowercasing |
| Each entry | 10,000 UTF-16 code units after normalization |
| Combined lists | 8 MiB (8,388,608 bytes) of normalized UTF-8 text, including newline separators within each list |

Blank entries are removed and duplicates retain their first position. Entries containing embedded CR/LF are rejected because the existing editor uses one entry per line. List limits apply to imports, editing, saving, and restored settings. JSON escaping can make an otherwise valid list exceed the file limit; export reports this instead of creating an unimportable file. Validation completes before changing the draft. Save verifies the stored snapshot before installing it; failures retain the draft and display an error. Corrupt retained metadata is reported without discarding recoverable active settings.

Matching rules and allowlist precedence remain platform-specific. A candidate index reduces the number of existing rules evaluated; the original phrase and regular-expression checks still make the decision. Unicode case-folding, plurals, punctuation, and match order are checked against the previous implementation.

## Reddit-only lists

Version 4.07 adds an optional top-level `redditFilters` object to version 1 backups. It holds `subreddits`, `users`, `allowSubreddits`, `allowUsers`, and `legacySubreddits` arrays. Each array contains bare, case-insensitive names. The two shared lists continue to carry keywords and phrases. Bluesky 4.07 retains the Reddit lists when importing and re-exporting a file. Older readers import the shared lists and omit the Reddit-only fields when re-exporting.

Reddit imports explicit empty Reddit lists as a request to clear them. An older unified backup without this extension keeps local Reddit-only rules and adds explicit Reddit rules found in its lists. The 10 MiB file limit includes the extension.

## Bluesky-only account rules

Bluesky 4.08 writes optional top-level `blueskyFilters` with `blockedAccounts` and `allowedAccounts`. Reddit 4.09 retains those lists when importing and re-exporting a unified file. The shared lists hold keywords and phrases. An explicit empty extension clears the account rules in the draft. A backup from the other updated script that contains only its own extension keeps local account rules and preserves shared entries as text.

Earlier readers still load the shared lists. To carry both platforms' account rules through a re-export, use Bluesky 4.08 and Reddit 4.09 or later. Backups exclude the short-lived records used for Undo.

## Validation and release status

Run `npm test`, `npm run check:syntax`, and `npm run benchmark` with Node 24. No package installation is required. The syntax check parses both complete production scripts as ES2015 using Node's bundled Acorn parser. Test harnesses may use modern Node/browser syntax.

For DOM tests, run `npm run test:browser` and open `http://127.0.0.1:8765/`. For the existing Bluesky regression suite, first run `node tests/build-bluesky-browser-fixture.cjs ../bluesky-browser-fixture.html`, then open `/bluesky-regressions`. Browser tests use synthetic feeds and userscript storage, reject network requests, and exercise actual import/save/export controls, failure recovery, reload, appended feed batches, and allowlist precedence. They do not install scripts in a userscript manager or exercise signed-in production feeds.

Measured on the work PC, 9 November 2026, Node 24.17.0. Both lists contain the stated number of entries. Times are milliseconds; these are single-run measurements, not service guarantees.

| Platform | Entries per list | Parse/validate | Build block index | Warm unmatched post | Shared-prefix unmatched post |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bluesky | 1,000 | 2.6 | 4.1 | 0.09 | 0.6 |
| Bluesky | 10,000 | 21.9 | 15.4 | 0.07 | 4.6 |
| Bluesky | 50,000 | 77.8 | 83.6 | 0.04 | 13.1 |
| Bluesky | 100,000 | 145.5 | 139.8 | 0.04 | 32.3 |
| Reddit | 1,000 | 2.1 | 4.1 | 0.06 | 1.0 |
| Reddit | 10,000 | 10.7 | 38.9 | 0.04 | 5.1 |
| Reddit | 50,000 | 60.9 | 116.0 | 0.07 | 17.8 |
| Reddit | 100,000 | 124.5 | 210.1 | 0.04 | 26.9 |

Before indexing, the same warm unmatched-post benchmark took approximately 145/140 ms at 10,000 entries and 1,631/794 ms at 100,000 for Bluesky/Reddit. The optimized run's peak reported process heap was about 144 MiB; that includes successive test contexts and is not isolated browser memory consumption.

Large lists now use textarea pages of at most 1,000 lines or 65,536 UTF-16 code units (whole entries stay intact). Ordinary short lists retain one editor. Previous/Next change the visible page; Find, Preview, Save and Export use the complete list. Select All and native undo operate within the displayed page; changing pages resets the textarea undo history. Export before broad manual edits if an undoable copy is needed.

Final automated checks pass: 122 Node tests, ES2015 parsing, both-platform browser runs at 1k/10k/50k/100k entries per list, and near-8MiB lists with 10k-character entries. The browser tests also save edits made on later pages, reload them, and check appended feed batches and allowlist priority. At 100k per list, displayed import took 528 ms on Bluesky and 462 ms on Reddit; initial Save took 384/779 ms. Near-8MiB imports took 256/552 ms. These are single-run work-PC measurements, including browser paint, not speed guarantees.

Isolated validation copies installed in Violentmonkey 2.50.0 saved 100k entries in each list on both live sites (Reddit import 314 ms, Bluesky 742 ms). Both copies retained the lists after reload. Reddit hid 3 matching cards among 52 loaded cards. Full live infinite-scroll verification remains incomplete; connection timeouts interrupted those checks. The installed Bluesky inspection also exposed a subgrid overlap between page navigation and Find; the row span and wrapping were corrected, and a browser geometry assertion was added. The final layout rerun and browser heap-retention profiling are still outstanding. These validation gaps remain documented; the user authorized release after manual testing.

## Independent review

DeepSeek reviewed the plan and production diff through the installed review tool's command-line fallback. The connected chat tool is now exposed after local registration and a host restart; its first design-review call timed out. A distinct, narrower final editor-code request also timed out. No automatic retries were made; a native independent reviewer was used as fallback. The connected review is not complete. The actionable partial-platform-merge concern was fixed with regression tests. Scope validation, legacy extra fields, normalized entry lengths, and empty candidate behavior were checked against the implementation; the other reported concerns did not demonstrate failures under the specified contract.

A separate code review identified a Greek final-sigma candidate-filter mismatch and corrupt inactive metadata blocking active-settings recovery. Both received failing regression tests before their fixes. Differential matching tests include Unicode case variants. Review does not replace the outstanding live-feed release checks above.

## AI topic description compatibility

AI descriptions no longer have a combined 3,000-character cap. Both platforms retain up to 20 topics of 1,000 characters each without truncation during import, editing, storage validation, and export. Longer descriptions increase AI request input size; existing budgets and request caps still apply. Regression tests cover 20 distinct maximum-length descriptions and enforce the remaining per-topic/count limits.

## Shared AI prompts

The canonical prompt list is `shared.aiTopics`. Exports write it once and omit `topics` from platform AI controls. Upgrade both scripts to Bluesky 4.05 / Reddit 4.04 or later before transferring these backups. Existing platform-specific prompt arrays remain readable: when `shared.aiTopics` is absent, their prompts are combined in Bluesky-then-Reddit order and deduplicated. More than 20 distinct prompts fails validation without changing the draft. Explicit shared prompts take precedence. Enabled state, mode, image analysis, scope, budget and request limit remain separate per platform. Sharing uses export/import; it is not automatic synchronization.
