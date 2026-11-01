// ==UserScript==
// @name         Reddit Floating Back Button
// @namespace    https://reddit.com/
// @version      1.0
// @description  Keep Reddit's post back button visible while scrolling
// @match        https://www.reddit.com/*
// @match        https://reddit.com/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/574640/Reddit%20Floating%20Back%20Button.user.js
// @updateURL https://update.greasyfork.org/scripts/574640/Reddit%20Floating%20Back%20Button.meta.js
// ==/UserScript==
// Source: https://github.com/thepick/userscripts

(function () {
    'use strict';

    var BUTTON_SELECTOR = 'pdp-back-button[post-id]';
    var HEADER_SELECTOR = '#pdp-credit-bar';
    var TITLE_SELECTOR = 'h1[slot="title"]';

    var currentButton = null;
    var rafId = null;
    var observer = null;

    function isPostPage() {
        return /\/comments\//i.test(location.pathname);
    }

    function getBackButton() {
        return document.querySelector(BUTTON_SELECTOR);
    }

    function getAnchorElement(button) {
        if (!button) {
            return null;
        }

        var header = document.querySelector(HEADER_SELECTOR);
        if (header) {
            return header;
        }

        var title = document.querySelector(TITLE_SELECTOR);
        if (title) {
            return title;
        }

        return button.parentElement || button;
    }

    function applyFloatingStyle(button) {
        if (!button) {
            return;
        }

        var anchor = getAnchorElement(button);
        var left = 16;
        var top = 76;

        if (anchor) {
            var rect = anchor.getBoundingClientRect();
            left = Math.max(12, Math.round(rect.left - 52));
        }

        button.style.setProperty('position', 'fixed', 'important');
        button.style.setProperty('top', top + 'px', 'important');
        button.style.setProperty('left', left + 'px', 'important');
        button.style.setProperty('right', 'auto', 'important');
        button.style.setProperty('bottom', 'auto', 'important');
        button.style.setProperty('z-index', '9999', 'important');
        button.style.setProperty('display', 'block', 'important');
        button.style.setProperty('visibility', 'visible', 'important');
        button.style.setProperty('opacity', '1', 'important');
        button.style.setProperty('transform', 'none', 'important');
        button.style.setProperty('margin', '0', 'important');
        button.style.setProperty('pointer-events', 'auto', 'important');
    }

    function clearFloatingStyle(button) {
        if (!button) {
            return;
        }

        button.style.removeProperty('position');
        button.style.removeProperty('top');
        button.style.removeProperty('left');
        button.style.removeProperty('right');
        button.style.removeProperty('bottom');
        button.style.removeProperty('z-index');
        button.style.removeProperty('display');
        button.style.removeProperty('visibility');
        button.style.removeProperty('opacity');
        button.style.removeProperty('transform');
        button.style.removeProperty('margin');
        button.style.removeProperty('pointer-events');
    }

    function updateButton() {
        var button = getBackButton();

        if (!isPostPage()) {
            if (currentButton) {
                clearFloatingStyle(currentButton);
            }
            currentButton = null;
            return;
        }

        if (!button) {
            currentButton = null;
            return;
        }

        currentButton = button;
        applyFloatingStyle(button);
    }

    function requestUpdate() {
        if (rafId !== null) {
            return;
        }

        rafId = window.requestAnimationFrame(function () {
            rafId = null;
            updateButton();
        });
    }

    function installObserver() {
        if (observer) {
            observer.disconnect();
        }

        observer = new MutationObserver(function () {
            requestUpdate();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function installHistoryHooks() {
        var originalPushState = history.pushState;
        var originalReplaceState = history.replaceState;

        history.pushState = function () {
            var result = originalPushState.apply(this, arguments);
            setTimeout(requestUpdate, 0);
            setTimeout(requestUpdate, 300);
            setTimeout(requestUpdate, 1000);
            return result;
        };

        history.replaceState = function () {
            var result = originalReplaceState.apply(this, arguments);
            setTimeout(requestUpdate, 0);
            setTimeout(requestUpdate, 300);
            setTimeout(requestUpdate, 1000);
            return result;
        };

        window.addEventListener('popstate', requestUpdate, true);
    }

    function installListeners() {
        window.addEventListener('scroll', requestUpdate, { passive: true });
        window.addEventListener('resize', requestUpdate, true);
    }

    function init() {
        installObserver();
        installHistoryHooks();
        installListeners();

        requestUpdate();
        setTimeout(requestUpdate, 500);
        setTimeout(requestUpdate, 1500);
    }

    init();
})();