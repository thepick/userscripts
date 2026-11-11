const {test} = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./filter-backup-harness.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const post = (author, text, aliases = [author]) => ({author, authorIds: aliases, general: text, text, names: '', labels: '', images: []});

test('legacy Bluesky handles migrate to exact rules with existing allow precedence', () => {
    const api = load('bluesky', {filteredTerms: ['sports', '@Writer.bsky.social'], manualWhitelistTerms: ['science', '@Helper.bsky.social']});
    const {value} = api.read();
    assert.deepEqual(plain(value.filteredTerms), ['sports']);
    assert.deepEqual(plain(value.manualWhitelistTerms), ['science']);
    assert.deepEqual(plain(value.blueskyFilters), {blockedAccounts: ['@writer.bsky.social'], allowedAccounts: ['@helper.bsky.social']});
    api.install(value);
    assert.equal(api.decide(null, post('@writer.bsky.social', 'ordinary text')).reason, 'Blocked account');
    assert.equal(api.decide(null, post('@writer2.bsky.social', 'Mentions @writer.bsky.social')), null);
    assert.equal(api.decide(null, post('@helper.bsky.social', 'sports')), null);
    assert.equal(api.decide(null, post('@writer.bsky.social', 'science')), null);
    assert.equal(api.allowed(null, post('@helper.bsky.social', 'sports')), true);
});

test('Bluesky account rules survive a large unified backup round trip through Reddit', () => {
    const api = load('bluesky'), reddit = load('reddit');
    const {value} = api.read();
    value.filteredTerms = ['keyword'];
    value.blueskyFilters = {blockedAccounts: Array.from({length: 100000}, (_, i) => '@user' + i + '.bsky.social'), allowedAccounts: ['@allowed.bsky.social']};
    const published = api.exportCurrent(value);
    assert.deepEqual(plain(published.shared.blocklist), ['keyword']);
    const parsed = reddit.parse(JSON.stringify(published));
    const restored = api.parse(JSON.stringify(reddit.create(parsed.shared, parsed.platforms)));
    assert.deepEqual(plain(restored.platforms.bluesky.filters), value.blueskyFilters);
    published.blueskyFilters.apiKey = 'private';
    assert.throws(() => reddit.parse(JSON.stringify(published)), /unsupported field/);
});

test('legacy manual account exceptions retain their old invisible-character normalization', () => {
    const api = load('bluesky', {filteredTerms: ['sports'], manualWhitelistTerms: ['@wri\u200bter.bsky.social', '@writer.bsky.social']});
    const {value} = api.read();
    assert.deepEqual(plain(value.blueskyFilters.allowedAccounts), ['@writer.bsky.social']);
    api.install(value);
    assert.equal(api.decide(null, post('@writer.bsky.social', 'sports')), null);
});

test('old unified imports keep local account rules and explicit extensions can clear them', () => {
    const api = load('bluesky', {filteredTerms: ['@retained.bsky.social']});
    const local = api.read().value.blueskyFilters;
    const backup = {format: 'unified-content-filter-backup', version: 1, shared: {
        blocklist: ['@imported.bsky.social', 'keyword'], allowlist: []
    }};
    const merged = api.backupFilterDraft(api.parse(JSON.stringify(backup)), local);
    assert.deepEqual(plain(merged.blueskyFilters.blockedAccounts), ['@retained.bsky.social', '@imported.bsky.social']);
    backup.blueskyFilters = {};
    const replaced = api.backupFilterDraft(api.parse(JSON.stringify(backup)), local);
    assert.deepEqual(plain(replaced.blueskyFilters.blockedAccounts), []);
    assert.deepEqual(plain(replaced.filteredTerms), ['@imported.bsky.social', 'keyword']);
});

test('each platform preserves shared literal prefixes in backups from the other updated script', () => {
    const bluesky = load('bluesky'), reddit = load('reddit');
    const backup = {format: 'unified-content-filter-backup', version: 1, shared: {
        blocklist: ['@literal.bsky.social', 'r/literal'], allowlist: []
    }};
    const blueDraft = bluesky.backupFilterDraft(bluesky.parse(JSON.stringify({...backup, redditFilters: {}})), {});
    assert.deepEqual(plain(blueDraft.filteredTerms), backup.shared.blocklist);
    const redditDraft = reddit.backupFilterDraft(reddit.parse(JSON.stringify({...backup, blueskyFilters: {}})), {});
    assert.deepEqual(plain(redditDraft.blocklist), backup.shared.blocklist);
});

test('two Bluesky tabs preserve unrelated edits and reject Undo after an overlapping edit', async () => {
    const storage = new Map(), a = load('bluesky', storage), b = load('bluesky', storage);
    const [first, second] = await Promise.all([
        a.edit('blockedAccounts', ['@writer.bsky.social'], true),
        b.edit('filteredTerms', ['sports'], true)
    ]);
    assert.ok(first && second);
    await a.edit('blockedAccounts', [], false, first);
    assert.deepEqual(plain(b.read().value.filteredTerms), ['sports']);
    assert.deepEqual(plain(b.read().value.blueskyFilters.blockedAccounts), []);
    const before = await a.edit('blockedAccounts', ['@writer.bsky.social'], true);
    await b.edit('blockedAccounts', ['@writer.bsky.social'], false);
    await a.edit('blockedAccounts', ['@writer.bsky.social'], true);
    assert.equal(await a.edit('blockedAccounts', [], false, before), null);
    assert.deepEqual(plain(b.read().value.blueskyFilters.blockedAccounts), ['@writer.bsky.social']);
});

test('Undo restores keyword priority before its surviving neighbor', async () => {
    const storage = new Map([['filteredTerms', ['previous', 'first match', 'later match']]]);
    const a = load('bluesky', storage), b = load('bluesky', storage);
    const removal = await a.edit('filteredTerms', ['first match'], false);
    await b.edit('filteredTerms', ['previous'], false);
    await a.edit('filteredTerms', [], false, removal);
    assert.deepEqual(plain(a.read().value.filteredTerms), ['first match', 'later match']);
});
