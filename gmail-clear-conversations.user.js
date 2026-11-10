// ==UserScript==
// @name         Gmail Clear Conversations
// @namespace    https://greasyfork.org/en/users/567951-stuart-saddler
// @version      0.4.2
// @description  Newest email first with Gmail's native reply editor and controls preserved.
// @match        https://mail.google.com/mail/*
// @run-at       document-idle
// @noframes
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

  const VERSION = '0.4.2';
  const EXCLUDED = '.a3s, .gmail_quote, [contenteditable], [role="dialog"]';
  const MESSAGE = '.h7, .kv, .adn, [data-message-id]';
  const CLASSES = ['gcc-message', 'gcc-latest', 'gcc-footer', 'gcc-joined'];
  const lists = new Map();
  let enabled = true, hideSuggestions = true, timer;
  let pending = [];
  const diagnostics = [];
  let renderFailure = null, healthFailure = null, warning = null;
  try {
    if (typeof GM_getValue === 'function') enabled = GM_getValue('enabled', true) !== false;
    if (typeof GM_getValue === 'function') hideSuggestions = GM_getValue('hideSuggestions', true) !== false;
  } catch (error) { recordDiagnostic('preference-error', 'read'); }

  const style = document.createElement('style');
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
    .gcc-warning-actions { display:flex; flex-wrap:wrap; gap:8px; }
    .gcc-warning button { min-height:32px; padding:6px 12px; border:1px solid #806000; border-radius:6px; background:#fff; color:#3b2f10; font:inherit; cursor:pointer; }
    .gcc-warning button:focus-visible { outline:2px solid #3b2f10; outline-offset:3px; }
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
    const title = header ? header.getAttribute('title').replace(/[\u202f\u00a0]/g, ' ') : '';
    // shortcut: trust only unambiguous English full-date headers; other locales pause on updates.
    const supportedDate = /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), )?(?:[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}(?::\d{2})? [AP]M|\d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT)$/;
    const date = supportedDate.test(title) ? Date.parse(title) : NaN;
    return { node, id: message && message.getAttribute('data-message-id'), date, placeholder: !messageRoots(node).length };
  }

  function syncOrder(list, state, actual, mutations) {
    if (state.unknown) return;
    const identities = actual.map(node => details(node).id).filter(Boolean);
    if (new Set(identities).size !== identities.length) { state.unknown = 'duplicate-message-identity'; return; }
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
        if (known.id && info.id && known.id !== info.id) { state.unknown = 'message-identity-changed'; return; }
        if (Number.isFinite(known.date) && Number.isFinite(info.date) && known.date !== info.date) { state.unknown = 'message-date-changed'; return; }
        Object.assign(known, info);
        continue;
      }
      const dated = state.native.filter(record => !record.placeholder);
      if (info.placeholder || !Number.isFinite(info.date) || dated.some(record => !Number.isFinite(record.date)) ||
          dated.some((record, index) => index && record.date < dated[index - 1].date) || dated.some(record => record.date === info.date)) {
        state.unknown = 'new-message-position-unverifiable'; return;
      }
      const before = state.native.findIndex(record => !record.placeholder && record.date > info.date);
      if (state.native.some(record => record.placeholder) && before !== -1 && info.date > dated[0].date) {
        state.unknown = 'new-message-overlaps-collapsed-group'; return;
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
    return table && owner.contains(table) && table.parentElement.matches('.bJvOmf') && getComputedStyle(table).display === 'none' ? table.parentElement : reply;
  }

  function captureActions(list, state, newest, anchor, candidates) {
    const actions = state.actions;
    if (actions && actions.owner === newest && newest.contains(actions.reply) && actions.node.isConnected &&
        actions.node.contains(actions.bar) && (!actions.moved || actions.node.parentElement === actions.reply)) return null;
    const scope = anchor.closest('.a98');
    if (hasEditor(list) || (actions && hasEditor(actions.node))) return 'reply-editor-open';
    const findFooters = () => nativeElements(scope, '.amr .amn').filter(node => !list.contains(node) && node.querySelector('.ams'));
    // Gmail may replace the slot around the widget without removing the widget itself.
    const recoverDetached = actions && actions.moved && !actions.reply.isConnected && actions.node.parentElement === actions.reply &&
      scope && scope.contains(actions.marker) && !findFooters().length;
    if (!restoreActions(state, recoverDetached)) return 'original-footer-location-lost';
    const inline = nativeElements(newest, '.ip .amr .amn .ams');
    if (inline.some(isRendered) || !scope) return null;
    if (Array.from(candidates.keys()).some(other => other !== list && scope.contains(other))) return 'multiple-conversation-lists';

    const footers = findFooters();
    if (!footers.length) return 'conversation-footer-missing';
    if (footers.length !== 1) return 'multiple-conversation-footers';
    const replies = nativeElements(newest, '.ip .bJvOmf .amr .nr.wR');
    if (replies.length > 1) return 'multiple-reply-slots';
    const hosts = replies.length ? [] : nativeElements(newest, '.ip .bJvOmf');
    if (!replies.length && hosts.length !== 1) return hosts.length ? 'multiple-reply-containers' : 'reply-container-missing';
    const reply = replies.length ? actionDestination(replies[0], newest) : hosts[0];
    const bar = footers[0], node = bar.closest('[jsaction]');
    if (!node || !scope.contains(node) || node.contains(list) || nativeElements(node, '.amn').length !== 1) return 'footer-widget-unverifiable';
    if (hasEditor(node)) return 'reply-editor-open';
    const origin = node.parentElement, marker = document.createComment('gcc native actions');
    node.before(marker);
    state.actions = { node, bar, origin, marker, owner: newest, reply, moved: false };
    return null;
  }

  function restoreActions(state, recoverDetached) {
    const actions = state.actions;
    if (!actions) return true;
    if (hasEditor(actions.node)) return false;
    if (actions.moved && (actions.node.isConnected || recoverDetached)) {
      if (!actions.marker.isConnected) {
        recordDiagnostic('reply-restore', 'original-footer-location-lost');
        return false;
      }
      actions.marker.replaceWith(actions.node);
    }
    else actions.marker.remove();
    actions.bar.classList.remove('gcc-actions'); actions.node.classList.remove('gcc-actions-widget'); actions.origin.classList.remove('gcc-actions-origin');
    state.actions = null;
    return true;
  }

  function applyCompactLayout(list, state, newest, apply) {
    if (!apply) return;
    list.toggleAttribute('data-gcc-hide-suggestions', hideSuggestions);
    for (const trim of list.querySelectorAll('.a3s .yj6qo > .ajR')) {
      if (trim.closest('[contenteditable]')) continue;
      const quote = trim.closest('blockquote');
      if (!quote || trim.parentElement.parentElement !== quote || !quote.closest('.a3s') || quote.closest('.adL')) continue;
      quote.classList.add('gcc-quote-intro');
      const previous = quote.previousElementSibling;
      if (previous && previous.tagName === 'BR') previous.classList.add('gcc-quote-spacer');
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
    try { if (typeof GM_setValue === 'function') GM_setValue('hideSuggestions', hideSuggestions); }
    catch (error) { recordDiagnostic('preference-error', 'write-hide-suggestions'); }
    render();
  }

  function toggle() {
    enabled = !enabled;
    try { if (typeof GM_setValue === 'function') GM_setValue('enabled', enabled); }
    catch (error) { recordDiagnostic('preference-error', 'write-layout-enabled'); }
    render();
  }

  function makeControls(list) {
    const controls = document.createElement('div'); controls.className = 'gcc-controls';
    const label = document.createElement('span'); label.setAttribute('role', 'status');
    const button = document.createElement('button'); button.type = 'button'; button.addEventListener('click', toggle);
    const suggestionsButton = document.createElement('button'); suggestionsButton.type = 'button'; suggestionsButton.addEventListener('click', toggleSuggestions);
    controls.append(label, button, suggestionsButton); list.before(controls);
    return { controls, label, button, suggestionsButton };
  }

  function isRendered(node) {
    if (!node || !node.isConnected || !node.getClientRects().length) return false;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    for (let parent = node; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent);
      if (css.display === 'none' || css.visibility === 'hidden' || css.visibility === 'collapse' || css.opacity === '0') return false;
    }
    return true;
  }

  function healthIssue() {
    if (renderFailure) return Object.assign({ code: 'script-error', owner: document.body }, renderFailure);
    for (const [list, state] of lists) {
      if (!isRendered(list) || hasEditor(list)) continue;
      if (state.unknown) return { code: 'order', detail: state.unknown, owner: list };
      const actual = unitsOf(list);
      if (!actual) return { code: 'structure', detail: 'message-boundaries-unverifiable', owner: list };
      const native = state.native.filter(record => record.node.parentElement === list);
      if (state.reversed && (native.length !== actual.length || native.some((record, index) => actual[actual.length - index - 1] !== record.node))) {
        return { code: 'order', detail: 'displayed-order-differs-from-tracked-order', owner: list };
      }
      const last = native[native.length - 1];
      if (last && last.placeholder) return { code: 'structure', detail: 'newest-message-is-collapsed-group', owner: list };
      const newest = last && last.node;
      if (!newest || !Array.from(newest.querySelectorAll('.a3s')).some(body => !body.parentElement.closest(EXCLUDED) && isRendered(body))) continue;
      if (state.replyIssue && state.replyIssue !== 'reply-editor-open') {
        const code = state.replyIssue === 'original-footer-location-lost' ? 'reply-restore' : 'reply-missing';
        return { code, detail: state.replyIssue, owner: list };
      }
      const actions = state.actions;
      if (!actions || !actions.moved) continue;
      if (!actions.marker.isConnected) return { code: 'reply-restore', detail: 'original-footer-location-lost', owner: list };
      if (!isRendered(actions.bar)) return { code: 'reply-hidden', detail: 'reply-bar-hidden', owner: list };
      if (!nativeElements(actions.bar, '.ams').some(isRendered)) return { code: 'reply-hidden', detail: 'reply-buttons-hidden-or-missing', owner: list };
    }
    for (const scope of document.querySelectorAll('.a98, [role="main"]')) {
      if (!isRendered(scope) || hasEditor(scope)) continue;
      // Inbox tab headings also use h3; require message evidence outside a known conversation.
      const messages = nativeElements(scope, scope.matches('.a98') ? 'h3, [data-message-id]' : '[data-message-id]');
      if (nativeElements(scope, 'h2').some(isRendered) && messages.some(isRendered) &&
          !Array.from(lists.keys()).some(list => scope.contains(list) && isRendered(list))) {
        return { code: 'structure', detail: 'conversation-list-not-discovered', owner: scope };
      }
    }
    return null;
  }

  function hideWarning() {
    if (warning) warning.remove();
    warning = null;
  }

  function errorDetail(stage, error) {
    const name = error && error.name;
    const errorType = /^(Error|TypeError|ReferenceError|RangeError|SyntaxError|HierarchyRequestError|NotFoundError)$/.test(name) ? name : 'Error';
    return { detail: stage, errorType };
  }

  function readHealth() {
    if (!enabled) return null;
    try { return healthIssue(); } catch (error) {
      return Object.assign({ code: 'script-error', owner: document.body }, errorDetail('check-layout-health', error));
    }
  }

  // Store only script-defined codes and types. Never serialize Gmail nodes, URLs or exception text.
  function recordDiagnostic(code, detail, errorType) {
    const last = diagnostics[diagnostics.length - 1];
    if (last && last.code === code && last.detail === detail && last.errorType === errorType) return;
    diagnostics.push({ time: new Date().toISOString(), code, detail, errorType });
    if (diagnostics.length > 40) diagnostics.shift();
  }

  function downloadDiagnostics() {
    const issue = readHealth();
    const exportedAt = new Date().toISOString();
    const report = {
      script: 'Gmail Clear Conversations',
      version: VERSION,
      exportedAt,
      enabled,
      hideSuggestions,
      currentIssue: issue ? { code: issue.code, detail: issue.detail, errorType: issue.errorType } : null,
      events: diagnostics
    };
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' }));
    try {
      link.href = url;
      link.download = 'gmail-clear-conversations-' + exportedAt.replace(/[:.]/g, '-') + '.json';
      document.body.append(link);
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function checkHealth() {
    if (document.hidden) { healthFailure = null; return; }
    const issue = readHealth();
    if (!issue) {
      if (healthFailure) recordDiagnostic('issue-cleared', enabled ? 'layout-check-passed' : 'layout-disabled');
      healthFailure = null; hideWarning(); return;
    }
    if (!healthFailure || healthFailure.code !== issue.code || healthFailure.detail !== issue.detail ||
        healthFailure.errorType !== issue.errorType || healthFailure.owner !== issue.owner) {
      recordDiagnostic(issue.code, issue.detail, issue.errorType);
      healthFailure = Object.assign({ since: Date.now() }, issue);
      hideWarning(); return;
    }
    if (Date.now() - healthFailure.since < 12000 || (warning && warning.isConnected)) return;
    const reasons = {
      'reply-hidden': 'The reply controls are hidden.',
      'reply-missing': 'Gmail reply controls could not be placed below the newest message.',
      'reply-restore': 'Gmail changed where the reply controls originally appeared.',
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
    const download = document.createElement('button'); download.type = 'button'; download.textContent = 'Download diagnostic log';
    download.addEventListener('click', downloadDiagnostics);
    const actions = document.createElement('div'); actions.className = 'gcc-warning-actions'; actions.append(button, download);
    warning.append(title, message, actions); document.body.append(warning);
  }

  function render() {
    clearTimeout(timer);
    const mutations = [...pending, ...observer.takeRecords()]; pending = [];
    observer.disconnect();
    let stage = 'discover-conversations';
    try {
      renderFailure = null;
      const candidates = discover();
      stage = 'restore-closed-conversation';
      for (const [list, state] of lists) {
        if (candidates.has(list)) continue;
        clearLayout(list, state); restoreActions(state); state.controls.remove();
        if (list.isConnected && hasEditor(list)) continue;
        const actual = unitsOf(list), desired = state.native.map(record => record.node).filter(node => node.parentElement === list);
        if (list.isConnected && !state.unknown && actual && actual.length === desired.length && actual.every(node => desired.indexOf(node) !== -1)) reorder(list, desired);
        lists.delete(list);
      }
      for (const [list, anchor] of candidates) {
        stage = 'track-message-order';
        if (!lists.has(list)) lists.set(list, Object.assign({ native: [], reversed: false, unknown: false }, makeControls(list)));
        const state = lists.get(list), actual = unitsOf(list);
        clearLayout(list, state);
        if (actual) syncOrder(list, state, actual, mutations);
        const native = state.native.filter(record => record.node.parentElement === list);
        const last = native[native.length - 1];
        const newest = last && !last.placeholder && last.node;
        const supported = actual && !state.unknown && newest;
        stage = 'find-reply-controls';
        state.replyIssue = enabled && supported ? captureActions(list, state, newest, anchor, candidates) : null;
        state.anchor = anchor;
        const useClearLayout = enabled && supported && !state.replyIssue;
        const desired = native.map(record => record.node);
        if (useClearLayout) desired.reverse();
        const needsMove = supported && desired.some((node, index) => actual[index] !== node);
        // Never detach any editor ancestor: focus, selection and Gmail undo belong to Gmail.
        const editorOpen = hasEditor(list);
        const deferred = state.replyIssue === 'reply-editor-open' || (needsMove && editorOpen);
        stage = 'apply-conversation-layout';
        if ((!enabled || !supported) && !editorOpen) restoreActions(state);
        if (supported && !deferred) {
          reorder(list, desired); state.reversed = Boolean(useClearLayout);
          if (useClearLayout) {
            anchor.setAttribute('data-gcc-pane', '');
            list.setAttribute('data-gcc-list', '');
            for (const record of native) if (!record.placeholder) record.node.classList.add('gcc-message');
            newest.classList.add('gcc-latest');
          }
        }
        applyCompactLayout(list, state, newest, useClearLayout && !deferred);
        state.label.textContent = state.unknown ? 'Order changed · Let Gmail save your draft, then reload to resume' :
          !supported ? 'Layout paused · Message boundaries or reply source could not be verified' :
          deferred ? (enabled ? 'Close the reply to apply newest-first order' : 'Layout off · Original order returns after the reply closes') :
          state.replyIssue ? 'Waiting for Gmail reply controls · Gmail layout' :
          enabled ? 'Newest first' : 'Gmail layout';
        state.button.textContent = enabled ? 'Use Gmail layout' : 'Use clear layout';
        state.button.setAttribute('aria-pressed', String(enabled));
        state.suggestionsButton.textContent = hideSuggestions ? 'Show suggested replies' : 'Hide suggested replies';
        state.suggestionsButton.setAttribute('aria-pressed', String(!hideSuggestions));
      }
    } catch (error) {
      renderFailure = errorDetail(stage, error);
      recordDiagnostic('script-error', renderFailure.detail, renderFailure.errorType);
    } finally {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'role', 'contenteditable', 'data-message-id', 'title', 'style', 'hidden', 'jsaction'] });
    }
  }

  const observer = new MutationObserver(mutations => {
    const relevant = mutations.filter(change => change.attributeName !== 'style' || change.target.matches('table.wS'));
    if (!relevant.length) return;
    pending.push(...relevant); clearTimeout(timer); timer = setTimeout(render, 80);
  });
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Toggle Clear Conversations layout', toggle);
    GM_registerMenuCommand('Download diagnostic log', downloadDiagnostics);
  }
  const watchdogTimer = setInterval(checkHealth, 2000);
  render();
})();
