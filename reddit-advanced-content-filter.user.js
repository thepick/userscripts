// ==UserScript==
// @name         Reddit Advanced Content Filter
// @namespace    https://greasyfork.org/en/users/567951-stuart-saddler
// @version      3.1.0
// @description  Hide Reddit posts by keyword or subreddit, with whitelist overrides, regular plural matching, linked full-session history, and responsive settings.
// @author       Stuart Saddler (locally revised)
// @license      MIT
// @match        *://www.reddit.com/*
// @match        *://old.reddit.com/*
// @run-at       document-end
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @downloadURL https://update.greasyfork.org/scripts/516666/Reddit%20Advanced%20Content%20Filter.user.js
// @updateURL https://update.greasyfork.org/scripts/516666/Reddit%20Advanced%20Content%20Filter.meta.js
// ==/UserScript==
// Source: https://github.com/thepick/userscripts

(async function () {
    'use strict';

    const postSelector = 'article, div[data-testid="post-container"], shreddit-post, .thing.link';
    const pendingPosts = new Set();
    const blockedPosts = new Map();
    let postStates = new WeakMap();
    let blocklistArr = [];
    let whitelistArr = [];
    let blocklistSet = new Set();
    let blockRules = [];
    let whiteRules = [];
    let processing = false;
    let menuCommand = null;
    let counterTimer = null;
    let refreshHistory = null;
    let startupError = '';

    function scheduleIdle(callback) {
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(callback, { timeout: 200 });
        } else {
            setTimeout(callback, 16);
        }
    }

    function normalizeList(value) {
        return Array.isArray(value) ? value.filter(x => typeof x === 'string')
            .map(x => x.trim().toLowerCase()).filter(Boolean) : [];
    }

    function escapeRegex(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function compileRules(entries) {
        return entries.map(entry => {
            if (entry.includes(' ')) return { phrase: entry };
            const variants = [entry];
            // shortcut: regular English plurals only; enter irregular forms separately.
            if (/^[a-z]+$/.test(entry)) {
                if (/[^aeiou]y$/.test(entry)) variants.push(entry.slice(0, -1) + 'ies');
                else if (/(s|x|z|ch|sh)$/.test(entry)) variants.push(entry + 'es');
                else variants.push(entry + 's');
            }
            return { regex: new RegExp('(^|[^\\p{L}\\p{N}_])(' +
                variants.map(escapeRegex).join('|') + ')(?=$|[^\\p{L}\\p{N}_])', 'iu') };
        });
    }

    function matchBlock(text, rules) {
        for (const rule of rules) {
            if (rule.phrase !== undefined) {
                if (text.includes(rule.phrase)) return rule.phrase;
            } else {
                const match = rule.regex.exec(text);
                if (match) return match[2];
            }
        }
        return null;
    }

    function setRules(blocklist, whitelist) {
        blocklistArr = normalizeList(blocklist);
        whitelistArr = normalizeList(whitelist);
        blocklistSet = new Set(blocklistArr);
        blockRules = compileRules(blocklistArr);
        whiteRules = compileRules(whitelistArr);
    }

    function updateMenuEntry() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        try {
            if (menuCommand !== null) {
                if (typeof GM_unregisterMenuCommand !== 'function') return;
                GM_unregisterMenuCommand(menuCommand);
            }
            menuCommand = GM_registerMenuCommand(
                'Configure Filter (' + blockedPosts.size + ' blocked)', showConfig);
        } catch (error) {
            console.warn('[Reddit Filter] Could not update menu:', error);
        }
    }

    function updateCounterSoon() {
        if (counterTimer !== null) return;
        counterTimer = setTimeout(() => {
            counterTimer = null;
            updateMenuEntry();
            if (refreshHistory) refreshHistory();
        }, 100);
    }

    const style = document.createElement('style');
    style.dataset.redditFilter = 'true';
    style.textContent = `
        .content-filtered { display: none !important; }
        dialog[data-reddit-filter-ui] {
            width: min(420px, calc(100vw - 32px)); max-height: 90vh;
            box-sizing: border-box; overflow: auto; border: 0; border-radius: 8px;
            padding: 20px; background: white; color: #333;
            font: 14px/1.4 Arial, sans-serif; box-shadow: 0 4px 12px #0004;
        }
        dialog[data-reddit-filter-ui]::backdrop { background: #0008; }
        dialog[data-reddit-filter-ui] h2 { margin-top: 0; color: #0079d3; }
        dialog[data-reddit-filter-ui] label { display: block; font-weight: bold; margin-top: 12px; }
        dialog[data-reddit-filter-ui] textarea { width: 100%; height: 80px; box-sizing: border-box; }
        dialog[data-reddit-filter-ui] button { margin: 4px; cursor: pointer; }
        dialog[data-reddit-filter-ui] a { color: #0079d3; }
        dialog[data-reddit-filter-ui] .raf-history {
            height: 140px; overflow-y: auto; background: #f9f9f9;
            border: 1px solid #ccc; padding: 6px; overflow-wrap: anywhere;
        }
        dialog[data-reddit-filter-ui] .raf-reason { color: #666; }
        dialog[data-reddit-filter-ui] .raf-actions { margin-top: 10px; text-align: right; }
        dialog[data-reddit-filter-ui] [role="alert"] { color: #a00; white-space: pre-wrap; }
    `;
    (document.head || document.documentElement).appendChild(style);

    function safePostURL(value) {
        if (!value) return '';
        try {
            const url = new URL(value, location.href);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
            if (url.hostname !== 'reddit.com' && !url.hostname.endsWith('.reddit.com')) return '';
            return /\/comments\/[^/]+/.test(url.pathname) ? url.href : '';
        } catch (error) {
            return '';
        }
    }

    function showConfig() {
        const existing = document.querySelector('dialog[data-reddit-filter-ui]');
        if (existing) {
            existing.querySelector('textarea').focus();
            return;
        }
        const previousFocus = document.activeElement;
        const dialog = document.createElement('dialog');
        dialog.dataset.redditFilterUi = 'true';
        dialog.setAttribute('aria-labelledby', 'raf-heading');
        dialog.innerHTML = `
            <h2 id="raf-heading">Reddit Filter: Settings</h2>
            <label for="raf-blocklist">Blocklist</label>
            <p id="raf-block-help">One keyword, phrase or subreddit name per line. Matching posts are hidden.</p>
            <textarea id="raf-blocklist" aria-describedby="raf-block-help" autofocus></textarea>
            <label for="raf-whitelist">Whitelist</label>
            <p id="raf-white-help">One entry per line. A match overrides the blocklist.</p>
            <textarea id="raf-whitelist" aria-describedby="raf-white-help"></textarea>
            <p>Single words also match common regular plurals. Phrases match literal substrings.</p>
            <p><strong>Blocked Post Titles</strong> — full session history</p>
            <div class="raf-history" id="raf-history"></div>
            <div>
                <button type="button" id="raf-previous">Previous</button>
                <span id="raf-page" aria-live="polite"></span>
                <button type="button" id="raf-next">Next</button>
            </div>
            <p id="raf-error" role="alert"></p>
            <div class="raf-actions">
                <button type="button" id="raf-cancel">Cancel</button>
                <button type="button" id="raf-save">Save</button>
            </div>`;
        document.body.appendChild(dialog);
        const blockInput = dialog.querySelector('#raf-blocklist');
        const whiteInput = dialog.querySelector('#raf-whitelist');
        const saveButton = dialog.querySelector('#raf-save');
        const cancelButton = dialog.querySelector('#raf-cancel');
        const errorText = dialog.querySelector('#raf-error');
        blockInput.value = blocklistArr.join('\n');
        whiteInput.value = whitelistArr.join('\n');
        errorText.textContent = startupError;
        saveButton.disabled = Boolean(startupError);
        let page = 0;
        let saving = false;

        function renderHistory() {
            const pageCount = Math.max(1, Math.ceil(blockedPosts.size / 100));
            page = Math.min(page, pageCount - 1);
            const fragment = document.createDocumentFragment();
            let index = 0;
            for (const item of blockedPosts.values()) {
                if (index >= (page + 1) * 100) break;
                if (index++ < page * 100) continue;
                const row = document.createElement('div');
                const url = safePostURL(item.url);
                const title = document.createElement(url ? 'a' : 'span');
                title.textContent = item.title.length > 80 ? item.title.slice(0, 79) + '…' : item.title;
                title.title = item.title;
                if (url) {
                    title.href = url;
                    title.target = '_blank';
                    title.rel = 'noopener noreferrer';
                }
                const reason = document.createElement('span');
                reason.className = 'raf-reason';
                reason.textContent = ' [' + (item.subreddit ? 'r/' + item.subreddit + ', ' : '') +
                    item.source + ': "' + item.trigger + '"]';
                row.append('• ', title, reason);
                fragment.appendChild(row);
            }
            const history = dialog.querySelector('#raf-history');
            if (!blockedPosts.size) fragment.appendChild(document.createTextNode('(No posts blocked yet)'));
            history.replaceChildren(fragment);
            dialog.querySelector('#raf-page').textContent = (page + 1) + '/' + pageCount +
                ' (' + blockedPosts.size + ' blocked)';
            dialog.querySelector('#raf-previous').disabled = page === 0;
            dialog.querySelector('#raf-next').disabled = page + 1 >= pageCount;
        }
        refreshHistory = renderHistory;
        dialog.querySelector('#raf-previous').onclick = () => { page--; renderHistory(); };
        dialog.querySelector('#raf-next').onclick = () => { page++; renderHistory(); };
        cancelButton.onclick = () => dialog.close();
        dialog.oncancel = event => { if (saving) event.preventDefault(); };
        dialog.onkeydown = event => {
            if (event.key !== 'Tab') return;
            const controls = dialog.querySelectorAll('textarea, button:not(:disabled), a[href]');
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first.focus();
            }
        };
        dialog.onclose = () => {
            refreshHistory = null;
            dialog.remove();
            if (previousFocus && previousFocus.isConnected) previousFocus.focus();
        };
        saveButton.onclick = async () => {
            if (saving || startupError) return;
            saving = true;
            saveButton.disabled = cancelButton.disabled = true;
            errorText.textContent = '';
            const nextBlock = normalizeList(blockInput.value.split('\n'));
            const nextWhite = normalizeList(whiteInput.value.split('\n'));
            try {
                await GM.setValue('blocklist', nextBlock);
                await GM.setValue('whitelist', nextWhite);
            } catch (error) {
                errorText.textContent = 'Could not save settings. Your active filters are unchanged. Please retry.';
                try {
                    await GM.setValue('blocklist', blocklistArr);
                    await GM.setValue('whitelist', whitelistArr);
                } catch (rollbackError) {
                    errorText.textContent += ' Some stored settings could not be restored; save again before reloading.';
                    console.error('[Reddit Filter] Restore failed:', rollbackError);
                }
                console.error('[Reddit Filter] Save failed:', error);
                saving = false;
                saveButton.disabled = cancelButton.disabled = false;
                return;
            }
            setRules(nextBlock, nextWhite);
            postStates = new WeakMap();
            blockedPosts.clear();
            pendingPosts.clear();
            document.querySelectorAll('.content-filtered').forEach(post => post.classList.remove('content-filtered'));
            collectPosts(document.body);
            updateCounterSoon();
            dialog.close();
        };
        renderHistory();
        dialog.showModal();
    }

    function postMetadata(post) {
        return post.querySelector('shreddit-post') || post;
    }

    function getPostTitle(post) {
        const attribute = postMetadata(post).getAttribute('post-title');
        if (attribute && attribute.trim()) return attribute.trim();
        for (const selector of ['[slot="title"]', 'span[data-testid="post-title"]', 'a.title',
            'h1, h2, h3, h4, h5, h6', 'a[data-click-id="body"]', 'div[data-adclicklocation="title"]']) {
            const element = post.querySelector(selector);
            if (element && element.textContent.trim()) {
                const text = element.textContent.trim();
                return selector === 'a[data-click-id="body"]' ? text.split('\n')[0].trim() : text;
            }
        }
        return '(Untitled)';
    }

    function getPostLink(post) {
        const metadata = postMetadata(post);
        const attribute = safePostURL(metadata.getAttribute('permalink')) ||
            safePostURL(metadata.getAttribute('content-href'));
        if (attribute) return attribute;
        for (const link of post.querySelectorAll('a[data-click-id="comments"], a[href*="/comments/"]')) {
            const url = safePostURL(link.getAttribute('href'));
            if (url) return url;
        }
        return '';
    }

    function getSubreddit(post) {
        const metadata = postMetadata(post);
        const attribute = metadata.getAttribute('subreddit-prefixed-name') || metadata.getAttribute('subreddit-name');
        const element = post.querySelector('a[data-click-id="subreddit"], .tagline a.subreddit, a[href^="/r/"]');
        return (attribute || (element ? element.textContent : '')).trim().toLowerCase().replace(/^r\//, '');
    }

    function getPostText(post) {
        const parts = [];
        function visit(node) {
            if (node.nodeType === 3) {
                parts.push(node.data);
                return;
            }
            if (node.nodeType !== 1 || /^(SCRIPT|STYLE|TEMPLATE)$/.test(node.tagName)) return;
            // Separate block text without breaking words split by inline formatting.
            const boundary = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DIV|DL|DT|FIGCAPTION|FIGURE|FOOTER|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TD|TH|TR|UL)$/.test(node.tagName);
            if (boundary) parts.push(' ');
            for (const child of node.childNodes) visit(child);
            if (boundary) parts.push(' ');
        }
        visit(post);
        return parts.join('').toLowerCase();
    }

    function findPost(node) {
        const element = node.nodeType === 1 ? node : node.parentElement;
        if (!element || element.closest('[data-reddit-filter-ui]')) return null;
        let post = element.closest(postSelector);
        // Reddit can wrap one shreddit-post in an article: process the outer card once.
        for (let parent = post && post.parentElement && post.parentElement.closest(postSelector);
            parent; parent = post.parentElement && post.parentElement.closest(postSelector)) post = parent;
        return post;
    }

    function queuePost(post) {
        if (!post || !post.isConnected || !blockRules.length) return;
        pendingPosts.add(post);
        if (!processing) {
            processing = true;
            scheduleIdle(processPostsBatch);
        }
    }

    function collectPosts(node) {
        if (node.nodeType !== 1 || node.closest('[data-reddit-filter-ui]')) return;
        queuePost(findPost(node));
        node.querySelectorAll(postSelector).forEach(post => queuePost(findPost(post)));
    }

    function processPost(post) {
        if (!post.isConnected || !blockRules.length) return;
        const title = getPostTitle(post);
        const content = getPostText(post);
        const subreddit = getSubreddit(post);
        const url = getPostLink(post);
        const old = postStates.get(post);
        const id = (url && new URL(url).pathname.match(/\/comments\/([^/]+)/)) || null;
        const metadata = postMetadata(post);
        const fullname = metadata.getAttribute('data-fullname') || metadata.id || '';
        const stableId = id || fullname.match(/^t3_([a-z0-9]+)$/i);
        const key = stableId ? 'post:' + stableId[1] : old ? old.key : fullname || post.id || Symbol('post');
        const provisional = !stableId && (!old || old.provisional);
        if (old && old.title === title && old.content === content && old.subreddit === subreddit &&
            old.url === url && old.key === key && old.provisional === provisional) {
            if (post.classList.contains('content-filtered') !== old.filtered) {
                post.classList.toggle('content-filtered', old.filtered);
            }
            return;
        }
        const titleLower = title.toLowerCase();
        let source = '';
        let trigger = '';
        if (matchBlock(titleLower + ' ' + content + ' r/' + subreddit, whiteRules) === null) {
            if (subreddit && (blocklistSet.has(subreddit) || blocklistSet.has('r/' + subreddit))) {
                source = 'subreddit';
                trigger = subreddit;
            } else {
                trigger = matchBlock(titleLower, blockRules);
                if (trigger) source = 'title';
                else {
                    trigger = matchBlock(content, blockRules);
                    if (trigger) source = 'content';
                }
            }
        }
        post.classList.toggle('content-filtered', Boolean(source));
        // Promote provisional history in place; different known IDs remain separate posts.
        if (old && old.provisional && old.key !== key) blockedPosts.delete(old.key);
        if (source) blockedPosts.set(key, { title, url, source, trigger, subreddit });
        else blockedPosts.delete(key);
        postStates.set(post, { title, content, subreddit, url, key, provisional, filtered: Boolean(source) });
        updateCounterSoon();
    }

    function processPostsBatch() {
        let count = 0;
        for (const post of pendingPosts) {
            pendingPosts.delete(post);
            try {
                processPost(post);
            } catch (error) {
                console.error('[Reddit Filter] Could not process a post:', error);
            }
            if (++count === 5) break;
        }
        if (pendingPosts.size) scheduleIdle(processPostsBatch);
        else processing = false;
    }

    try {
        const [blocklist, whitelist] = await Promise.all([
            GM.getValue('blocklist', []), GM.getValue('whitelist', [])]);
        setRules(blocklist, whitelist);
    } catch (error) {
        startupError = 'Could not load saved filters. Reload the page to retry; saving is disabled to protect your settings.';
        console.error('[Reddit Filter] Load failed:', error);
        updateMenuEntry();
        return;
    }

    updateMenuEntry();
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.attributeName === 'class') {
                const cached = postStates.get(mutation.target);
                if (cached) {
                    if (mutation.target.classList.contains('content-filtered') !== cached.filtered) queuePost(mutation.target);
                } else if (mutation.target.matches(postSelector)) queuePost(findPost(mutation.target));
                continue;
            }
            queuePost(findPost(mutation.target));
            for (const node of mutation.addedNodes) collectPosts(node);
        }
    });
    observer.observe(document.documentElement, {
        childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['post-title', 'subreddit-prefixed-name', 'subreddit-name', 'permalink',
            'content-href', 'href', 'id', 'data-fullname', 'slot', 'data-testid', 'class']
    });
    collectPosts(document.body);
})();