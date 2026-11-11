# Reddit context filter release checks

Run `npm test`, `npm run check:syntax`, and `npm run benchmark`. Run `npm run test:browser` and open `http://127.0.0.1:8765/` for backup and large-list checks and `http://127.0.0.1:8765/reddit-context` for context-menu checks.

Use an isolated userscript-manager profile for live testing on both Reddit hosts. Use the same script installation on both hosts, and keep an unmodified v4.06 test profile or backup for migration checks.

1. Install v4.06 in the test profile. Save a bare keyword that also names a subreddit, an explicit `r/` rule, an explicit `u/` rule, and shared allowlist terms. Upgrade to the local branch. Confirm the separate lists and filter results. Export and import the file through both local 4.07 scripts. Verify that shared keywords and AI preferences survive and that the Reddit-only lists come back intact. Import a v4.06 backup and check the legacy rules.
2. On each Reddit host, highlight a phrase in a real post and right-click it. Verify Block and Undo. Right-click a post to block an author or subreddit, then open **History > Blocked posts > Post filters** to reverse it or add an exception. Verify that removing the exception restores the block, that a different author with the same name prefix remains visible, and that a post mentioning a blocked username stays visible when no other rule matches.
3. Verify that links without selections, text fields, comments, and off-post content keep their native menus. Test keyboard access, Escape, and normal scrolling. Scroll far enough to load another batch of posts and confirm that filtering and context actions still work.
4. Keep www and Old Reddit open. Make different edits before either tab refreshes. Verify that both edits survive in both tabs. Try Undo after an unrelated edit and after a second change to the same rule. Save from a stale settings draft and verify that unrelated quick edits survive.
5. Import a large backup into the test profile. Find a late entry, edit it, save, reload, and re-export. Test a malformed file and confirm the draft survives. Use the synthetic suite for the maximum supported list sizes.
6. Verify existing AI Preview/Hide and Keep behavior using the test profile, along with allowlist precedence and the normal request limits. Keep provider tests in the mock harness unless a live test account and key are available.
