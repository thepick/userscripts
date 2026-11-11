const {test} = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./filter-backup-harness.cjs');
const plain = value => JSON.parse(JSON.stringify(value));

test('legacy explicit identities migrate and bare names keep their old Reddit behavior', async () => {
    const api = load('reddit', {blocklist: ['R/News', 'U/Example', 'AskReddit', 'School sports'], whitelist: ['r/Science', 'U/Helpful', 'astronomy']});
    const config = await api.read();
    assert.deepEqual(plain(config.blocklist), ['askreddit', 'school sports']);
    assert.deepEqual(plain(config.whitelist), ['astronomy']);
    assert.deepEqual(plain(config.redditFilters), {
        subreddits: ['news'], users: ['example'], allowSubreddits: ['science'], allowUsers: ['helpful'], legacySubreddits: ['askreddit']
    });
    await api.setRules(config.blocklist, config.whitelist, config.redditFilters);
    assert.equal(api.decide('Test', 'Mentioning u/example and r/news', 'other', 'different'), null);
    assert.equal(api.decide('Test', '', 'news', '').source, 'subreddit');
    assert.equal(api.decide('Test', '', 'askreddit', '').source, 'subreddit');
    assert.equal(api.decide('Test', '', 'newspaper', 'example').source, 'user');
    assert.equal(api.decide('Test', '', 'newspaper', 'example2'), null);
    assert.equal(api.decide('Test', 'school sports', 'news', 'helpful'), null);
    assert.equal(api.decide('Astronomy', '', 'news', 'example'), null);
    assert.equal(api.decide('Test', 'Mentioning r/science and u/helpful', 'news', 'example').source, 'subreddit');
    assert.equal(api.allowed({title: 'Test', content: '', subreddit: 'science', author: 'example'}), true);
});

test('large Reddit lists survive unified backup round-trip through Bluesky', () => {
    const reddit = load('reddit'), bluesky = load('bluesky');
    const redditFilters = {subreddits: Array.from({length: 100000}, (_, index) => 'sub' + index), users: ['user1'], allowUsers: ['user2'], allowSubreddits: [], legacySubreddits: []};
    const out = reddit.exportCurrent({blocklist: ['sports'], whitelist: ['science'], ai: reddit.defaults, redditFilters});
    const imported = bluesky.parse(JSON.stringify(out));
    assert.deepEqual(plain(imported.shared.blocklist), ['sports']);
    const restored = reddit.parse(JSON.stringify(bluesky.create(imported.shared, imported.platforms)));
    assert.deepEqual(plain(restored.platforms.reddit.filters), redditFilters);
    out.redditFilters.apiKey = 'private';
    assert.throws(() => bluesky.parse(JSON.stringify(out)), /unsupported field/);
});

test('simultaneous settings changes on two origins and scoped Undo converge', async () => {
    const storage = new Map();
    const a = load('reddit', storage, 'www.reddit.com'), b = load('reddit', storage, 'old.reddit.com');
    const [news, user] = await Promise.all([
        a.edit('subreddits', 'news', true),
        b.edit('users', 'writer', true)
    ]);
    assert.ok(news && user);
    const base = await b.read();
    await a.edit('whitelist', 'astronomy', true);
    const draft = plain(base);
    draft.blocklist.push('sports');
    draft.ai.mode = 'hide';
    await b.save(base, draft);
    await a.undo(news);
    const after = await b.read();
    assert.deepEqual(plain(after.redditFilters.subreddits), []);
    assert.deepEqual(plain(after.redditFilters.users), ['writer']);
    assert.deepEqual(plain(after.blocklist), ['sports']);
    assert.deepEqual(plain(after.whitelist), ['astronomy']);
    assert.equal(after.ai.mode, 'hide');
    const original = await b.edit('subreddits', 'news', true);
    await a.edit('subreddits', 'news', false);
    await b.edit('subreddits', 'news', true);
    assert.equal(await a.undo(original), null);
    assert.deepEqual(plain((await a.read()).redditFilters.subreddits), ['news']);
});

test('Undo reports a conflict when a concurrent edit wins before its conditional replay', async () => {
    const storage = new Map(), a = load('reddit', storage), b = load('reddit', storage, 'old.reddit.com');
    const random = number => ({subtle: a.crypto.subtle, getRandomValues: values => values.fill(number)});
    a.crypto = random(10);
    b.crypto = random(5);
    const original = await a.edit('users', 'writer', true);
    a.crypto = random(15);
    const set = a.GM.setValue;
    let started;
    const writing = new Promise(resolve => { started = resolve; });
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    a.GM.setValue = async (key, value) => {
        if (key.startsWith('rafaiFilterEdit:')) { started(); await wait; }
        set(key, value);
    };
    const undo = a.undo(original);
    await writing;
    await b.edit('users', 'writer', false);
    release();
    assert.equal(await undo, null);
    assert.deepEqual(plain((await a.read()).redditFilters.users), []);
});

test('a legacy alias and explicit subreddit can be unblocked and restored together', async () => {
    const api = load('reddit', {blocklist: ['news', 'r/news'], whitelist: []});
    const removal = await api.edit('subreddits', 'news', false);
    const after = await api.read();
    assert.deepEqual(plain(after.redditFilters.subreddits), []);
    assert.deepEqual(plain(after.redditFilters.legacySubreddits), []);
    assert.deepEqual(plain(after.blocklist), ['news']);
    await api.undo(removal);
    await api.edit('blocklist', 'news', false);
    await api.edit('blocklist', 'news', true);
    assert.deepEqual(plain((await api.read()).redditFilters.legacySubreddits), []);
});

test('an Undo affecting several lists skips every change when one member was edited again', async () => {
    const api = load('reddit', {blocklist: ['news', 'r/news'], whitelist: []});
    const removal = await api.edit('subreddits', 'news', false);
    await api.edit('subreddits', 'news', true);
    assert.equal(await api.undo(removal), null);
    const after = await api.read();
    assert.deepEqual(plain(after.redditFilters.legacySubreddits), []);
    assert.deepEqual(plain(after.redditFilters.subreddits), ['news']);
});

test('older unified backups preserve local typed rules unless the extension explicitly replaces them', async () => {
    const api = load('reddit', {blocklist: ['r/retained', 'u/retained'], whitelist: []});
    const {redditFilters} = await api.read();
    const backup = {format: 'unified-content-filter-backup', version: 1, shared: {blocklist: ['r/imported', 'keyword'], allowlist: []}};
    const merged = api.backupFilterDraft(api.parse(JSON.stringify(backup)), redditFilters);
    assert.deepEqual(plain(merged.blocklist), ['keyword']);
    assert.deepEqual(plain(merged.redditFilters.subreddits), ['retained', 'imported']);
    assert.deepEqual(plain(merged.redditFilters.users), ['retained']);
    backup.redditFilters = {};
    const replaced = api.backupFilterDraft(api.parse(JSON.stringify(backup)), redditFilters);
    assert.deepEqual(plain(replaced.blocklist), ['r/imported', 'keyword']);
    assert.deepEqual(plain(replaced.redditFilters.subreddits), []);
});

test('settings preserve explicit keyword order and retain rules added by another tab', async () => {
    const api = load('reddit', {blocklist: ['sports', 'ball'], whitelist: []});
    const base = await api.read();
    await api.edit('blocklist', 'running', true);
    const draft = plain(base);
    draft.blocklist = ['ball', 'sports'];
    await api.save(base, draft);
    assert.deepEqual(plain((await api.read()).blocklist), ['ball', 'sports', 'running']);
});

test('saving a repaired legacy draft enables quick actions without changing the original record', async () => {
    const original = {version: 1, revision: 'broken', blocklist: [42], whitelist: ['science']};
    const storage = new Map([['rafaiSettingsV1', original]]);
    const api = load('reddit', storage);
    const base = await api.read();
    assert.equal(base.warnings.length, 1);
    await assert.rejects(api.edit('users', 'writer', true), /repair saved filters/);
    const draft = plain(base);
    draft.blocklist.push('restored');
    await api.save(base, draft);
    assert.ok(await api.edit('users', 'writer', true));
    assert.equal(storage.get('rafaiSettingsV1'), original);
    const fresh = await load('reddit', storage).read();
    assert.deepEqual(plain(fresh.warnings), []);
    assert.deepEqual(plain(fresh.blocklist), ['restored']);
    assert.deepEqual(plain(fresh.whitelist), ['science']);
});

test('concurrent writes at the entry cap converge and reject the whole over-limit edit', async () => {
    const users = Array.from({length: 99999}, (_, i) => 'user' + i);
    const storage = new Map([
        ['rafaiSettingsV1', {version: 1, revision: 'base', blocklist: [], whitelist: [], redditFilters: {users}}],
        ['rafaiFilterEdit:b', {clock: 1, rules: [['users', 'rejected', true], ['whitelist', 'atomic', true]]}],
        ['rafaiFilterEdit:a', {clock: 1, rules: [['users', 'accepted', true]]}]
    ]);
    const after = await load('reddit', storage).read();
    assert.equal(after.redditFilters.users.length, 100000);
    assert.equal(after.redditFilters.users.at(-1), 'accepted');
    assert.deepEqual(plain(after.whitelist), []);
    assert.ok(after.rejectedEdits.has('rafaiFilterEdit:b'));
});
