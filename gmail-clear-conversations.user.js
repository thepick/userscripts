// ==UserScript==
// @name         Gmail Clear Conversations
// @namespace    https://greasyfork.org/en/users/567951-stuart-saddler
// @version      0.4.4
// @description  Newest email first with Gmail's native reply editor and controls preserved.
// @match        https://mail.google.com/mail/*
// @run-at       document-idle
// @inject-into  content
// @noframes
// @grant        GM_info
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/602917/Gmail%20Clear%20Conversations.user.js
// @updateURL https://update.greasyfork.org/scripts/602917/Gmail%20Clear%20Conversations.meta.js
// ==/UserScript==
// Source: https://github.com/thepick/userscripts

(() => {
  'use strict';

  const VERSION = '0.4.4', BUILD = 'gcc-maintenance-2026-11-13-r1';
  const EXCLUDED = '.a3s, .gmail_quote, [contenteditable], [role="dialog"]';
  const MESSAGE = '.h7, .kv, .adn, [data-message-id]';
  const CLASSES = ['gcc-message', 'gcc-latest', 'gcc-footer', 'gcc-joined'];
  const lists = new Map();
  let enabled = true, hideSuggestions = true, timer;
  let pending = [];
  let renderFailed = false, healthFailure = null, warning = null, warningReason = null;
  let diagnosticDialog = null;
  try {
    if (typeof GM_getValue === 'function') enabled = GM_getValue('enabled', true) !== false;
    if (typeof GM_getValue === 'function') hideSuggestions = GM_getValue('hideSuggestions', true) !== false;
  } catch (e) { /* Preference storage must not prevent using the layout. */ }

  const style = document.createElement('style');
  style.dataset.gccVersion = VERSION;
  style.dataset.gccBuild = BUILD;
  style.textContent = `
    .gcc-controls { display:flex; align-items:center; justify-content:flex-start; flex-wrap:wrap; gap:8px 16px; margin:8px 0 14px; font:12px/1.5 Arial,sans-serif; color:inherit; }
    .gcc-controls > span { min-width:0; overflow-wrap:anywhere; }
    .gcc-controls button { font:inherit; color:inherit; background:transparent; border:1px solid rgba(100,121,143,.4); border-radius:6px; padding:6px 10px; cursor:pointer; }
    .gcc-controls button:hover { background:rgba(100,121,143,.1); }
    .gcc-controls button:focus-visible { outline:2px solid currentColor; outline-offset:3px; }
    [data-gcc-pane] { box-sizing:border-box; width:auto !important; margin-inline:0 !important; padding-inline:12px !important; }
    [data-gcc-pane] [data-gcc-list] { width:auto !important; margin-inline:0 !important; padding-inline:0 !important; }
    [data-gcc-list] > .gcc-message { margin:10px 0 !important; border:1px solid rgba(100,121,143,.24); border-radius:12px; }
    [data-gcc-list] > .gcc-latest { margin:0 0 26px !important; border-color:rgba(80,130,220,.55); }
    [data-gcc-list] > .gcc-latest::before { content:'Latest message'; display:block; padding:7px 16px; background:rgba(80,130,220,.09); border-radius:11px 11px 0 0; font:12px/1.5 Arial,sans-serif; color:inherit; }
    [data-gcc-list] > .gcc-message .G3.G2 { border:0 !important; }
    [data-gcc-list] > .gcc-message .a3s { box-sizing:border-box; padding-right:20px !important; overflow-wrap:anywhere; }
    [data-gcc-list] > .gcc-message .ip { margin-top:6px !important; padding-top:0 !important; }
    [data-gcc-list] > .gcc-message .gA.gt { padding-top:6px !important; }
    [data-gcc-list] > .gcc-message .ip [contenteditable="true"][role="textbox"] { min-height:96px !important; }
    [data-gcc-hide-suggestions] > .gcc-message .gA.gt .brb { display:none !important; }
    .gcc-quote-intro { font-size:0 !important; line-height:0 !important; margin:4px 0 !important; padding:0 !important; }
    .gcc-quote-intro > :not(.yj6qo) { display:none !important; }
    .gcc-quote-intro > .yj6qo { font-size:13px; line-height:normal; margin:0 !important; padding:0 !important; }
    .gcc-quote-intro .ajR { margin:0 !important; padding:0 !important; }
    .gcc-quote-spacer { display:none !important; }
    .gcc-actions { display:flex !important; flex-wrap:wrap; gap:8px; height:auto !important; margin:0 !important; padding:0 !important; }
    .gcc-actions .ams { border-radius:20px !important; }
    .gcc-actions-widget { margin:0 !important; padding:0 0 16px !important; max-width:100%; }
    .bJvOmf > .gcc-actions-widget { margin:0 20px 0 72px !important; }
    .gcc-actions-origin:empty { display:none !important; }
    .gcc-warning { position:fixed; right:20px; bottom:20px; z-index:2147483647; box-sizing:border-box; width:420px; max-width:calc(100vw - 40px); padding:16px; border:1px solid #936300; border-radius:12px; background:#fff4ce; color:#3b2f10; box-shadow:0 4px 16px rgba(0,0,0,.16); font:14px/1.5 Arial,sans-serif; overflow-wrap:anywhere; }
    .gcc-warning strong { display:block; font-size:15px; }
    .gcc-warning p { margin:8px 0 12px; }
    .gcc-warning button { min-height:32px; padding:6px 12px; border:1px solid #806000; border-radius:6px; background:#fff; color:#3b2f10; font:inherit; cursor:pointer; }
    .gcc-warning button:focus-visible { outline:2px solid #3b2f10; outline-offset:3px; }
    .gcc-diagnostics { box-sizing:border-box; width:min(760px,calc(100vw - 32px)); max-height:calc(100vh - 32px); overflow:auto; padding:20px; border:1px solid #748399; border-radius:12px; color-scheme:light dark; font:14px/1.5 Arial,sans-serif; }
    .gcc-diagnostics::backdrop { background:rgba(0,0,0,.4); }
    .gcc-diagnostics h2 { margin:0 0 8px; font-size:20px; }
    .gcc-diagnostics textarea { box-sizing:border-box; width:100%; height:45vh; min-height:140px; font:12px/1.5 monospace; }
    .gcc-diagnostics button { margin:12px 8px 0 0; min-height:36px; padding:6px 12px; font:inherit; }
    .gcc-diagnostics button:focus-visible, .gcc-diagnostics textarea:focus-visible { outline:2px solid currentColor; outline-offset:3px; }
    @media (pointer:coarse) { .gcc-controls button, .gcc-warning button { min-height:44px; } }
  `;
  document.head.append(style);

  function nativeElements(node, selector) {
    return [node, ...node.querySelectorAll(selector)]
      .filter(element => element.matches(selector) && !element.closest(EXCLUDED));
  }

  function messageRoots(node) {
    const found = nativeElements(node, MESSAGE);
    return found.filter(element => !found.some(other => other !== element && other.contains(element)));
  }

  function unitsOf(list) {
    const units = [];
    for (const node of list.children) {
      const roots = messageRoots(node);
      const atoms = nativeElements(node, '.adn, [data-message-id]');
      const leaves = atoms.filter(element => !atoms.some(other => other !== element && element.contains(other)));
      if (roots.length === 1 && leaves.length <= 1) units.push(node);
      else if (!roots.length && node.matches('.kQ, .kx')) units.push(node);
      else return null;
    }
    return units.length && units.some(node => messageRoots(node).length) ? units : null;
  }

  function discover() {
    const roots = new Map();
    for (const anchor of document.querySelectorAll('.aHU, .nH[role="list"]')) {
      if (anchor.closest(EXCLUDED) || !messageRoots(anchor).length) continue;
      let list = anchor;
      while (!unitsOf(list)) {
        const branches = Array.from(list.children).filter(node => messageRoots(node).length);
        if (branches.length !== 1 || branches[0].matches(MESSAGE)) break;
        list = branches[0];
      }
      roots.set(list, anchor);
    }
    // An outer conversation wrapper must never compete with its specific inner list.
    for (const list of roots.keys()) {
      if (Array.from(roots.keys()).some(inner => inner !== list && list.contains(inner))) roots.delete(list);
    }
    return roots;
  }

  function hasEditor(list) {
    return Array.from(list.querySelectorAll('[contenteditable], textarea'))
      .some(editor => (editor.isContentEditable || editor.matches('textarea')) && !editor.closest('.a3s, .gmail_quote'));
  }

  function details(node) {
    const message = nativeElements(node, '[data-message-id]')[0];
    const header = nativeElements(node, '.g3[title]')[0];
    const title = (header && header.getAttribute('title') || '').replace(/[\u202f\u00a0]/g, ' ');
    // shortcut: trust only unambiguous English full-date headers; other locales pause on updates.
    const supportedDate = /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), )?(?:[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}(?::\d{2})? [AP]M|\d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT)$/;
    const date = supportedDate.test(title) ? Date.parse(title) : NaN;
    return { node, id: message && message.getAttribute('data-message-id') || null, date, placeholder: !messageRoots(node).length };
  }

  function syncOrder(list, state, actual, mutations) {
    if (state.unknown) return;
    const identities = actual.map(node => details(node).id).filter(Boolean);
    if (new Set(identities).size !== identities.length) { state.unknown = true; return; }
    if (!state.reversed) {
      state.native = actual.map(details);
      return;
    }
    for (const node of actual) {
      const info = details(node);
      let known = state.native.find(record => record.node === node);
      if (!known && info.id) known = state.native.find(record => record.id === info.id && record.node.parentElement !== list);
      if (!known) {
        const replacement = mutations.find(change => change.target === list && change.removedNodes.length === 1 && change.addedNodes.length === 1 && change.addedNodes[0] === node);
        const previous = replacement && state.native.find(record => record.node === replacement.removedNodes[0] && record.node.parentElement !== list);
        if (previous && Number.isFinite(info.date) && previous.date === info.date) known = previous;
      }
      if (known) {
        if (known.id && info.id && known.id !== info.id) { state.unknown = true; return; }
        if (Number.isFinite(known.date) && Number.isFinite(info.date) && known.date !== info.date) { state.unknown = true; return; }
        Object.assign(known, info);
        continue;
      }
      const dated = state.native.filter(record => !record.placeholder);
      if (info.placeholder || !Number.isFinite(info.date) || dated.some(record => !Number.isFinite(record.date)) ||
          dated.some((record, index) => index && record.date < dated[index - 1].date) || dated.some(record => record.date === info.date)) {
        state.unknown = true; return;
      }
      const before = state.native.findIndex(record => !record.placeholder && record.date > info.date);
      if (state.native.some(record => record.placeholder) && before !== -1 && info.date > dated[0].date) {
        state.unknown = true; return;
      }
      state.native.splice(before < 0 ? state.native.length : before, 0, info);
    }
  }

  function reorder(list, desired) {
    for (let index = 0; index < desired.length; index++) {
      if (list.children[index] !== desired[index]) list.insertBefore(desired[index], list.children[index] || null);
    }
  }

  function clearLayout(list, state) {
    if (state.anchor) state.anchor.removeAttribute('data-gcc-pane');
    list.removeAttribute('data-gcc-list');
    list.removeAttribute('data-gcc-hide-suggestions');
    for (const node of new Set([...list.children, ...state.native.map(record => record.node)])) {
      node.classList.remove(...CLASSES);
      for (const quote of node.querySelectorAll('.gcc-quote-intro, .gcc-quote-spacer')) quote.classList.remove('gcc-quote-intro', 'gcc-quote-spacer');
    }
  }

  function actionDestination(reply, owner) {
    const table = reply.closest('table.wS');
    // Gmail can hide its empty reply table after the action widget was captured.
    const parent = table && table.parentElement;
    return parent && owner.contains(table) && parent.matches('.bJvOmf') && getComputedStyle(table).display === 'none' ? parent : reply;
  }

  function nativeHeaderReply(newest) {
    const body = newest.querySelector('.a3s');
    if (!body) return false;
    return nativeElements(newest, 'button, [role="button"]').some(button =>
      !button.closest('blockquote, .ip, [role="menu"], [aria-hidden="true"], [disabled], [aria-disabled="true"]') &&
      (button.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      ['aria-label', 'data-tooltip', 'title'].some(attribute =>
        /^reply(?: all)?$/i.test((button.getAttribute(attribute) || '').trim())) &&
      isRendered(button));
  }

  function captureActions(list, state, newest, anchor, candidates) {
    const actions = state.actions;
    if (hasEditor(list) || (actions && hasEditor(actions.node))) return 'editor-open';
    const scope = anchor.closest('.a98');
    const uniqueScope = scope && !Array.from(candidates.keys()).some(other => other !== list && scope.contains(other));
    const findFooters = () => nativeElements(scope, '.amr .amn')
      .filter(bar => !list.contains(bar) && nativeElements(bar, '.ams').length);
    const footers = uniqueScope ? findFooters() : [];
    if (actions && actions.owner === newest && newest.contains(actions.reply) && actions.node.isConnected &&
        actions.node.parentElement === actions.reply && actions.node.contains(actions.bar) &&
        actions.bar.matches('.amn') && nativeElements(actions.bar, '.ams').length && !footers.length) return 'footer';

    // A detached reply slot may still hold the live widget while Gmail rebuilds the message.
    const recoverDetached = actions && actions.moved && !actions.reply.isConnected &&
      actions.node.parentElement === actions.reply && uniqueScope && scope.contains(actions.marker) && !footers.length;
    if (!restoreActions(state, recoverDetached)) return 'footer-origin-lost';
    if (nativeElements(newest, '.ip .amr .amn .ams').some(isRendered)) return 'inline';

    const available = uniqueScope ? findFooters() : [];
    const bar = available.length === 1 ? available[0] : null;
    const node = bar && bar.closest('[jsaction]');
    if (node && uniqueScope && scope.contains(node) && !list.contains(node) && !node.contains(list) &&
        nativeElements(node, '.amn').length === 1 && !hasEditor(node)) {
      const replies = nativeElements(newest, '.ip .bJvOmf .amr .nr.wR');
      const hosts = replies.length ? [] : nativeElements(newest, '.ip .bJvOmf').filter(host => isRendered(host, true));
      const reply = replies.length === 1 ? actionDestination(replies[0], newest) : hosts.length === 1 ? hosts[0] : null;
      if (reply && !node.contains(reply)) {
        const origin = node.parentElement, marker = document.createComment('gcc native actions');
        node.before(marker);
        state.actions = { node, bar, origin, marker, owner: newest, reply, moved: false };
        return 'footer';
      }
    }
    if (nativeHeaderReply(newest)) return 'header';
    if (!uniqueScope) return scope ? 'multiple-conversation-lists' : 'conversation-scope-missing';
    if (available.length !== 1) return available.length ? 'multiple-conversation-footers' : 'conversation-footer-missing';
    return node && !hasEditor(node) ? 'footer-or-reply-slot-unverified' : 'footer-widget-unverified';
  }

  function restoreActions(state, recoverDetached) {
    const actions = state.actions;
    if (!actions) return true;
    if (hasEditor(actions.node)) return false;
    if (actions.moved && (actions.node.isConnected || recoverDetached)) {
      if (!actions.marker.isConnected || actions.marker.parentElement !== actions.origin) return false;
      actions.marker.replaceWith(actions.node);
    } else actions.marker.remove();
    for (const bar of actions.node.querySelectorAll('.gcc-actions')) bar.classList.remove('gcc-actions');
    actions.bar.classList.remove('gcc-actions'); actions.node.classList.remove('gcc-actions-widget'); actions.origin.classList.remove('gcc-actions-origin');
    state.actions = null;
    return true;
  }

  function applyCompactLayout(list, state, newest, apply) {
    if (hasEditor(list)) return;
    if (state.actions && (!apply || state.actions.owner !== newest || !state.actions.node.contains(state.actions.bar) || !newest.contains(state.actions.reply) ||
        !state.actions.node.isConnected || (state.actions.moved && state.actions.node.parentElement !== state.actions.reply))) restoreActions(state);
    if (!apply) return;
    list.toggleAttribute('data-gcc-hide-suggestions', hideSuggestions);
    for (const trim of list.querySelectorAll('.a3s .yj6qo > .ajR')) {
      if (trim.closest('[contenteditable]')) continue;
      const quote = trim.closest('blockquote');
      if (!quote || trim.parentElement.parentElement !== quote || !quote.closest('.a3s') || quote.closest('.adL')) continue;
      quote.classList.add('gcc-quote-intro');
      if (quote.previousElementSibling && quote.previousElementSibling.tagName === 'BR') quote.previousElementSibling.classList.add('gcc-quote-spacer');
    }
    const actions = state.actions;
    const destination = actions && actionDestination(actions.reply, newest);
    if (actions && (!actions.moved || destination !== actions.reply) && !hasEditor(list) && !hasEditor(actions.node)) {
      actions.reply = destination;
      actions.reply.append(actions.node); actions.moved = true;
    }
    if (actions && actions.node.parentElement === actions.reply) {
      actions.bar.classList.add('gcc-actions'); actions.node.classList.add('gcc-actions-widget'); actions.origin.classList.add('gcc-actions-origin');
    }
  }

  function toggleSuggestions() {
    hideSuggestions = !hideSuggestions;
    try { if (typeof GM_setValue === 'function') GM_setValue('hideSuggestions', hideSuggestions); } catch (e) { /* Keep this tab usable. */ }
    render();
  }

  function toggle() {
    enabled = !enabled;
    try { if (typeof GM_setValue === 'function') GM_setValue('enabled', enabled); } catch (e) { /* Keep this tab usable. */ }
    render();
  }

  function diagnosticReport() {
    const info = typeof GM_info === 'object' && GM_info || {};
    const manager = ['Violentmonkey', 'Tampermonkey', 'Greasemonkey'].indexOf(info.scriptHandler) !== -1 ? info.scriptHandler : 'unavailable';
    const managerVersion = typeof info.version === 'string' && /^\d+(?:\.\d+){1,3}$/.test(info.version) ? info.version : null;
    const browser = navigator.userAgent.match(/(Firefox|Edg)\/(\d+)/) || navigator.userAgent.match(/(Chrome)\/(\d+)/);
    let healthCode = null;
    try {
      const issue = enabled && healthIssue();
      healthCode = issue ? issue.code : null;
    } catch (e) { healthCode = 'script-error'; }
    // Export a fixed schema only: never serialize DOM, message metadata, or error text.
    return {
      schemaVersion: 1, scriptVersion: VERSION, build: BUILD, generatedAt: new Date().toISOString(),
      environment: {
        browser: browser ? { name: browser[1], majorVersion: Number(browser[2]) } : { name: 'unavailable', majorVersion: null },
        manager: { name: manager, version: managerVersion },
        viewport: { width: innerWidth, height: innerHeight }, documentVisible: !document.hidden
      },
      layout: { enabled, hideSuggestions, renderFailed, healthCode, warningCode: warningReason },
      conversations: Array.from(lists, ([list, state]) => {
        const actual = unitsOf(list), native = state.native.filter(record => record.node.parentElement === list);
        const latest = native[native.length - 1], actions = state.actions;
        const newest = latest && !latest.placeholder && latest.node;
        const expected = state.reversed ? native.map(record => record.node).reverse() : native.map(record => record.node);
        return {
          connected: list.isConnected, visible: isRendered(list), units: actual ? actual.length : null,
          activeEditor: hasEditor(list), unknownOrder: state.unknown, reversed: state.reversed,
          waitingForActions: !!state.waitingForActions, replyCheck: state.replyCheck, compact: list.hasAttribute('data-gcc-list'),
          orderMatchesRecorded: actual ? actual.length === expected.length && actual.every((node, index) => node === expected[index]) : null,
          footer: { captured: !!actions, connected: !!actions && actions.node.isConnected, barConnected: !!actions && actions.bar.isConnected,
            barVisible: !!actions && isRendered(actions.bar), ownerIsLatest: !!actions && actions.owner === newest,
            insideOwner: !!actions && actions.owner.contains(actions.node), sourceConnected: !!actions && actions.marker.isConnected }
        };
      })
    };
  }

  function showDiagnostics() {
    const report = JSON.stringify(diagnosticReport(), null, 2);
    if (diagnosticDialog && diagnosticDialog.open) { diagnosticDialog.querySelector('textarea').value = report; return; }
    const selection = getSelection(), range = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const anchorNode = selection.anchorNode;
    const anchor = anchorNode && (anchorNode.nodeType === 1 ? anchorNode : anchorNode.parentElement);
    const editor = anchor && anchor.closest('[contenteditable]');
    const backward = range && !range.collapsed && selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset;
    const dialog = document.createElement('dialog'); dialog.className = 'gcc-diagnostics'; dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Gmail layout diagnostic report');
    const title = document.createElement('h2'); title.textContent = 'Diagnostic report';
    const explanation = document.createElement('p'); explanation.textContent = 'Layout status and structural counts only. No mail text or addresses. Nothing is sent. Select the report to copy it.';
    const box = document.createElement('textarea'); box.readOnly = true; box.value = report; box.setAttribute('aria-label', 'Diagnostic JSON report'); box.wrap = 'off';
    const refresh = document.createElement('button'); refresh.type = 'button'; refresh.textContent = 'Refresh report';
    refresh.addEventListener('click', () => { box.value = JSON.stringify(diagnosticReport(), null, 2); });
    const select = document.createElement('button'); select.type = 'button'; select.textContent = 'Select report';
    select.addEventListener('click', () => { box.focus(); box.select(); });
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close'; close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dialog.close(); }
    });
    dialog.addEventListener('close', () => {
      dialog.remove(); if (diagnosticDialog === dialog) diagnosticDialog = null;
      if (editor && editor.isContentEditable && isRendered(editor) && range && editor.contains(range.startContainer) && editor.contains(range.endContainer)) {
        editor.focus(); selection.removeAllRanges(); selection.addRange(range);
        if (backward) selection.setBaseAndExtent(range.endContainer, range.endOffset, range.startContainer, range.startOffset);
      }
    });
    dialog.append(title, explanation, box, refresh, select, close); document.body.append(dialog); diagnosticDialog = dialog;
    dialog.showModal(); box.setSelectionRange(0, 0); box.scrollTop = 0;
  }

  function diagnosticButton() {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Diagnostics';
    button.addEventListener('click', showDiagnostics); return button;
  }

  function makeControls(list) {
    const controls = document.createElement('div'); controls.className = 'gcc-controls';
    const label = document.createElement('span'); label.setAttribute('role', 'status');
    const button = document.createElement('button'); button.type = 'button'; button.addEventListener('click', toggle);
    const suggestionsButton = document.createElement('button'); suggestionsButton.type = 'button'; suggestionsButton.addEventListener('click', toggleSuggestions);
    controls.append(label, button, suggestionsButton, diagnosticButton()); list.before(controls);
    return { controls, label, button, suggestionsButton };
  }

  function isRendered(node, allowEmpty) {
    if (!node || !node.isConnected || !node.getClientRects().length) return false;
    const rect = node.getBoundingClientRect();
    if (allowEmpty !== true && (!rect.width || !rect.height)) return false;
    for (let parent = node; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent);
      if (css.display === 'none' || css.visibility === 'hidden' || css.visibility === 'collapse' || css.opacity === '0') return false;
    }
    return true;
  }

  function healthIssue() {
    if (renderFailed) return { code: 'script-error', owner: document.body };
    for (const [list, state] of lists) {
      if (!isRendered(list) || hasEditor(list)) continue;
      if (state.unknown) return { code: 'order', owner: list };
      const actual = unitsOf(list);
      if (!actual) return { code: 'structure', owner: list };
      const native = state.native.filter(record => record.node.parentElement === list);
      if (state.reversed && native.map(record => record.node).reverse().some((node, index) => actual[index] !== node)) return { code: 'order', owner: list };
      const latest = native[native.length - 1];
      const newest = latest && !latest.placeholder && latest.node;
      if (!newest || !Array.from(newest.querySelectorAll('.a3s')).some(body => !body.parentElement.closest(EXCLUDED) && isRendered(body))) continue;
      if (state.waitingForActions) return { code: 'reply-missing', owner: list };
      if (state.actions && (!isRendered(state.actions.bar) || !nativeElements(state.actions.bar, '.ams').some(isRendered))) return { code: 'reply-hidden', owner: list };
    }
    for (const scope of document.querySelectorAll('.a98, [role="main"]')) {
      if (!isRendered(scope) || hasEditor(scope)) continue;
      // Inbox tab headings also use h3; require message evidence outside a known conversation.
      const messages = nativeElements(scope, scope.matches('.a98') ? 'h3, [data-message-id]' : '[data-message-id]');
      if (nativeElements(scope, 'h2').some(isRendered) && messages.some(isRendered) &&
          !Array.from(lists.keys()).some(list => scope.contains(list) && isRendered(list))) return { code: 'structure', owner: scope };
    }
    return null;
  }

  function hideWarning() {
    if (warning) warning.remove(); warning = null; warningReason = null;
  }

  function checkHealth() {
    if (document.hidden) { healthFailure = null; return; }
    let issue = null;
    if (enabled) {
      try { issue = healthIssue(); } catch (e) { issue = { code: 'script-error', owner: document.body }; }
    }
    if (!issue) { healthFailure = null; hideWarning(); return; }
    if (!healthFailure || healthFailure.code !== issue.code || healthFailure.owner !== issue.owner) {
      healthFailure = Object.assign({ since: Date.now() }, issue); hideWarning(); return;
    }
    if (Date.now() - healthFailure.since < 12000 || (warning && warning.isConnected && warningReason === issue.code)) return;
    const reasons = {
      'reply-hidden': 'The reply controls are hidden.',
      'reply-missing': 'Gmail reply controls could not be placed below the newest message.',
      order: 'Message order could not be verified.',
      structure: 'Gmail\'s message layout is no longer recognized.',
      'script-error': 'A script error is preventing the layout from updating.'
    };
    hideWarning();
    warning = document.createElement('div'); warning.className = 'gcc-warning'; warning.setAttribute('role', 'alert');
    const title = document.createElement('strong'); title.textContent = 'Gmail Clear Conversations needs attention';
    const message = document.createElement('p'); message.textContent = reasons[issue.code] + ' Some layout features may not work. Save any draft before reloading Gmail.';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Use Gmail layout';
    button.addEventListener('click', () => { if (enabled) toggle(); checkHealth(); });
    warning.append(title, message, button, diagnosticButton()); document.body.append(warning); warningReason = issue.code;
  }

  function render() {
    clearTimeout(timer); timer = null;
    try {
      renderFailed = false;
      const mutations = [...pending, ...observer.takeRecords()]; pending = [];
      observer.disconnect();
      const candidates = discover();
      for (const [list, state] of lists) {
        if (candidates.has(list)) continue;
        clearLayout(list, state); restoreActions(state); state.controls.remove();
        if (list.isConnected && hasEditor(list)) continue;
        const actual = unitsOf(list), desired = state.native.map(record => record.node).filter(node => node.parentElement === list);
        if (list.isConnected && !state.unknown && actual && actual.length === desired.length && actual.every(node => desired.indexOf(node) !== -1)) reorder(list, desired);
        lists.delete(list);
      }
      for (const [list, anchor] of candidates) {
        if (!lists.has(list)) lists.set(list, Object.assign({ native: [], reversed: false, unknown: false }, makeControls(list)));
        const state = lists.get(list), actual = unitsOf(list);
        if (actual) syncOrder(list, state, actual, mutations);
        clearLayout(list, state);
        const native = state.native.filter(record => record.node.parentElement === list);
        const latest = native[native.length - 1];
        const newest = latest && !latest.placeholder && latest.node;
        const supported = actual && !state.unknown && newest;
        const replyCheck = enabled && supported ? captureActions(list, state, newest, anchor, candidates) : null;
        state.replyCheck = replyCheck;
        state.anchor = anchor;
        const useClearLayout = replyCheck === 'footer' || replyCheck === 'inline' || replyCheck === 'header';
        const waitingForActions = Boolean(replyCheck && !useClearLayout && replyCheck !== 'editor-open');
        state.waitingForActions = waitingForActions;
        const desired = native.map(record => record.node);
        if (useClearLayout) desired.reverse();
        const needsMove = supported && desired.some((node, index) => actual[index] !== node);
        // Never detach any editor ancestor: focus, selection and Gmail undo belong to Gmail.
        const editorOpen = hasEditor(list) || (state.actions && hasEditor(state.actions.node));
        const deferred = replyCheck === 'editor-open' || (needsMove && editorOpen);
        if (supported && !deferred) {
          reorder(list, desired); state.reversed = useClearLayout;
          if (useClearLayout) {
            anchor.setAttribute('data-gcc-pane', '');
            list.setAttribute('data-gcc-list', '');
            for (const record of native) if (!record.placeholder) record.node.classList.add('gcc-message');
            newest.classList.add('gcc-latest');
          }
        }
        if (!editorOpen && replyCheck !== 'footer-origin-lost') applyCompactLayout(list, state, newest, useClearLayout && !deferred);
        state.label.textContent = state.unknown ? 'Order changed · Let Gmail save your draft, then reload to resume' :
          !supported ? 'Layout paused · Message boundaries or reply source could not be verified' :
          waitingForActions ? 'Waiting for Gmail reply controls · Gmail layout' :
          deferred ? (enabled ? 'Close the reply to apply newest-first order' : 'Layout off · Original order returns after the reply closes') :
          enabled ? 'Newest first' : 'Gmail layout';
        state.button.textContent = enabled ? 'Use Gmail layout' : 'Use clear layout';
        state.button.setAttribute('aria-pressed', String(enabled));
        state.suggestionsButton.textContent = hideSuggestions ? 'Show suggested replies' : 'Hide suggested replies';
        state.suggestionsButton.setAttribute('aria-pressed', String(!hideSuggestions));
      }
    } catch (error) {
      renderFailed = true;
      console.warn('[Gmail Clear Conversations] Layout paused during render:', error && error.name || 'Error');
    } finally {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'role', 'contenteditable', 'data-message-id', 'title', 'style', 'hidden', 'jsaction', 'aria-label', 'data-tooltip', 'aria-hidden'] });
    }
  }

  const observer = new MutationObserver(mutations => {
    pending.push(...mutations);
    if (!timer) timer = setTimeout(render, 80);
  });
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Toggle Clear Conversations layout', toggle);
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Show Clear Conversations diagnostics', showDiagnostics);
  const watchdogTimer = setInterval(checkHealth, 2000);
  render();
})();
