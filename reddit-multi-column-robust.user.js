// ==UserScript==
// @name         Reddit Multi-Column Robust
// @namespace    https://github.com/thepick/reddit-multi-column
// @version      2026.11.2.1
// @description  Configurable Reddit masonry columns with navigation recovery and sidebar controls.
// @author       Pedro; thepick
// @license      MIT
// @match        https://www.reddit.com/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// ==/UserScript==

/*
MIT License

Copyright (c) 2024 Pedro

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// Based on thepick/reddit-multi-column cb9c4ee51c4dbc455bf34759e8cf38672597b31e.
// Layout and overlap handling are retained from extension version 2026.11.1.2.
(function () {
'use strict';

// Shared by the isolated content script and options page; no page-event bridge.
const rmcSettings = Object.freeze({
    defaults: Object.freeze({
        maxNumOfColumns: 5, minColumnWidth: 450, maxColumnWidth: 732, maxContWidth: 732,
        autoHideRSidebar: false, autoHideRSidebarFeedPages: false
    }),
    limits: Object.freeze({
        maxNumOfColumns: [1, 20], minColumnWidth: [100, 10000],
        maxColumnWidth: [100, 10000], maxContWidth: [100, 10000]
    }),
    normalize(values = {}) {
        const settings = { ...this.defaults };
        for (const [key, [min, max]] of Object.entries(this.limits)) {
            const raw = values?.[key];
            const value = typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : NaN;
            if (Number.isFinite(value) && value > 0) settings[key] = Math.min(max, Math.max(min, Math.floor(value)));
        }
        settings.autoHideRSidebar = values?.autoHideRSidebar === true;
        settings.autoHideRSidebarFeedPages = !settings.autoHideRSidebar && values?.autoHideRSidebarFeedPages === true;
        return settings;
    }
});

function start() {
const style = document.createElement('style');
style.textContent = "@media (min-width: 768px) {\n    :root {\n        --rmc-gap: 2rem;\n    }\n}\n\n@media (min-width: 1200px) {\n    :root {\n        --rmc-gap: 3rem;\n        --rmc-left-sidebar: 32px;\n    }\n    \n    .flex-nav-expanded {\n        --rmc-left-sidebar: 272px\n    }\n}\n\n@media (min-width: 960px) {\n    :root:not(.rmc-auto-hide-r-sidebar, .rmc-feed-page.rmc-auto-hide-r-sidebar-feed-pages) {\n        --rmc-right-sidebar: 316px;\n        --rmc-right-sidebar-gap: 1.5rem;\n        --rmc-minmax: minmax(0, 1fr) minmax(0, var(--rmc-right-sidebar));\n    }\n}\n\n[class*=\"minmax\\(0\\2c 316px\"] {\n    grid-template-columns: var(--rmc-minmax, minmax(0, 1fr)) !important;\n}\n\n:root .subgrid-container.rmc-feed-container {\n    width: calc(100vw - var(--flex-nav-width, 0px)) !important;\n    max-width: calc((var(--rmc-columns)*var(--rmc-max-column-width)) + var(--rmc-right-sidebar, 0px) + var(--rmc-right-sidebar-gap, 0px) + var(--rmc-gap, 0px)) !important;\n    transition: initial !important;\n}\n\n:root .subgrid-container:not(.rmc-feed-container) {\n    width: calc(100vw - var(--flex-nav-width, 0px)) !important;\n    max-width: calc((1*var(--rmc-max-cont-width)) + var(--rmc-right-sidebar, 0px) + var(--rmc-right-sidebar-gap, 0px) + var(--rmc-gap, 0px)) !important;\n    transition: initial !important;\n}\n\n:root.rmc-auto-hide-r-sidebar-feed-pages .rmc-feed-container {\n    --rmc-right-sidebar: 0px;\n    --rmc-right-sidebar-gap: 0px;\n    --rmc-minmax: minmax(0, 1fr);\n}\n\n:root:is(.rmc-auto-hide-r-sidebar, .rmc-feed-page.rmc-auto-hide-r-sidebar-feed-pages) #right-sidebar-container,\n:root.rmc-auto-hide-r-sidebar-feed-pages .rmc-feed-container #right-sidebar-container {\n    position: fixed;\n    height: 100vh;\n    top: 0;\n    right: 0;\n    max-height: initial;\n    overflow-y: auto;\n    overflow-x: hidden;\n    z-index: 999;\n    padding-left: 1.5rem;\n    transform: translateX(calc(100% - 1.5rem));\n    transition: transform 0.3s ease;\n    scrollbar-width: thin;\n}\n\n:root:is(.rmc-auto-hide-r-sidebar, .rmc-feed-page.rmc-auto-hide-r-sidebar-feed-pages) #right-sidebar-container:hover,\n:root.rmc-auto-hide-r-sidebar-feed-pages .rmc-feed-container #right-sidebar-container:hover {\n    transform: translateX(0);\n}\n\n:root:is(.rmc-auto-hide-r-sidebar, .rmc-feed-page.rmc-auto-hide-r-sidebar-feed-pages) #right-sidebar-container .legal-links,\n:root.rmc-auto-hide-r-sidebar-feed-pages .rmc-feed-container #right-sidebar-container .legal-links,\nshreddit-ad-post,\nshreddit-feed.nd\\:visible:not(:defined) [slot='loader'] {\n    display: none !important;\n}\n\n.flex-grid--main-container-card,\n.main-container {\n    max-width: initial !important;\n}\n\nshreddit-feed.nd\\:visible:not(:defined) {\n    display: block !important;\n}\n\narticle[style] + hr {\n    border-color: transparent;\n}\n\n/* Tries to fix the grid acting weird when scrolling up (does not appear to happen in subreddits) */\nshreddit-feed[style]:not(.rmc-has-batch) .virtualized-placeholder {\n    position: absolute;\n}\n";
document.documentElement.append(style);
let settings = rmcSettings.normalize();
const div = document.createElement('div');
div.style = 'width: calc(100vw - var(--rmc-left-sidebar, 0px) - var(--rmc-gap, 0px) - var(--rmc-right-sidebar, 0px) - var(--rmc-right-sidebar-gap, 0px))';

let numOfColumns, width, postsContainer;
let outgoingFeed = null;
let layoutContainer = null;
let maxNumOfColumns = settings.maxNumOfColumns;
let minColumnWidth = settings.minColumnWidth;
let heights = [];
let heightsBatch = [];
let framePending = false;
let lastFeedWidth = 0;
const cardSizes = new WeakMap();
const candidateFeeds = new Set();
const candidateWidths = new WeakMap();
const visibilityObserver = new ResizeObserver(function (entries) {
    for (const { target } of entries) {
        if (candidateWidths.get(target) !== target.offsetWidth) {
            candidateWidths.set(target, target.offsetWidth);
            scheduleLayout();
        }
    }
});
const cardObserver = new ResizeObserver(function (entries) {
    let changed = false;
    for (const { target } of entries) {
        const size = `${target.offsetWidth}:${target.offsetHeight}`;
        if (cardSizes.get(target) !== size) {
            cardSizes.set(target, size);
            changed = true;
        }
    }
    if (changed) scheduleLayout();
});
function scheduleLayout() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(function () {
        framePending = false;
        handlePageNav();
        if (!postsContainer?.isConnected) return;
        addPostsToArray();
        handlePageResize();
        arrangePosts();
    });
}
new MutationObserver(function () {
    scheduleLayout();
}).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['routename']
});

window.addEventListener('popstate', scheduleLayout);
window.addEventListener('pageshow', scheduleLayout);
window.addEventListener('resize', scheduleLayout);

function handlePageNav() {
    const isPost = /^\/(?:r\/[^/]+\/|(?:user|u)\/[^/]+\/)?comments\/[^/]+(?:\/|$)/.test(location.pathname);
    const isShare = /^\/(?:r\/[^/]+\/)?s\/[^/]+(?:\/|$)/.test(location.pathname);
    const candidates = Array.from(document.querySelectorAll('shreddit-app:not([routename^="profile"]):not([routename="explore-page"]) shreddit-feed'));
    const currentCandidates = new Set(candidates);
    for (const candidate of candidateFeeds) {
        if (!currentCandidates.has(candidate)) {
            visibilityObserver.unobserve(candidate);
            candidateFeeds.delete(candidate);
        }
    }
    for (const candidate of candidates) {
        if (!candidateFeeds.has(candidate)) {
            candidateFeeds.add(candidate);
            visibilityObserver.observe(candidate);
        }
    }
    const visibleFeed = candidates.find(candidate => candidate.offsetWidth > 0) || null;
    const feed = isPost || isShare ? null : visibleFeed;
    if (!isPost && !isShare) outgoingFeed = null;
    else if (postsContainer) outgoingFeed = postsContainer;
    if (outgoingFeed && (!currentCandidates.has(outgoingFeed) || !outgoingFeed.isConnected || !outgoingFeed.offsetWidth)) outgoingFeed = null;
    const layoutFeed = isPost || isShare ? outgoingFeed : visibleFeed;
    // Keep width on the outgoing feed's container, not a concurrently opening post.
    const container = layoutFeed?.closest('.subgrid-container') || null;
    if (container !== layoutContainer) {
        layoutContainer?.classList.remove('rmc-feed-container');
        layoutContainer = container;
    }
    if (container && !container.classList.contains('rmc-feed-container')) container.classList.add('rmc-feed-container');
    if (document.documentElement.classList.contains('rmc-feed-page') !== Boolean(feed)) {
        document.documentElement.classList.toggle('rmc-feed-page', Boolean(feed));
    }
    if (feed === postsContainer) return;
    cardObserver.disconnect();
    feedObserver.disconnect();
    postsContainer = feed;
    lastFeedWidth = 0;
    if (postsContainer) {

        postsContainer.after(div);
        feedObserver.observe(postsContainer);
        if (!numOfColumns) columns();
        if (!postsContainer.posts) {
            postsContainer.style.position = 'relative';
            postsContainer.posts = [];
        }

        for (const post of postsContainer.posts) {
            delete post.column;
            if (post.isConnected) cardObserver.observe(post);
        }
    } else div.remove();
}

function addPostsToArray() {
    if (!postsContainer?.isConnected) return;
    const isHidden = post => post.style.display === 'none' || post.style.visibility === 'hidden';
    const newPosts = Array.from(postsContainer.querySelectorAll(':is(article, in-feed-wiki-page-carousel, in-feed-community-recommendations)')).filter(post => !isHidden(post));
    postsContainer.posts = postsContainer.posts.filter(function (post) {
        if (!isHidden(post)) return true;
        cardObserver.unobserve(post);
        return false;
    });

    // All the old posts were removed
    // Retain off-screen slots only while Reddit still exposes virtualization placeholders.
    if (!postsContainer.querySelector('.virtualized-placeholder')) {
        const livePosts = new Set(newPosts);
        for (const post of postsContainer.posts) if (!livePosts.has(post)) cardObserver.unobserve(post);
        postsContainer.posts = Array.from(newPosts);
    }

    const knownPosts = new Set(postsContainer.posts);
    const detachedById = new Map();
    function postId(post) { return post.querySelector('shreddit-post')?.id || post.id; }
    postsContainer.posts.forEach(function (post, index) {
        const id = postId(post);
        if (!post.isConnected && id) detachedById.set(id, { post, index });
    });
    for (let i = 0; i < newPosts.length; i++) {
        const post = newPosts[i];
        if (!knownPosts.has(post)) {
            const saved = detachedById.get(postId(post));
            if (saved) {
                post.column = saved.post.column;
                post.height = saved.post.height;
                postsContainer.posts[saved.index] = post;
                cardObserver.unobserve(saved.post);
                detachedById.delete(postId(post));
            } else postsContainer.posts.push(post);
            knownPosts.add(post);
        }
        cardObserver.observe(post);
    }
}

function arrangePosts() {
    if (!postsContainer?.isConnected || !numOfColumns) return;
    let post, shortestCol;
    for (let i = 0; i < postsContainer.posts.length; i++) {
        post = postsContainer.posts[i];
        shortestCol = post.column ?? getShortestCol(heights);

        if (post.isConnected) {
            post.style = `
                position: absolute;
                width: var(--rmc-post-width);
                left: ${width * shortestCol}%;
                top: ${heights[shortestCol]}px;
                box-sizing: border-box;
                `;
            heights[shortestCol] += post.offsetHeight;
            post.height = post.offsetHeight;
            post.column = shortestCol;
            if (!post.parentElement.posts) {
                heightsBatch[getShortestCol(heightsBatch)] += post.offsetHeight;
                if (!post.nextElementSibling?.nextElementSibling) {
                    postsContainer.classList.add('rmc-has-batch');
                    post.parentElement.style.minHeight = Math.max(...heightsBatch) + 'px';
                    for (let i = 0; i < heightsBatch.length; i++) {
                        heightsBatch[i] = 0;
                    }
                }
            }
        } else {
            heights[shortestCol] += post.height;
        }
    }

    const loadMorePostsEl = getLoadMorePostsEl();

    if (loadMorePostsEl) {
        shortestCol = getShortestCol(heights);
        loadMorePostsEl.style = `
            position: absolute;
            width: var(--rmc-post-width);
            left: ${width * shortestCol}%;
            top: ${heights[shortestCol]}px;
            `;
        postsContainer.style.height = Math.max(...heights) + loadMorePostsEl.offsetHeight + 'px';
    } else {
        postsContainer.style.height = Math.max(...heights) + 'px';
    }
    for (let i = 0; i < heights.length; i++) {
        heights[i] = 0;
    }
}

function getLoadMorePostsEl() {
    let el = postsContainer.lastElementChild;
    if (el?.attributes.method) return el;

    for (let i = 0; i < 5; i++) {
        if (el?.attributes.method) return el;
        else if (el) el = el.previousElementSibling;
        else break;
    }
}

function calcNumOfColumns() {
    for (let i = maxNumOfColumns; i > 0; i--) {
        if (div.clientWidth / i >= minColumnWidth) {
            document.documentElement.style.setProperty('--rmc-columns', i);
            return i;
        }
    }
    document.documentElement.style.setProperty('--rmc-columns', 1);
    return 1;
}

function getShortestCol(array) {
    let column = 0;
    for (let i = 1; i < array.length; i++) {
        if (array[column] > array[i]) {
            column = i;
        }
    }
    return column;
}

function handlePageResize() {
    if (!postsContainer?.isConnected) return;
    const feedWidth = postsContainer.offsetWidth;
    if (!feedWidth) return;
    if (calcNumOfColumns() != numOfColumns) {
        columns();
        for (let i = 0; i < postsContainer.posts.length; i++) {
            delete postsContainer.posts[i].column;
        }
    } else if (lastFeedWidth !== feedWidth) {
        document.documentElement.style.setProperty('--rmc-post-width', postsContainer.offsetWidth / numOfColumns + 'px');
    }
    lastFeedWidth = postsContainer.offsetWidth;
}

function columns() {
    numOfColumns = calcNumOfColumns() || 1;
    document.documentElement.style.setProperty('--rmc-post-width', postsContainer.offsetWidth / numOfColumns + 'px');
    width = 100 / numOfColumns;
    heights = [];
    heightsBatch = [];
    for (let i = 0; i < numOfColumns; i++) {
        heights.push(0);
        heightsBatch.push(0);
    }
}

const feedObserver = new ResizeObserver(function () {
    if (postsContainer?.isConnected && postsContainer.offsetWidth !== lastFeedWidth) scheduleLayout();
});
new ResizeObserver(scheduleLayout).observe(div);

window.addEventListener('scrollend', function () {
    if (postsContainer?.isConnected) scheduleLayout();
});

function applySettings(values) {
    settings = rmcSettings.normalize(values);
    maxNumOfColumns = settings.maxNumOfColumns;
    minColumnWidth = settings.minColumnWidth;
    document.documentElement.style.setProperty('--rmc-max-column-width', settings.maxColumnWidth + 'px');
    document.documentElement.style.setProperty('--rmc-max-cont-width', settings.maxContWidth + 'px');
    document.documentElement.classList.toggle('rmc-auto-hide-r-sidebar', settings.autoHideRSidebar);
    document.documentElement.classList.toggle('rmc-auto-hide-r-sidebar-feed-pages', settings.autoHideRSidebarFeedPages);
    lastFeedWidth = 0;
    scheduleLayout();
}


let storageError = '';
try { applySettings(GM_getValue('settings', {})); }
catch { applySettings({}); storageError = 'Saved settings could not be loaded. Defaults are active; you can try saving again.'; }
GM_addValueChangeListener('settings', function (_key, _oldValue, newValue) {
    applySettings(newValue);
});
let panel;
let opener;
let panelSettings;
function openSettings() {
    if (!panel) {
        const host = document.createElement('div');
        host.id = 'rmc-userscript-settings';
        document.documentElement.append(host);
        panel = host.attachShadow({ mode: 'open' });
        panel.innerHTML = `
            <style>
                :host { color-scheme: light dark; }
                dialog { color: CanvasText; background: Canvas; border: 1px solid GrayText; border-radius: 12px; padding: 24px; width: min(440px, calc(100vw - 64px)); max-height: calc(100vh - 64px); overflow: auto; font: 15px/1.45 system-ui, sans-serif; }
                dialog::backdrop { background: rgb(0 0 0 / 55%); }
                h2 { font-size: 21px; margin: 0 0 20px; }
                fieldset { border: 0; padding: 0; margin: 0 0 20px; min-width: 0; }
                legend { font-weight: 650; margin-bottom: 10px; }
                label { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin: 10px 0; }
                input[type=number] { box-sizing: border-box; width: 100px; min-height: 36px; padding: 5px 8px; font: inherit; font-variant-numeric: tabular-nums; }
                input[type=checkbox] { width: 20px; height: 20px; flex-shrink: 0; }
                button { min-height: 40px; padding: 7px 14px; font: inherit; cursor: pointer; }
                :focus-visible { outline: 2px solid Highlight; outline-offset: 3px; }
                footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; }
                #rmc-status { margin: 0 0 16px; }
                #rmc-status:empty { display: none; }
                @media (max-width: 420px) { dialog { padding: 16px; } label { gap: 8px; } input[type=number] { width: 82px; } }
            </style>
            <dialog aria-labelledby="rmc-title">
              <form>
                <h2 id="rmc-title">Reddit Multi-Column settings</h2>
                <fieldset><legend>Feed pages</legend>
                  <label>Maximum columns <input autofocus type="number" id="maxNumOfColumns" min="1" max="20" step="1" required></label>
                  <label>Minimum column width (px) <input type="number" id="minColumnWidth" min="100" max="10000" step="1" required></label>
                  <label>Maximum column width (px) <input type="number" id="maxColumnWidth" min="100" max="10000" step="1" required></label>
                </fieldset>
                <fieldset><legend>Other pages</legend>
                  <label>Maximum content width (px) <input type="number" id="maxContWidth" min="100" max="10000" step="1" required></label>
                </fieldset>
                <fieldset><legend>Auto-hide right sidebar</legend>
                  <label>Everywhere <input type="checkbox" id="autoHideRSidebar"></label>
                  <label>Feed pages only <input type="checkbox" id="autoHideRSidebarFeedPages"></label>
                </fieldset>
                <p id="rmc-status" role="status" aria-live="polite"></p>
                <footer><button type="button" id="rmc-close">Cancel</button><button type="submit" id="rmc-save">Save settings</button></footer>
              </form>
            </dialog>`;
        const dialog = panel.querySelector('dialog');
        panel.getElementById('rmc-close').addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus(); });
        panel.addEventListener('change', function (event) {
            const input = event.target;
            if (input.type !== 'checkbox' || !input.checked) return;
            const peer = input.id === 'autoHideRSidebar' ? 'autoHideRSidebarFeedPages' : 'autoHideRSidebar';
            panel.getElementById(peer).checked = false;
        });
        panel.querySelector('form').addEventListener('submit', function (event) {
            event.preventDefault();
            const changes = {};
            for (const key of Object.keys(rmcSettings.defaults)) {
                const input = panel.getElementById(key);
                const value = input.type === 'checkbox' ? input.checked : Number(input.value);
                if (value !== panelSettings[key]) changes[key] = value;
            }
            if (changes.autoHideRSidebar) changes.autoHideRSidebarFeedPages = false;
            if (changes.autoHideRSidebarFeedPages) changes.autoHideRSidebar = false;
            try {
                // Preserve fields changed in another tab while this dialog was open.
                const next = rmcSettings.normalize({ ...GM_getValue('settings', settings), ...changes });
                GM_setValue('settings', next);
                applySettings(next);
                storageError = '';
                dialog.close();
            } catch {
                panel.getElementById('rmc-status').textContent = 'Settings could not be saved. Your changes are still here; try Save settings again.';
            }
        });
    }
    const dialog = panel.querySelector('dialog');
    if (dialog.open) { panel.getElementById('maxNumOfColumns').focus(); return; }
    opener = document.activeElement;
    panelSettings = { ...settings };
    for (const [key, value] of Object.entries(settings)) {
        const input = panel.getElementById(key);
        if (input.type === 'checkbox') input.checked = value;
        else input.value = String(value);
    }
    panel.getElementById('rmc-status').textContent = storageError;
    dialog.showModal();
}
GM_registerMenuCommand('Reddit Multi-Column settings', openSettings);

}
if (document.documentElement) start();
else {
    const observer = new MutationObserver(function () {
        if (!document.documentElement) return;
        observer.disconnect();
        start();
    });
    observer.observe(document, { childList: true });
}
})();

