// ==UserScript==
// @name         Knowt Flashcards - Printable Double-Sided
// @namespace    https://github.com/nousresearch
// @version      1.2.0
// @description  Extract flashcards from Knowt and generate a printable double-sided layout with terms on front and definitions/images on back.
// @author       Hermes Agent
// @match        https://knowt.com/flashcards/*
// @icon         https://knowt.com/favicon.ico
// @grant        GM_addStyle
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/584409/Knowt%20Flashcards%20-%20Printable%20Double-Sided.user.js
// @updateURL https://update.greasyfork.org/scripts/584409/Knowt%20Flashcards%20-%20Printable%20Double-Sided.meta.js
// ==/UserScript==
// Source: https://github.com/thepick/userscripts

(function () {
  "use strict";

  var DEBUG = true;

  function log() {
    if (!DEBUG) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[Knowt Print]");
    console.log.apply(console, args);
  }

  // ------------------------------------------------------------
  // Floating button styles
  // ------------------------------------------------------------

  GM_addStyle(`
    #kt-print-btn {
      position: fixed !important;
      bottom: 24px !important;
      right: 24px !important;
      z-index: 2147483647 !important;
      padding: 12px 20px !important;
      background: #4F46E5 !important;
      color: #fff !important;
      border: none !important;
      border-radius: 8px !important;
      font-size: 15px !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      box-shadow: 0 4px 14px rgba(79,70,229,0.4) !important;
      transition: transform 0.15s, box-shadow 0.15s !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }

    #kt-print-btn:hover {
      transform: translateY(-2px) !important;
      box-shadow: 0 6px 20px rgba(79,70,229,0.5) !important;
    }

    #kt-print-btn:active {
      transform: translateY(0) !important;
    }

    #kt-print-btn:disabled {
      opacity: 0.6 !important;
      cursor: not-allowed !important;
      transform: none !important;
    }
  `);

  // ------------------------------------------------------------
  // Text helpers
  // ------------------------------------------------------------

  function getCleanText(el) {
    if (!el) return "";
    return String(el.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHTML(str) {
    var div = document.createElement("div");
    div.textContent = String(str || "");
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ------------------------------------------------------------
  // DOM scraping
  // ------------------------------------------------------------

  // Knowt virtualizes its editor: scrolling replaces the mounted cards.
  // Use row identity and explicit sides, never visibility or text deduplication.
  function findAllCardContainers() {
    return Array.from(document.querySelectorAll('[id^="flashcardCard-"][data-card-index]'));
  }

  function extractCardData(container) {
    function side(name) {
      var editor = container.querySelector('[data-testid="flashcard-' + name + '-editor"]');
      if (!editor) throw new Error("A card editor has not rendered yet. Please try again.");
      var area = editor;
      // The image is a sibling of the text column within this side's row.
      while (area.parentElement && area.parentElement !== container &&
             area.parentElement.querySelectorAll('[data-testid$="-editor"]').length === 1) {
        area = area.parentElement;
      }
      var img = area.querySelector('img');
      return {text: getCleanText(editor), image: img ? img.currentSrc || img.src || "" : ""};
    }
    var term = side("term");
    var definition = side("definition");
    return {
      id: container.id,
      index: Number(container.dataset.cardIndex),
      term: term.text,
      definition: definition.text,
      termImageUrl: term.image,
      imageUrl: definition.image
    };
  }

  async function collectAllCards(btn) {
    var list = document.querySelector('[data-testid="virtuoso-item-list"]');
    if (!list) throw new Error("Open the flashcard set's Edit page, then try Print Flashcards again.");
    var viewport = list.closest('[data-viewport-type]');
    var scroller = viewport && viewport.dataset.viewportType === "window"
      ? document.scrollingElement : list.closest('[data-virtuoso-scroller]');
    if (!scroller) throw new Error("Could not find the flashcard scroll area.");
    var originalTop = scroller.scrollTop;
    var originalBehavior = scroller.style.scrollBehavior;
    var route = location.href;
    var cards = new Map();
    var pause = function () { return new Promise(function (resolve) { setTimeout(resolve, 300); }); };
    var observer = new MutationObserver(capture);
    function capture() {
      findAllCardContainers().forEach(function (row) {
        if (!row.querySelector('[data-testid="flashcard-term-editor"]') ||
            !row.querySelector('[data-testid="flashcard-definition-editor"]')) return;
        var card = extractCardData(row);
        if (Number.isInteger(card.index) && card.index >= 0) cards.set(card.index, card);
      });
    }
    scroller.style.scrollBehavior = "auto";
    observer.observe(list, {childList: true, subtree: true, attributes: true, characterData: true});
    try {
      scroller.scrollTop = 0;
      var stableBottom = 0;
      var previousSize = 0;
      var previousHeight = 0;
      var deadline = Date.now() + 180000;
      while (stableBottom < 5) {
        if (Date.now() > deadline) throw new Error("Collection timed out. Try again after the page finishes loading.");
        if (location.href !== route || !list.isConnected) throw new Error("The set changed during collection. Please try again.");
        await pause();
        capture();
        btn.textContent = "Collecting " + cards.size + " cards...";
        var height = scroller.scrollHeight;
        var atBottom = scroller.scrollTop + scroller.clientHeight >= height - 2;
        stableBottom = atBottom && cards.size === previousSize && height === previousHeight ? stableBottom + 1 : 0;
        previousSize = cards.size;
        previousHeight = height;
        if (!atBottom) scroller.scrollTop += Math.max(100, Math.floor(scroller.clientHeight * 0.65));
      }
      var result = Array.from(cards.values()).sort(function (a, b) { return a.index - b.index; });
      if (!result.length) throw new Error("No cards were found. Open the set's Edit page and try again.");
      var missing = [];
      for (var i = 0; i <= result[result.length - 1].index; i++) {
        if (!cards.has(i)) missing.push(i + 1);
      }
      // Remaining virtual padding means the final rows have not mounted yet.
      var remaining = parseFloat(getComputedStyle(list).paddingBottom) || 0;
      if (missing.length || remaining > 2) {
        throw new Error("The set did not fully render. " + (missing.length ? "Missing card numbers: " + missing.join(", ") + ". " : "") +
          "Please try again and leave the page open while it scrolls.");
      }
      log("Collected", result.length, "cards in set order");
      return result;
    } finally {
      observer.disconnect();
      scroller.scrollTop = originalTop;
      scroller.style.scrollBehavior = originalBehavior;
    }
  }

  // ------------------------------------------------------------
  // Print HTML
  // ------------------------------------------------------------

  function getBackIndex(frontIndex, columns) {
    var row = Math.floor(frontIndex / columns);
    var col = frontIndex % columns;
    return row * columns + (columns - 1 - col);
  }

  function buildCardCellHTML(card, pageCardNumber, side, columns) {
    var html = "";

    if (side === "front") {
      html += '<div class="card-cell front-cell">';

      if (card) {
        if (card.termImageUrl) {
          html += '<div class="card-image"><img src="' + escapeAttr(card.termImageUrl) + '" alt=""></div>';
        }
        html += '<div class="term-text">' + escapeHTML(card.term) + "</div>";
      }

      html += "</div>";
      return html;
    }

    var extraClass = card && card.imageUrl ? "has-image" : "no-image";

    html += '<div class="card-cell back-cell ' + extraClass + '">';

    if (card) {
      if (card.imageUrl) {
        html += '<div class="card-image">';
        html += '<img src="' + escapeAttr(card.imageUrl) + '" alt="">';
        html += "</div>";
      }

      html += '<div class="def-text">' + escapeHTML(card.definition) + "</div>";
    }

    html += "</div>";
    return html;
  }

  function buildPrintPageHTML(pageCards, pageNumber, side, perPage, columns) {
    var html = "";

    html += '<section class="print-page ' + side + '-page">';
    html += '<div class="screen-page-label">';
    html += side === "front" ? "Front page " + pageNumber : "Back page " + pageNumber;
    html += "</div>";

    for (var i = 0; i < perPage; i++) {
      var card = null;

      if (side === "front") {
        card = pageCards[i] || null;
      } else {
        card = pageCards[getBackIndex(i, columns)] || null;
      }

      html += buildCardCellHTML(card, 0, side, columns);
    }

    html += "</section>";

    return html;
  }

  function buildPrintHTML(cards, perPage, columns) {
    var totalSheets = Math.ceil(cards.length / perPage);
    var pagesHTML = "";

    for (var p = 0; p < totalSheets; p++) {
      var pageCards = cards.slice(p * perPage, (p + 1) * perPage);
      pagesHTML += buildPrintPageHTML(pageCards, p + 1, "front", perPage, columns);
      pagesHTML += buildPrintPageHTML(pageCards, p + 1, "back", perPage, columns);
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Knowt Flashcards - Print</title>
<style>
  *, *::before, *::after {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
  }

  body {
    background: #e5e7eb;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #111827;
  }

  .controls {
    width: 210mm;
    margin: 16px auto;
    padding: 14px 16px;
    background: #ffffff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .controls h1 {
    margin: 0 0 8px 0;
    font-size: 18px;
  }

  .controls p {
    margin: 6px 0;
    font-size: 13px;
    line-height: 1.45;
    color: #374151;
  }

  .button-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .print-button {
    padding: 10px 14px;
    font-size: 14px;
    font-weight: 700;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    cursor: pointer;
    background: #4F46E5;
    color: #ffffff;
    border: none;
    border-radius: 8px;
  }

  .print-button.secondary {
    background: #374151;
  }

  .print-summary {
    font-size: 12px;
    color: #6B7280;
    margin-top: 10px;
  }

  .print-page {
    position: relative;
    background: #ffffff;
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto 20px auto;
    padding: 10mm;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    display: grid;
    grid-template-columns: repeat(2, 94mm);
    grid-template-rows: repeat(4, 67mm);
    gap: 2mm;
    justify-content: center;
    align-content: center;
    outline: 0.2mm solid #d1d5db;
  }

  .screen-page-label {
    position: absolute;
    top: 3mm;
    left: 10mm;
    font-size: 10pt;
    color: #6B7280;
  }

  .card-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3mm;
    border-radius: 2mm;
    overflow: hidden;
    max-height: 67mm;
  }

  .front-cell {
    border: 1.5px dashed #9CA3AF;
  }

  .back-cell {
    border: none;
    gap: 1.5mm;
  }

  .term-text {
    font-size: 18pt;
    font-weight: 800;
    text-align: center;
    color: #111827;
    line-height: 1.25;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  .card-image {
    flex: 0 0 auto;
    max-height: 33mm;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .card-image img {
    max-width: 100%;
    max-height: 32mm;
    object-fit: contain;
  }

  .def-text {
    text-align: center;
    color: #111827;
    line-height: 1.35;
    word-break: break-word;
    overflow-wrap: anywhere;
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .back-cell.has-image .def-text {
    font-size: 10.5pt;
  }

  .back-cell.no-image .def-text {
    font-size: 13pt;
  }

  @page {
    size: A4 portrait;
    margin: 0;
  }

  @media print {
    html, body {
      background: #ffffff;
      width: 210mm;
      height: auto;
      margin: 0;
      padding: 0;
    }

    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .controls {
      display: none !important;
    }

    .print-page {
      width: 210mm;
      height: 297mm;
      min-height: 297mm;
      margin: 0;
      padding: 10mm;
      box-shadow: none;
      outline: none;
      page-break-after: always;
      break-after: page;
      display: grid;
      grid-template-columns: repeat(2, 94mm);
      grid-template-rows: repeat(4, 67mm);
      gap: 2mm;
      justify-content: center;
      align-content: center;
      overflow: hidden;
    }

    .print-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    .screen-page-label {
      display: none !important;
    }

    body.print-front-only .back-page {
      display: none !important;
    }

    body.print-back-only .front-page {
      display: none !important;
    }

    .card-cell {
      max-height: 67mm;
      page-break-inside: avoid;
      break-inside: avoid;
    }
  }
</style>
</head>
<body>
  <div class="controls">
    <h1>Knowt Flashcards - Printable Double-Sided Cards</h1>
    <p><strong>Best option:</strong> Click "Print all duplex", then choose double-sided printing and "Flip on long edge" in your printer dialog.</p>
    <p><strong>Manual option:</strong> Print fronts only first. Put the paper back in the printer, then print backs only.</p>
    <p>The back pages are mirrored left-to-right so the definitions line up with the matching terms after duplex printing.</p>
    <p><strong>Important print settings:</strong> Paper size A4, scale 100, margins none, pages per sheet 1, headers and footers off.</p>

    <div class="button-row">
      <button class="print-button" onclick="setPrintMode('print-all')">Print all duplex</button>
      <button class="print-button secondary" onclick="setPrintMode('print-front-only')">Print fronts only</button>
      <button class="print-button secondary" onclick="setPrintMode('print-back-only')">Print backs only</button>
    </div>

    <div class="print-summary">
      ${cards.length} cards - ${totalSheets} sheet${totalSheets !== 1 ? "s" : ""} - 8 cards per sheet
    </div>
  </div>

  ${pagesHTML}

<script>
  async function setPrintMode(mode) {
    document.body.className = mode;
    var buttons = Array.from(document.querySelectorAll('button'));
    buttons.forEach(function (button) { button.disabled = true; });
    try {
      var images = Array.from(document.images).filter(function (img) { return img.getClientRects().length; });
      await Promise.all(images.map(function (img) {
        return new Promise(function (resolve, reject) {
          var timer;
          function done() {
            clearTimeout(timer);
            img.removeEventListener('load', done);
            img.removeEventListener('error', done);
            if (img.complete && img.naturalWidth) resolve();
            else reject(new Error('An image could not load. Wait or reload this preview, then try printing again.'));
          }
          if (img.complete) return done();
          img.addEventListener('load', done);
          img.addEventListener('error', done);
          timer = setTimeout(done, 30000);
        });
      }));
      await document.fonts.ready;
      window.print();
    } catch (error) { alert(error.message); }
    finally { buttons.forEach(function (button) { button.disabled = false; }); }
  }
</script>
</body>
</html>`;
  }

  function openPrintWindow(cards, w) {
    if (w.closed) throw new Error("The print preview was closed. Please try again.");
    var html = buildPrintHTML(cards, 8, 2);
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ------------------------------------------------------------
  // Button creation and persistence
  // ------------------------------------------------------------

  var ktButtonObserver = null;
  var ktButtonInterval = null;

  function resetButton(btn) {
    btn.innerHTML = "Print Flashcards";
    btn.disabled = false;
  }

  function createPrintButton() {
    var btn = document.createElement("button");
    btn.id = "kt-print-btn";
    btn.type = "button";
    btn.innerHTML = "Print Flashcards";

    btn.addEventListener("click", async function () {
      // Open during the click so popup blockers do not reject the async result.
      var w = window.open("", "_blank", "width=1000,height=800");
      if (!w) { alert("Please allow popups for Knowt, then try again."); return; }
      w.document.body.textContent = "Collecting flashcards. Keep the Knowt page open and let it scroll automatically.";
      btn.disabled = true;
      try {
        var cards = await collectAllCards(btn);
        openPrintWindow(cards, w);
      } catch (error) {
        console.error("[Knowt Print]", error);
        if (!w.closed) w.close();
        alert("Error: " + error.message);
      } finally { resetButton(btn); }
    });

    return btn;
  }

  function ensurePrintButton() {
    if (!document.body) return;

    var existing = document.getElementById("kt-print-btn");

    if (existing && document.body.contains(existing)) {
      return;
    }

    var btn = createPrintButton();
    document.body.appendChild(btn);
    log("Print button added or restored");
  }

  function init() {
    log("Knowt Flashcard Print userscript v1.2.0 loaded");

    ensurePrintButton();

    if (!ktButtonObserver) {
      ktButtonObserver = new MutationObserver(function () {
        ensurePrintButton();
      });

      ktButtonObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    if (!ktButtonInterval) {
      ktButtonInterval = setInterval(function () {
        ensurePrintButton();
      }, 1000);
    }
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    window.addEventListener("DOMContentLoaded", init);
  }
})();