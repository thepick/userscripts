// ==UserScript==
// @name         Bluesky Multi-Column
// @namespace    https://greasyfork.org/en/users/567951-stuart-saddler
// @version      2026.11.2.2
// @description  Configurable Bluesky masonry feeds with navigation recovery and sidebar controls.
// @author       Pedro; thepick
// @license      MIT
// @homepageURL  https://github.com/thepick/userscripts/blob/main/bluesky-enhanced-layout.user.js
// @match        https://bsky.app/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @downloadURL https://update.greasyfork.org/scripts/520439/Bluesky%20Multi-Column.user.js
// @updateURL https://update.greasyfork.org/scripts/520439/Bluesky%20Multi-Column.meta.js
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

// Adapted from Reddit Multi-Column Robust 2026.11.2.2:
// https://github.com/thepick/userscripts/blob/a9a50648d1c874618253f1cea4ea80c93bb7ee86/reddit-multi-column-robust.user.js
(function () {
'use strict';

const bmcSettings = Object.freeze({
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
const root = document.documentElement;
const style = document.createElement('style');
style.textContent = `
    @media (min-width: 800px) {
        .bmc-active .bmc-center {
            width: var(--bmc-content-width) !important;
            max-width: var(--bmc-content-width) !important;
            margin-left: var(--bmc-content-left) !important;
            margin-right: 0 !important;
            transform: none !important;
            box-sizing: border-box !important;
        }
        .bmc-active .bmc-left-nav { left: 0 !important; transform: none !important; }
        .bmc-active .bmc-center > [role="tablist"] { width: 100% !important; max-width: none !important; }
        .bmc-active .bmc-right-nav { left: auto !important; right: 0 !important; transform: none !important; }
        .bmc-active .bmc-center-border { display: none !important; }
        .bmc-active.bmc-hide-right .bmc-right-nav {
            transform: translateX(calc(100% - 24px)) !important;
            background: var(--bmc-background, Canvas);
            z-index: 100;
            overflow-y: auto !important;
        }
        .bmc-active.bmc-hide-right .bmc-right-nav:is(:hover, :focus-within) { transform: none !important; }
        .bmc-list { position: relative !important; display: block !important; height: var(--bmc-height) !important; min-height: 0 !important; }
        .bmc-item {
            position: absolute !important; left: var(--bmc-x) !important; top: var(--bmc-y) !important;
            width: var(--bmc-width) !important; min-width: 0 !important; max-width: none !important;
            box-sizing: border-box !important;
        }
    }
`;
root.append(style);
let settings = bmcSettings.normalize();
let postsContainer = null;
let rows = new Set();
let columns = new WeakMap();
let numOfColumns = 0;
let framePending = false;
const ownStyles = new WeakMap();
const sizes = new WeakMap();
function setVariable(element, name, value) {
    if (element.style.getPropertyValue(name) === value) return;
    element.style.setProperty(name, value);
    ownStyles.set(element, element.getAttribute('style'));
}
function toggle(element, name, enabled) {
    if (element.classList.contains(name) !== enabled) element.classList.toggle(name, enabled);
}
function scheduleLayout() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => { framePending = false; layout(); });
}
const resizeObserver = new ResizeObserver(entries => {
    let changed = false;
    for (const {target} of entries) {
        const rect = target.getBoundingClientRect();
        const size = `${rect.width}:${rect.height}`;
        if (sizes.get(target) !== size) { sizes.set(target, size); changed = true; }
    }
    if (changed) scheduleLayout();
});
function releaseRow(row) {
    resizeObserver.unobserve(row);
    row.classList.remove('bmc-item');
    for (const name of ['--bmc-x', '--bmc-y', '--bmc-width']) row.style.removeProperty(name);
    ownStyles.set(row, row.getAttribute('style'));
    columns.delete(row);
}
function releaseFeed() {
    for (const row of rows) releaseRow(row);
    rows.clear();
    if (postsContainer) {
        resizeObserver.unobserve(postsContainer);
        postsContainer.classList.remove('bmc-list');
        postsContainer.style.removeProperty('--bmc-height');
        ownStyles.set(postsContainer, postsContainer.getAttribute('style'));
    }
    postsContainer = null;
    columns = new WeakMap();
    numOfColumns = 0;
}
function findRightNav(main) {
    const anchors = document.querySelectorAll('[role="combobox"], a[href="https://bsky.social/about/support/privacy-policy"]');
    for (const anchor of anchors) {
        if (main.contains(anchor)) continue;
        for (let node = anchor.parentElement; node && node !== document.body; node = node.parentElement) {
            if (getComputedStyle(node).position === 'fixed' && node.offsetWidth > 0) return node;
        }
    }
    return null;
}
function findFeed(main) {
    if (location.pathname !== '/' && !/^\/profile\/[^/]+\/(?:feed|lists)\/[^/]+\/?$/.test(location.pathname)) return null;
    for (const post of main.querySelectorAll('[data-testid$="-feed-flatlist"] [data-testid^="feedItem-by-"]')) {
        if (!post.offsetWidth || getComputedStyle(post).visibility === 'hidden') continue;
        // Position native row wrappers so React keeps ownership of their posts and handlers.
        const row = post.closest('[data-list-row]');
        if (row) return row.parentElement;
    }
    return null;
}
function layout() {
    const main = document.querySelector('main, [role="main"]');
    const left = document.querySelector('nav[role="navigation"]');
    const active = innerWidth >= 800 && Boolean(main && left?.offsetWidth);
    toggle(root, 'bmc-active', active);
    if (!active) { toggle(root, 'bmc-hide-right', false); releaseFeed(); return; }
    const right = findRightNav(main);
    for (const node of document.querySelectorAll('.bmc-left-nav')) if (node !== left) node.classList.remove('bmc-left-nav');
    for (const node of document.querySelectorAll('.bmc-right-nav')) if (node !== right) node.classList.remove('bmc-right-nav');
    toggle(left, 'bmc-left-nav', true);
    if (right) toggle(right, 'bmc-right-nav', true);
    const feed = findFeed(main);
    const hideRight = settings.autoHideRSidebar || (settings.autoHideRSidebarFeedPages && Boolean(feed));
    toggle(root, 'bmc-hide-right', hideRight);
    for (const node of main.querySelectorAll('[style*="max-width"]')) {
        if (node.style.maxWidth === '600px' && !node.parentElement.closest('.bmc-center')) toggle(node, 'bmc-center', true);
    }
    for (const node of main.querySelectorAll('[style*="602px"]')) {
        if (node.style.width === '602px' && getComputedStyle(node).position === 'fixed') toggle(node, 'bmc-center-border', true);
    }
    const leftWidth = left.offsetWidth;
    const rightWidth = right ? (hideRight ? 24 : right.offsetWidth) : 0;
    const available = Math.max(1, root.clientWidth - leftWidth - rightWidth - 24);
    const minimum = Math.min(settings.minColumnWidth, settings.maxColumnWidth);
    const count = feed ? Math.max(1, Math.min(settings.maxNumOfColumns, Math.floor((available + 12) / (minimum + 12)))) : 1;
    const gap = count > 1 ? 12 : 0;
    const contentWidth = Math.min(available, feed ? count * settings.maxColumnWidth + gap * (count - 1) : settings.maxContWidth);
    setVariable(root, '--bmc-content-width', `${contentWidth}px`);
    setVariable(root, '--bmc-content-left', `${leftWidth + 12 + (available - contentWidth) / 2}px`);
    const center = [...main.querySelectorAll('.bmc-center')].find(node => node.offsetWidth > 0);
    for (let node = center; node && node !== document.body; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
            setVariable(root, '--bmc-background', color);
            break;
        }
    }
    if (feed !== postsContainer) { releaseFeed(); postsContainer = feed; if (feed) resizeObserver.observe(feed); }
    if (!feed) return;
    if (count !== numOfColumns) { numOfColumns = count; columns = new WeakMap(); }
    toggle(feed, 'bmc-list', true);
    const nextRows = new Set([...feed.children].filter(node => getComputedStyle(node).position !== 'fixed'));
    for (const row of rows) if (!nextRows.has(row)) releaseRow(row);
    rows = nextRows;
    const columnWidth = Math.max(1, (feed.clientWidth - gap * (count - 1)) / count);
    const heights = Array(count).fill(0);
    let previousColumn = null;
    for (const row of rows) {
        const css = getComputedStyle(row);
        if (css.display === 'none' || css.visibility === 'hidden') { columns.delete(row); previousColumn = null; continue; }
        const marker = css.pointerEvents === 'none' && css.zIndex === '-1';
        const posts = [...row.querySelectorAll('[data-testid^="feedItem-by-"]')];
        const threadLink = !posts.length && row.querySelector(':scope > a[href*="/post/"]');
        const card = posts.length > 0 || Boolean(threadLink);
        if (posts.length && posts.every(post => !post.offsetWidth || getComputedStyle(post).visibility === 'hidden')) {
            columns.delete(row); previousColumn = null; continue;
        }
        // shortcut: Bluesky marks split thread continuations with a zero top border; revisit if its feed markup changes.
        const border = posts[0]?.matches('[style*="border-top-width"]') ? posts[0] : posts[0]?.querySelector('[style*="border-top-width"]');
        const continuation = previousColumn !== null && (Boolean(threadLink) || border?.style.borderTopWidth === '0px');
        const column = card ? (continuation ? previousColumn : columns.get(row) ?? heights.indexOf(Math.min(...heights))) : 0;
        const top = card ? heights[column] - (continuation ? gap : 0) : Math.max(...heights);
        toggle(row, 'bmc-item', true);
        setVariable(row, '--bmc-x', `${card ? column * (columnWidth + gap) : 0}px`);
        setVariable(row, '--bmc-y', `${top}px`);
        setVariable(row, '--bmc-width', `${card ? columnWidth : feed.clientWidth}px`);
        // Absolute cards leave no flow space; move the native end detector below them to avoid runaway loading.
        if (marker) continue;
        resizeObserver.observe(row);
        const height = row.getBoundingClientRect().height;
        if (!height) continue;
        if (card) { heights[column] = top + height + gap; columns.set(row, column); previousColumn = column; }
        else { heights.fill(top + height + gap); previousColumn = null; }
    }
    setVariable(feed, '--bmc-height', `${Math.max(...heights)}px`);
}
new MutationObserver(records => {
    if (records.some(record => record.type === 'childList' || record.attributeName !== 'style' ||
        ownStyles.get(record.target) !== record.target.getAttribute('style'))) scheduleLayout();
}).observe(root, {childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']});
window.addEventListener('popstate', scheduleLayout);
window.addEventListener('pageshow', scheduleLayout);
window.addEventListener('resize', scheduleLayout);
let lastURL = location.href;
// Userscript isolation makes wrapping the page's History methods unreliable.
setInterval(() => { if (location.href !== lastURL) { lastURL = location.href; scheduleLayout(); } }, 750);
function applySettings(values) {
    settings = bmcSettings.normalize(values);
    columns = new WeakMap();
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
        host.id = 'bmc-userscript-settings';
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
                #bmc-status { margin: 0 0 16px; }
                #bmc-status:empty { display: none; }
                @media (max-width: 420px) { dialog { padding: 16px; } label { gap: 8px; } input[type=number] { width: 82px; } }
            </style>
            <dialog aria-labelledby="bmc-title">
              <form>
                <h2 id="bmc-title">Bluesky Multi-Column settings</h2>
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
                <p id="bmc-status" role="status" aria-live="polite"></p>
                <footer><button type="button" id="bmc-close">Cancel</button><button type="submit" id="bmc-save">Save settings</button></footer>
              </form>
            </dialog>`;
        const dialog = panel.querySelector('dialog');
        panel.getElementById('bmc-close').addEventListener('click', () => dialog.close());
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
            for (const key of Object.keys(bmcSettings.defaults)) {
                const input = panel.getElementById(key);
                const value = input.type === 'checkbox' ? input.checked : Number(input.value);
                if (value !== panelSettings[key]) changes[key] = value;
            }
            if (changes.autoHideRSidebar) changes.autoHideRSidebarFeedPages = false;
            if (changes.autoHideRSidebarFeedPages) changes.autoHideRSidebar = false;
            try {
                // Preserve fields changed in another tab while this dialog was open.
                const next = bmcSettings.normalize({ ...GM_getValue('settings', settings), ...changes });
                GM_setValue('settings', next);
                applySettings(next);
                storageError = '';
                dialog.close();
            } catch {
                panel.getElementById('bmc-status').textContent = 'Settings could not be saved. Your changes are still here; try Save settings again.';
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
    panel.getElementById('bmc-status').textContent = storageError;
    dialog.showModal();
}
GM_registerMenuCommand('Bluesky Multi-Column settings', openSettings);

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