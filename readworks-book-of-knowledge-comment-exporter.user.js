// ==UserScript==
// @name         ReadWorks Book of Knowledge - Comment Exporter
// @namespace    https://github.com/nousresearch
// @version      1.6.0
// @description  Extract all student BOK comments with names from ReadWorks assignments. Export in multiple formats including AI-collage-ready text and A4 landscape print medley with density control (1,2,4,6,8,10 per page), article colors, and student interleaving.
// @author       Hermes Agent
// @match        https://www.readworks.org/*
// @match        https://*.readworks.org/*
// @icon         https://www.readworks.org/favicon.ico
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/584410/ReadWorks%20Book%20of%20Knowledge%20-%20Comment%20Exporter.user.js
// @updateURL https://update.greasyfork.org/scripts/584410/ReadWorks%20Book%20of%20Knowledge%20-%20Comment%20Exporter.meta.js
// ==/UserScript==

/* --------------------------------------------
   ReadWorks Book of Knowledge Comment Exporter
   v1.6.0 - Landscape orientation with adjusted grid layouts
   -------------------------------------------- */

(function () {
  "use strict";

  const DEBUG = true;
  function log(...args) { if (DEBUG) console.log("[BOK Exporter]", ...args); }

  // -- Panel Styles ----------------------------
  GM_addStyle(`
    #rw-bok-export-panel {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      background: #1e1e2e;
      color: #cdd6f4;
      border: 1px solid #45475a;
      border-radius: 12px;
      padding: 16px 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.35);
      min-width: 290px;
      max-width: 380px;
      transition: all 0.2s ease;
    }
    #rw-bok-export-panel.minimized {
      min-width: auto;
      padding: 10px 14px;
    }
    #rw-bok-export-panel h3 {
      margin: 0 0 12px 0;
      font-size: 15px;
      font-weight: 700;
      color: #cba6f7;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }
    #rw-bok-export-panel h3 .count-badge {
      background: #a6e3a1;
      color: #1e1e2e;
      border-radius: 10px;
      padding: 1px 8px;
      font-size: 12px;
      font-weight: 700;
      margin-left: auto;
    }
    #rw-bok-export-panel .rw-bok-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    #rw-bok-export-panel .rw-section-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #6c7086;
      margin: 4px 0 0 0;
      padding-top: 8px;
      border-top: 1px solid #45475a;
    }
    #rw-bok-export-panel .rw-section-label:first-child {
      border-top: none;
      padding-top: 0;
      margin-top: 0;
    }
    #rw-bok-export-panel .rw-subject-row {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    #rw-bok-export-panel .rw-subject-row input {
      flex: 1;
      padding: 6px 8px;
      border: 1px solid #45475a;
      border-radius: 6px;
      background: #313244;
      color: #cdd6f4;
      font-size: 12px;
      font-family: inherit;
    }
    #rw-bok-export-panel .rw-subject-row input::placeholder {
      color: #6c7086;
    }
    #rw-bok-export-panel .rw-density-row {
      display: flex;
      gap: 5px;
      align-items: center;
    }
    #rw-bok-export-panel .rw-density-row span {
      font-size: 11px;
      color: #a6adc8;
      white-space: nowrap;
    }
    #rw-bok-export-panel .rw-density-row button.density-btn {
      flex: 1;
      padding: 6px 0;
      font-size: 12px;
      text-align: center;
      border-radius: 6px;
      border: 1px solid #45475a;
      background: #313244;
      color: #cdd6f4;
      cursor: pointer;
      transition: all 0.15s;
    }
    #rw-bok-export-panel .rw-density-row button.density-btn.active {
      background: #5B8C85;
      border-color: #5B8C85;
      color: #fff;
      font-weight: 700;
    }
    #rw-bok-export-panel .rw-density-row button.density-btn:hover {
      background: #45475a;
    }
    #rw-bok-export-panel .rw-density-row button.density-btn.active:hover {
      background: #4a7a74;
    }
    #rw-bok-export-panel .rw-palette-row {
      display: flex;
      gap: 5px;
      align-items: center;
    }
    #rw-bok-export-panel .rw-palette-row span {
      font-size: 11px;
      color: #a6adc8;
      white-space: nowrap;
    }
    #rw-bok-export-panel .rw-palette-row button.palette-btn {
      flex: 1;
      padding: 6px 4px;
      font-size: 10px;
      text-align: center;
      border-radius: 6px;
      border: 1px solid #45475a;
      background: #313244;
      color: #cdd6f4;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
      overflow: hidden;
    }
    #rw-bok-export-panel .rw-palette-row button.palette-btn:hover {
      background: #45475a;
    }
    #rw-bok-export-panel .rw-palette-row button.palette-btn.active {
      border-color: #cba6f7;
      color: #cba6f7;
      font-weight: 700;
    }
    #rw-bok-export-panel .rw-palette-row button.palette-btn .swatch-dots {
      display: flex;
      gap: 2px;
      justify-content: center;
      margin-bottom: 2px;
    }
    #rw-bok-export-panel .rw-palette-row button.palette-btn .swatch-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    #rw-bok-export-panel button {
      display: block;
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #45475a;
      border-radius: 6px;
      background: #313244;
      color: #cdd6f4;
      cursor: pointer;
      font-size: 12px;
      text-align: left;
      transition: background 0.15s;
    }
    #rw-bok-export-panel button:hover {
      background: #45475a;
    }
    #rw-bok-export-panel button.primary {
      background: #cba6f7;
      color: #1e1e2e;
      border-color: #cba6f7;
      font-weight: 600;
    }
    #rw-bok-export-panel button.primary:hover {
      background: #b4befe;
      border-color: #b4befe;
    }
    #rw-bok-export-panel button.medley-btn {
      background: #a6e3a1;
      color: #1e1e2e;
      border-color: #a6e3a1;
      font-weight: 700;
      font-size: 13px;
    }
    #rw-bok-export-panel button.medley-btn:hover {
      background: #94e2d5;
      border-color: #94e2d5;
    }
    #rw-bok-export-panel button.debug-btn {
      background: #f38ba8;
      color: #1e1e2e;
      border-color: #f38ba8;
      font-weight: 600;
    }
    #rw-bok-export-panel .status-msg {
      font-size: 11px;
      color: #a6e3a1;
      min-height: 16px;
      margin-top: 4px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    #rw-bok-export-panel .status-msg.show {
      opacity: 1;
    }
    #rw-bok-export-panel .toggle-icon {
      font-size: 14px;
      transition: transform 0.2s;
    }
    #rw-bok-export-panel.minimized .toggle-icon {
      transform: rotate(-90deg);
    }
    @media print {
      #rw-bok-export-panel { display: none !important; }
    }
  `);

  // -- Extract entries (now includes article title) -
  function extractEntries() {
    const entries = [];

    const bokEntries = document.querySelectorAll(".bok-entry");
    bokEntries.forEach((entry) => {
      const nameEl = entry.querySelector(".student-name, [class*='student-name']");
      const contentEl = entry.querySelector(".bok-submission-content, [class*='submission-content']");
      const articleEl = entry.querySelector(".article-title");

      if (nameEl && contentEl) {
        let name = nameEl.textContent.trim().replace(/\s+said:\s*$/i, "");
        const comment = contentEl.textContent.trim();
        const article = articleEl ? articleEl.textContent.trim() : "";
        if (name && comment) {
          entries.push({ name, comment, article });
        }
      }
    });

    // Fallback: try old selectors if .bok-entry didn't work
    if (entries.length === 0) {
      const nameEls = document.querySelectorAll(".student-name, [class*='student-name']");
      nameEls.forEach((nameEl) => {
        let parent = nameEl.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const contentEl = parent.querySelector(".bok-submission-content, [class*='submission-content']");
          if (contentEl) {
            const articleEl = parent.querySelector(".article-title");
            entries.push({
              name: nameEl.textContent.trim().replace(/\s+said:\s*$/i, ""),
              comment: contentEl.textContent.trim(),
              article: articleEl ? articleEl.textContent.trim() : "",
            });
            break;
          }
          parent = parent.parentElement;
        }
      });
    }

    // Deduplicate by name + comment + article
    const seen = new Set();
    return entries.filter((e) => {
      const key = `${e.name}|||${e.comment}|||${e.article}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // -- Interleave entries: minimize same student per page -
  function interleaveEntries(entries, perPage) {
    if (entries.length === 0) return [];

    // Group by student name
    const groups = {};
    entries.forEach((e) => {
      if (!groups[e.name]) groups[e.name] = [];
      groups[e.name].push(e);
    });

    const names = Object.keys(groups).sort();
    const totalEntries = entries.length;
    const totalPages = Math.ceil(totalEntries / perPage);

    // Track which names have appeared on each page so far
    const usedOnPage = [];
    for (let p = 0; p < totalPages; p++) {
      usedOnPage.push(new Set());
    }

    // Working copy: remaining entries per student
    const remaining = names.map((name) => ({
      name,
      count: groups[name].length,
      entries: [...groups[name]],  // shallow clone - we'll shift() from this
    }));

    const result = [];

    // Fill each page slot by slot
    for (let page = 0; page < totalPages; page++) {
      const slotsNeeded = Math.min(perPage, totalEntries - result.length);

      for (let slot = 0; slot < slotsNeeded; slot++) {
        // Sort: students with most remaining entries first (stable tie-break by name)
        remaining.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

        // First choice: most remaining entries, NOT yet on this page
        let chosen = remaining.find(
          (c) => c.count > 0 && !usedOnPage[page].has(c.name)
        );

        // Fallback: any student with remaining entries (repeat unavoidable)
        if (!chosen) {
          chosen = remaining.find((c) => c.count > 0);
        }

        if (chosen) {
          result.push(chosen.entries.shift());
          chosen.count--;
          usedOnPage[page].add(chosen.name);
        }
      }
    }

    return result;
  }

  // -- Debug -----------------------------------
  function debugPageStructure() {
    log("=== PAGE DEBUG ===");
    log("URL:", window.location.href);
    const entries = extractEntries();
    log(`Entries: ${entries.length}`);
    const articles = new Set(entries.map((e) => e.article).filter(Boolean));
    log(`Unique articles: ${[...articles].join(", ")}`);
    const names = new Set(entries.map((e) => e.name));
    log(`Unique students: ${[...names].join(", ")}`);
    entries.slice(0, 3).forEach((e, i) => {
      log(`  [${i}] ${e.name} | ${e.article} | "${e.comment.substring(0, 60)}..."`);
    });
    log("=== END DEBUG ===");
  }

  // -- Scrape opened assignment / student-summary title --------------------
  function scrapeSubject() {
    function cleanTitleText(el) {
      if (!el) return "";

      const clone = el.cloneNode(true);

      // Remove things that are not part of the title.
      const junkSelectors = [
        "button",
        "i",
        "svg",
        "img",
        ".assignment-date",
        "[class*='date']",
        ".entry-count",
        "[class*='entry-count']",
        ".student-name",
        "[class*='student-name']",
        ".bok-submission-content",
        "[class*='submission-content']"
      ];

      junkSelectors.forEach(function (sel) {
        const nodes = clone.querySelectorAll(sel);
        nodes.forEach(function (node) {
          node.remove();
        });
      });

      let txt = clone.textContent || "";

      txt = txt
        .replace(/\s+/g, " ")
        .replace(/\b[A-Z][a-z]{2}\s+\d{1,2}\s*-\s*[A-Z][a-z]{2}\s+\d{1,2},\s*\d{4}\b/g, "")
        .replace(/\b[A-Z][a-z]{2}\s+\d{1,2},\s*\d{4}\b/g, "")
        .replace(/\b\d+\s+entries?\b/gi, "")
        .trim();

      return txt;
    }

    function isGoodTitle(txt) {
      if (!txt) return false;
      if (txt.length < 2) return false;
      if (/readworks|book of knowledge|assignment|student reflections/i.test(txt)) return false;
      if (/^[A-Z][a-z]{2}\s+\d{1,2}/.test(txt)) return false;
      return true;
    }

    // 1. Best match: the expanded/open assignment section that contains student summaries.
    const openPanels = Array.from(document.querySelectorAll(
      "section.bok-panel.expanded, section[class*='bok-panel'][class*='expanded'], section[aria-expanded='true']"
    ));

    for (let i = 0; i < openPanels.length; i++) {
      const panel = openPanels[i];

      // Make sure this is a student-summary panel, not just any open panel.
      if (!panel.querySelector(".bok-entry, [class*='bok-entry'], .bok-submission-content, [class*='submission-content']")) {
        continue;
      }

      const header = panel.querySelector(
        ".bok-assignment-header, [id^='bok-assignment-header'], [class*='assignment-header']"
      );

      if (header) {
        const titleCandidates = header.querySelectorAll(
          "h1, h2, h3, h4, .product-title, .assignment-title, [class*='title']"
        );

        for (let j = 0; j < titleCandidates.length; j++) {
          const txt = cleanTitleText(titleCandidates[j]);
          if (isGoodTitle(txt)) return txt;
        }

        const headerTxt = cleanTitleText(header);
        if (isGoodTitle(headerTxt)) return headerTxt;
      }
    }

    // 2. Fallback: find an expanded accordion button, then use its matching header.
    const expandedButtons = Array.from(document.querySelectorAll(
      "button[aria-expanded='true'][aria-controls]"
    ));

    for (let i = 0; i < expandedButtons.length; i++) {
      const btn = expandedButtons[i];
      const header = btn.closest(
        ".bok-assignment-header, [id^='bok-assignment-header'], [class*='assignment-header'], header"
      );

      if (header) {
        const titleCandidates = header.querySelectorAll(
          "h1, h2, h3, h4, .product-title, .assignment-title, [class*='title']"
        );

        for (let j = 0; j < titleCandidates.length; j++) {
          const txt = cleanTitleText(titleCandidates[j]);
          if (isGoodTitle(txt)) return txt;
        }

        const headerTxt = cleanTitleText(header);
        if (isGoodTitle(headerTxt)) return headerTxt;
      }
    }

    // 3. Older ReadWorks article-title fallback.
    const oldSelectors = [
      "#content h3.product-title",
      "main h3.product-title",
      "h3.product-title",
      ".assignment-title",
      "[class*='assignment-title']",
      ".reading-title",
      "[class*='reading-title']",
      ".page-title",
      "[class*='page-title']",
      "h1"
    ];

    for (let i = 0; i < oldSelectors.length; i++) {
      const el = document.querySelector(oldSelectors[i]);
      const txt = cleanTitleText(el);
      if (isGoodTitle(txt)) return txt;
    }

    return "";
  }

  // -- Scrape assignment date ------------------
  function scrapeAssignmentDate() {
    const dateEl = document.querySelector(".assignment-date");
    if (!dateEl) return "";

    // Clone so we can safely remove child elements
    const clone = dateEl.cloneNode(true);
    // Remove the .entry-count span if present
    const countSpan = clone.querySelector(".entry-count");
    if (countSpan) countSpan.remove();

    return clone.textContent.trim();
  }

  // -- Escape HTML -----------------------------
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // -- Article color palettes (ink-efficient, 10 colors each) -
  const ARTICLE_PALETTES = [
    { // 0 - Earthy Warm
      name: "Earthy Warm",
      colors: [
        { border: "#B86B3D", bg: "#FDF6F0" },  // terracotta
        { border: "#5B8C85", bg: "#F2F7F6" },  // sage
        { border: "#8B5E83", bg: "#F8F3F7" },  // muted plum
        { border: "#C4843B", bg: "#FDF8F2" },  // warm amber
        { border: "#4A7C96", bg: "#F2F6F8" },  // slate blue
        { border: "#9B6B4F", bg: "#F9F5F1" },  // cocoa
        { border: "#6B8E6B", bg: "#F4F7F3" },  // olive
        { border: "#A0525C", bg: "#FBF5F5" },  // dusty rose
        { border: "#5C7A6B", bg: "#F3F7F5" },  // pine
        { border: "#8B6D4A", bg: "#F9F6F2" },  // warm brown
      ],
    },
    { // 1 - Ocean Cool
      name: "Ocean Cool",
      colors: [
        { border: "#3A7D8C", bg: "#F2F7F8" },  // deep teal
        { border: "#C07060", bg: "#FDF6F4" },  // coral
        { border: "#6B7DB3", bg: "#F5F5FA" },  // periwinkle
        { border: "#3D5A80", bg: "#F3F5F9" },  // navy
        { border: "#6BAA9E", bg: "#F3F8F7" },  // seafoam
        { border: "#C4A882", bg: "#F9F6F2" },  // sand
        { border: "#7B9EB3", bg: "#F4F7F9" },  // sky steel
        { border: "#8E6B7B", bg: "#F9F5F7" },  // mauve
        { border: "#5A8F8F", bg: "#F2F7F6" },  // deep aqua
        { border: "#A09080", bg: "#F8F6F4" },  // driftwood
      ],
    },
    { // 2 - Garden Fresh
      name: "Garden Fresh",
      colors: [
        { border: "#6B9E5A", bg: "#F4F8F2" },  // leaf green
        { border: "#9B8EC4", bg: "#F7F5FA" },  // lavender
        { border: "#C4B85A", bg: "#FCFAF3" },  // butter yellow
        { border: "#6B9EC4", bg: "#F3F7FA" },  // sky blue
        { border: "#C47B8E", bg: "#FCF5F7" },  // rose
        { border: "#8EC4A0", bg: "#F4F9F6" },  // mint
        { border: "#C49B6B", bg: "#FBF7F2" },  // honey
        { border: "#8EB3C4", bg: "#F4F8FA" },  // powder blue
        { border: "#B38EC4", bg: "#F8F5FA" },  // lilac
        { border: "#9EC47B", bg: "#F6F9F3" },  // celery
      ],
    },
    { // 3 - Sunset Glow
      name: "Sunset Glow",
      colors: [
        { border: "#C49B7B", bg: "#FCF7F3" },  // peach
        { border: "#C47B8E", bg: "#FCF5F7" },  // dusty rose
        { border: "#C4A85A", bg: "#FCFAF3" },  // goldenrod
        { border: "#A08EC4", bg: "#F7F5FA" },  // lilac
        { border: "#9B9B9B", bg: "#F6F6F6" },  // warm grey
        { border: "#C48B5A", bg: "#FCF6F2" },  // soft orange
        { border: "#C49494", bg: "#FBF6F6" },  // blush
        { border: "#A0A8C4", bg: "#F6F7FA" },  // lavender grey
        { border: "#C4B08B", bg: "#FBF8F4" },  // wheat
        { border: "#8BA8C4", bg: "#F4F7FA" },  // cornflower
      ],
    },
  ];

  function getArticleColorMap(articles, paletteIndex) {
    const palette = ARTICLE_PALETTES[paletteIndex || 0].colors;
    const map = {};
    articles.forEach((article, i) => {
      map[article] = palette[i % palette.length];
    });
    return map;
  }

  function readPaletteIndex() {
    const activeBtn = document.querySelector("#rw-bok-export-panel .palette-btn.active");
    return activeBtn ? parseInt(activeBtn.dataset.palette) : 0;
  }

  // ===============================================
  //  MEDLEY HTML GENERATOR
  // ===============================================

  function generateMedleyHTML(rawEntries, subject, perPage, paletteIndex) {
    paletteIndex = paletteIndex || 0;
    // Interleave first, then build
    const entries = interleaveEntries(rawEntries, perPage);

    // Build article color map
    const articles = [...new Set(entries.map((e) => e.article).filter(Boolean))];
    const colorMap = getArticleColorMap(articles, paletteIndex);

    const scrapedDate = scrapeAssignmentDate();
    const today = scrapedDate || new Date().toLocaleDateString("en-GB", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const subjectDisplay = subject || "This Week's Reading";

    // -- Layout config by density ---------------
    const layoutConfig = {
      1:  { nameSize: "30pt", baseQuoteSize: 18, articleSize: "13pt", bubblePad: "10mm 10mm", cardPad: "12mm 12mm", maxWidth: "250mm", bubbleMaxW: "220mm", innerMinH: "100mm" },
      2:  { nameSize: "22pt", baseQuoteSize: 14, articleSize: "11pt", bubblePad: "5mm 8mm",   cardPad: "6mm 10mm",   maxWidth: "100%",  bubbleMaxW: "100%",  innerMinH: "0" },
      4:  { nameSize: "15pt", baseQuoteSize: 11, articleSize: "9pt",  bubblePad: "4mm 6mm",   cardPad: "4mm 6mm",    maxWidth: "100%",  bubbleMaxW: "100%",  innerMinH: "0" },
      6:  { nameSize: "12pt", baseQuoteSize: 10, articleSize: "8pt",  bubblePad: "3mm 5mm",   cardPad: "3mm 4mm",    maxWidth: "100%",  bubbleMaxW: "100%",  innerMinH: "0" },
      8:  { nameSize: "11pt", baseQuoteSize: 9,  articleSize: "7pt",  bubblePad: "2mm 4mm",   cardPad: "2mm 3mm",    maxWidth: "100%",  bubbleMaxW: "100%",  innerMinH: "0" },
      10: { nameSize: "10pt", baseQuoteSize: 8,  articleSize: "7pt",  bubblePad: "2mm 3mm",   cardPad: "2mm 3mm",    maxWidth: "100%",  bubbleMaxW: "100%",  innerMinH: "0" },
    };

    const cfg = layoutConfig[perPage] || layoutConfig[4];

    // -- Dynamic font sizing based on comment length -
    function calcQuoteSize(comment, basePt) {
      const len = comment.length;
      let scale;
      if (len <= 60)       scale = 1.25;   // short -> bigger
      else if (len <= 180) scale = 1.08;   // medium-short -> slightly bigger
      else if (len <= 400) scale = 1.0;    // medium -> standard
      else if (len <= 700) scale = 0.85;   // long -> smaller
      else                 scale = 0.72;   // very long -> much smaller
      return (basePt * scale).toFixed(1) + "pt";
    }

    // -- Build quote card HTML ------------------
    function quoteCardHTML(entry, i) {
      const palette = entry.article && colorMap[entry.article]
        ? colorMap[entry.article]
        : { border: "#B86B3D", bg: "#FDF6F0" };

      const articleLine = entry.article
        ? `<div class="qc-article" style="color: ${palette.border}; font-size: ${cfg.articleSize};">
             from <em>"${esc(entry.article)}"</em>
           </div>`
        : "";

      const quoteFontSize = calcQuoteSize(entry.comment, cfg.baseQuoteSize);

      return `
        <div class="qc-card" style="border-color: ${palette.border};">
          <div class="qc-inner" style="background: ${palette.bg};">
            <div class="qc-name" style="color: ${palette.border}; font-size: ${cfg.nameSize};">
              ${esc(entry.name)}
            </div>
            ${articleLine}
            <div class="qc-bubble" style="border-color: ${palette.border}; padding: ${cfg.bubblePad}; max-width: ${cfg.bubbleMaxW};">
              <div class="qc-quote" style="font-size: ${quoteFontSize};">
                &ldquo;${esc(entry.comment)}&rdquo;
              </div>
            </div>
          </div>
        </div>`;
    }

    // -- Split entries into pages --------------
    let pagesHTML = "";
    for (let pageIdx = 0; pageIdx < entries.length; pageIdx += perPage) {
      const pageEntries = entries.slice(pageIdx, pageIdx + perPage);
      const gridClass = perPage === 1  ? "qc-page-single"
                      : perPage === 2  ? "qc-page-2"
                      : perPage === 4  ? "qc-page-4"
                      : perPage === 6  ? "qc-page-6"
                      : perPage === 8  ? "qc-page-8"
                      : "qc-page-10";

      const cardsHTML = pageEntries.map((e, i) => quoteCardHTML(e, pageIdx + i)).join("\n");

      pagesHTML += `
    <div class="quote-page">
      <div class="qc-grid ${gridClass}">
        ${cardsHTML}
      </div>
    </div>`;
    }

    // -- Full HTML ------------------------------
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Book of Knowledge - ${esc(subjectDisplay)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* Print fix: the page boxes are exactly A4 landscape. Internal padding creates the visual margins.
     Do not use @page margins here, or Chrome/Edge can split one A4 page across two sheets. */
  @page { size: A4 landscape; margin: 0; }
  html, body { width: 297mm; margin: 0; padding: 0; }
  @media print {
    html, body {
      width: 297mm;
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .title-page, .quote-page {
      width: 297mm !important;
      height: 210mm !important;
      min-height: 210mm !important;
      max-height: 210mm !important;
      margin: 0 !important;
      box-shadow: none !important;
      page-break-inside: avoid !important;
      break-inside: avoid-page !important;
      overflow: hidden !important;
    }
    .title-page, .quote-page { page-break-after: always; break-after: page; }
    .quote-page:last-child { page-break-after: auto; break-after: auto; }
    .qc-card, .qc-inner, .qc-bubble {
      page-break-inside: avoid !important;
      break-inside: avoid-page !important;
    }
  }
  @media screen {
    body { background: #e8e5df; display: flex; flex-direction: column; align-items: center; padding: 40px 0; }
    .title-page, .quote-page { box-shadow: 0 2px 12px rgba(0,0,0,0.15); margin-bottom: 20px; background: white; }
  }
  .title-page, .quote-page {
    width: 297mm; height: 210mm; min-height: 210mm; max-height: 210mm; background: white;
    position: relative; overflow: hidden;
    page-break-inside: avoid; break-inside: avoid-page;
  }

  /* -- TITLE PAGE ---------------------------- */
  .title-page {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; text-align: center; padding: 15mm 25mm;
  }
  .tp-border-top, .tp-border-bottom {
    position: absolute; left: 8mm; right: 8mm; height: 3mm;
  }
  .tp-border-top {
    top: 10mm;
    background: linear-gradient(to right, #B86B3D 0%, #B86B3D 40%, #5B8C85 40%, #5B8C85 60%, #B86B3D 60%, #B86B3D 100%);
  }
  .tp-border-bottom {
    bottom: 10mm;
    background: linear-gradient(to right, #5B8C85 0%, #5B8C85 40%, #B86B3D 40%, #B86B3D 60%, #5B8C85 60%, #5B8C85 100%);
  }
  .tp-corner { position: absolute; font-size: 28px; }
  .tp-corner-tl { top: 14mm; left: 12mm; color: #B86B3D; }
  .tp-corner-tr { top: 14mm; right: 12mm; color: #5B8C85; }
  .tp-corner-bl { bottom: 14mm; left: 12mm; color: #5B8C85; }
  .tp-corner-br { bottom: 14mm; right: 12mm; color: #B86B3D; }
  .tp-overline {
    font-family: Georgia, serif; font-size: 13pt; color: #5B8C85;
    letter-spacing: 4px; text-transform: uppercase; margin-bottom: 6mm;
  }
  .tp-main {
    font-family: Georgia, serif; font-size: 36pt; font-weight: 700;
    color: #2C1810; line-height: 1.15; margin-bottom: 4mm;
    max-width: 90%; word-wrap: break-word;
  }
  .tp-rule { width: 60mm; height: 2px; background: #B86B3D; margin: 4mm auto; }
  .tp-sub {
    font-family: Georgia, serif; font-size: 16pt; color: #5B8C85;
    font-style: italic; margin-bottom: 3mm;
  }
  .tp-meta { font-family: Georgia, serif; font-size: 11pt; color: #888; margin-bottom: 2mm; }
  .tp-count { font-family: Georgia, serif; font-size: 12pt; color: #B86B3D; margin-top: 2mm; }
  .tp-dots { font-size: 9pt; color: #B86B3D; letter-spacing: 6px; margin: 4mm 0; }
  .tp-article-list {
    margin-top: 4mm;
    text-align: center;
  }
  .tp-article-list-title {
    font-family: Georgia, serif;
    font-size: 10pt;
    color: #5B8C85;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 3mm;
  }
  .tp-article-item {
    font-family: Georgia, serif;
    font-size: 9pt;
    color: #888;
    line-height: 1.8;
    white-space: nowrap;
  }

  /* -- QUOTE PAGES --------------------------- */
  .quote-page {
    display: flex;
    flex-direction: column;
    padding: 6mm 12mm 8mm 12mm;
  }
  .qc-grid {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    gap: 5mm;
    align-content: stretch;
  }
  .qc-page-single { grid-template-columns: minmax(0, 1fr); max-width: 250mm; margin: 0 auto; }
  .qc-page-2      { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .qc-page-4      { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); }
  .qc-page-6      { grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); }
  .qc-page-8      { grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); }
  .qc-page-10     { grid-template-columns: repeat(5, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); }

  /* -- Individual quote card ------------------ */
  .qc-card {
    border: 2px solid;
    border-radius: 4px;
    padding: 2mm;
    min-height: 0;
    overflow: hidden;
  }
  .qc-inner {
    border-radius: 2px; padding: ${cfg.cardPad};
    text-align: center; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 100%; min-height: 0;
    gap: 1.5mm;
    overflow: hidden;
  }
  .qc-name {
    font-family: Georgia, serif; font-weight: 700;
    line-height: 1.2;
  }
  .qc-article {
    font-family: Georgia, serif; font-style: italic;
    line-height: 1.2; opacity: 0.85;
  }
  .qc-bubble {
    position: relative; border: 2px solid; border-radius: 16px;
    background: white; margin-top: 1mm;
    max-height: 100%; overflow: hidden;
  }
  .qc-quote {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.5; color: #2C1810; text-align: center;
  }
</style>
</head>
<body>

<!-- =========== TITLE PAGE =========== -->
<div class="title-page">
  <div class="tp-border-top"></div>
  <div class="tp-border-bottom"></div>
  <div class="tp-corner tp-corner-tl">*</div>
  <div class="tp-corner tp-corner-tr">*</div>
  <div class="tp-corner tp-corner-bl">*</div>
  <div class="tp-corner tp-corner-br">*</div>

  <div class="tp-overline">Our Class Book of Knowledge</div>
  <div class="tp-main">${esc(subjectDisplay)}</div>
  <div class="tp-rule"></div>
  <div class="tp-sub">Student Reflections</div>
  <div class="tp-meta">${today}</div>
  <div class="tp-dots">* * * * * * * * * *</div>
  <div class="tp-count">${[...new Set(rawEntries.map((e) => e.name))].length} voices * ${rawEntries.length} ideas</div>
  ${articles.length > 1 ? `<div class="tp-article-list"><div class="tp-article-list-title">Articles</div>${articles.map((a) => `<div class="tp-article-item">${esc(a)}</div>`).join("")}</div>` : ""}
</div>

${pagesHTML}

</body>
</html>`;
  }

  // -- Open medley ------------------------------
  function openMedley() {
    try {
      const entries = extractEntries();
      log("openMedley: entries =", entries.length);
      if (entries.length === 0) { showStatus("Warning: No entries found!"); return; }

      const pageSubject = scrapeSubject();
      const subjectInput = document.getElementById("rw-bok-subject");
      let subject = pageSubject || (subjectInput ? subjectInput.value.trim() : "");
      log("openMedley: subject =", subject);

      const densityBtns = document.querySelectorAll("#rw-bok-export-panel .density-btn.active");
      let perPage = 4;
      if (densityBtns.length > 0) {
        perPage = parseInt(densityBtns[0].dataset.perpage) || 4;
      }
      log("openMedley: perPage =", perPage);

      const html = generateMedleyHTML(entries, subject, perPage, readPaletteIndex());
      log("openMedley: html generated, length =", html.length);

      const w = window.open("", "_blank");
      if (!w) {
        showStatus("Warning: Popup blocked!");
        downloadFile(html, "book-of-knowledge-medley.html", "text/html");
        showStatus("Download: Downloaded HTML instead. Open it and Ctrl+P.");
        return;
      }
      w.document.write(html);
      w.document.close();

      const interleaved = interleaveEntries(entries, perPage);
      const pageCount = Math.ceil(interleaved.length / perPage) + 1;
      showStatus(`Open: ${pageCount} pages - Ctrl+P to print!`);
      if (subject) {
        try { GM_setValue("lastSubject", subject); } catch(e) {}
      }
    } catch(err) {
      console.error("[BOK Exporter] openMedley error:", err);
      showStatus("Error: Error: " + err.message);
    }
  }

  // -- Download medley -------------------------
  function downloadMedley() {
    try {
      const entries = extractEntries();
      log("downloadMedley: entries =", entries.length);
      if (entries.length === 0) { showStatus("Warning: No entries found!"); return; }

      const pageSubject = scrapeSubject();
      const subjectInput = document.getElementById("rw-bok-subject");
      let subject = pageSubject || (subjectInput ? subjectInput.value.trim() : "");

      const densityBtns = document.querySelectorAll("#rw-bok-export-panel .density-btn.active");
      let perPage = 4;
      if (densityBtns.length > 0) {
        perPage = parseInt(densityBtns[0].dataset.perpage) || 4;
      }

      const html = generateMedleyHTML(entries, subject, perPage, readPaletteIndex());
      downloadFile(html, "book-of-knowledge-medley.html", "text/html");
      if (subject) {
        try { GM_setValue("lastSubject", subject); } catch(e) {}
      }
    } catch(err) {
      console.error("[BOK Exporter] downloadMedley error:", err);
      showStatus("Error: Error: " + err.message);
    }
  }

  // -- Export Formats --------------------------
  function formatPlainText(entries) {
    return entries.map((e, i) => {
      const art = e.article ? ` [${e.article}]` : "";
      return `${i + 1}. ${e.name}${art}\n   "${e.comment}"`;
    }).join("\n\n");
  }

  function formatCSV(entries) {
    const header = "Name,Article,Comment";
    const rows = entries.map(
      (e) => `"${e.name.replace(/"/g, '""')}","${(e.article || "").replace(/"/g, '""')}","${e.comment.replace(/"/g, '""')}"`
    );
    return [header, ...rows].join("\n");
  }

  function formatJSON(entries) {
    return JSON.stringify(entries, null, 2);
  }

  function formatAICollage(entries) {
    // Gather article info
    const articles = [...new Set(entries.map((e) => e.article).filter(Boolean))];
    const articleList = articles.length > 0
      ? articles.map((a) => `  - "${a}"`).join("\n")
      : "  (articles not specified - use a single accent color)";

    const lines = [];
    lines.push("STUDENT BOOK OF KNOWLEDGE - A4 PRINT MEDLEY");
    lines.push("=".repeat(50));
    lines.push("");
    lines.push("Warning: CRITICAL: Every student quote below MUST be reproduced VERBATIM -");
    lines.push("   exactly as the student wrote it. Do NOT correct spelling, grammar, punctuation,");
    lines.push("   capitalization, or wording. The authenticity of student work is non-negotiable.");
    lines.push("");
    lines.push("LAYOUT REQUIREMENTS:");
    lines.push("  - Designed for A4 paper (210 x 297 mm), portrait orientation.");
    lines.push("  - Page 1 is a TITLE PAGE with a decorative heading, the week's subject,");
    lines.push("    subtitle \"Student Reflections\", the date, and a count line:");
    lines.push(`    \"${[...new Set(entries.map(e => e.name))].length} voices * ${entries.length} ideas\".`);
    lines.push("  - Each subsequent page is ONE student quote card filling a full A4 sheet -");
    lines.push("    large student name at top, their verbatim quote in a speech-bubble or");
    lines.push("    framed block, and the article title below the name as \"from 'Article Name'\".");
    lines.push("  - Font sizing adapts to quote length: short reflections (<= 60 chars) use");
    lines.push("    a larger font (x1.25); very long reflections (> 700 chars) scale down");
    lines.push("    (x0.72) to fit the card. Visual variety is intentional - it reflects the");
    lines.push("    diversity of student expression.");
    lines.push("  - No student should appear more than once per page. Each page = one student.");
    lines.push("  - Print at A4 size, then pin the title sheet in the center of a classroom");
    lines.push("    bulletin board with the individual quote cards arranged around it.");
    lines.push("");
    lines.push("ARTICLE COLORS (use a different accent color per article):");
    lines.push(articleList);
    lines.push("  Color palette: terracotta, sage green, muted plum, warm amber, slate blue,");
    lines.push("  cocoa brown, olive, dusty rose, pine green, warm brown. Assign one color");
    lines.push("  per article and use that color for the card border + name on all cards for that article.");
    lines.push("");
    lines.push("STUDENT REFLECTIONS (verbatim - no corrections):");
    lines.push("-".repeat(50));
    entries.forEach((e, i) => {
      const art = e.article ? ` - from "${e.article}"` : "";
      lines.push("");
      lines.push(`CARD ${i + 1}: ${e.name}${art}`);
      lines.push(`  Quote: "${e.comment}"`);
    });
    lines.push("");
    lines.push("-".repeat(50));
    lines.push("END OF STUDENT REFLECTIONS");
    return lines.join("\n");
  }

  function formatAIPrompt(entries) {
    const articles = [...new Set(entries.map((e) => e.article).filter(Boolean))];
    const articleList = articles.length > 0
      ? articles.map((a, i) => `  ${i + 1}. "${a}"`).join("\n")
      : "";

    const studentList = entries.map((e, i) => {
      const art = e.article ? ` (article: "${e.article}")` : "";
      return `  ${i + 1}. ${e.name}${art}: "${e.comment}"`;
    }).join("\n");

    return `Create a set of A4-sized printable pages for a 5th grade classroom "Book of Knowledge" bulletin board display. The set consists of:

PAGE 1 - TITLE SHEET:
  - Large heading: the week's subject
  - Subtitle: "Our Class Book of Knowledge - Student Reflections"
  - Today's date
  - Count line: "${[...new Set(entries.map(e => e.name))].length} voices * ${entries.length} ideas"
  - List of the ${articles.length} articles read this week
  - Decorative border in warm earth tones (terracotta + sage green accents)
  - This sheet goes in the center of the bulletin board

PAGES 2-${entries.length + 1} - INDIVIDUAL QUOTE CARDS (one per A4 sheet):
  - Each page features ONE student
  - Large student name at the top
  - The article they wrote about shown as "from '[Article Name]'"
  - Their verbatim reflection in a decorative speech-bubble or framed block
  - Font size adapts to quote length: short quotes use larger type (x1.25),
    very long quotes scale down (x0.72) to fit - visual variety is intentional
  - Ink-efficient design: mostly black text on white/cream, with one accent color
    per article used sparingly for borders and the student name

COLOR CODING BY ARTICLE (each article gets a different accent color):
${articleList}
  Colors: terracotta, sage green, muted plum, warm amber, slate blue, cocoa,
  olive, dusty rose, pine green, warm brown. Use the assigned color for the
  card border and student name on every card from that article.

VERBATIM RULE: Every student quote MUST appear exactly as written below.
Do NOT correct spelling, grammar, punctuation, or wording. Preserve all
original typos and phrasings - these are authentic 5th grade responses.

AESTHETIC: Warm classroom feel, elementary-school-friendly, hand-drawn
organic shapes, gentle decorative elements (stars, dots, small ornaments).
No faces or clip-art people. Clean and readable - students should be able
to read each other's quotes from a short distance.

The ${entries.length} student reflections are:

${studentList}

Style: hand-drawn, warm classroom aesthetic, A4 portrait, bulletin board ready.`;
  }

  // -- Copy / Download helpers -----------------
  function copyText(text, label) {
    if (typeof GM_setClipboard !== "undefined") {
      GM_setClipboard(text, "text");
    } else {
      navigator.clipboard.writeText(text).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed"; ta.style.left = "-9999px";
        document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
      });
    }
    showStatus(`OK: Copied ${label}!`);
  }

  function downloadFile(text, filename, mimeType = "text/plain") {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatus(`Download: Downloaded ${filename}`);
  }

  // -- Status ----------------------------------
  let statusTimeout;
  function showStatus(msg) {
    const el = document.getElementById("rw-bok-status");
    if (!el) return;
    el.textContent = msg; el.classList.add("show");
    clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => el.classList.remove("show"), 4000);
  }

  // -- Build Panel -----------------------------
  function buildPanel() {
    const existing = document.getElementById("rw-bok-export-panel");
    if (existing) existing.remove();

    const entries = extractEntries();
    let savedSubject = "";
    try { savedSubject = GM_getValue("lastSubject", ""); } catch(e) {}
    const scrapedSubject = scrapeSubject();
    const defaultSubject = scrapedSubject || savedSubject || "";
    let savedDensity = 4;
    try { savedDensity = parseInt(GM_getValue("density", "4")) || 4; } catch(e) {}
    const densities = [1, 2, 4, 6, 8, 10];

    const uniqueArticles = [...new Set(entries.map((e) => e.article).filter(Boolean))];
    log(`Building panel - ${entries.length} entries, ${uniqueArticles.length} articles, subject: "${defaultSubject}"`);

    const panel = document.createElement("div");
    panel.id = "rw-bok-export-panel";

    const header = document.createElement("h3");
    header.innerHTML = `
      <span class="toggle-icon">v</span>
      BOK Exporter
      <span class="count-badge">${entries.length}</span>
    `;

    const body = document.createElement("div");
    body.className = "rw-bok-body";

    // -- Section: Print Medley ------------------
    const medleyLabel = document.createElement("div");
    medleyLabel.className = "rw-section-label";
    medleyLabel.textContent = "Print: Print Medley (A4)";
    body.appendChild(medleyLabel);

    // Subject input
    const subjectRow = document.createElement("div");
    subjectRow.className = "rw-subject-row";
    const subjectInput = document.createElement("input");
    subjectInput.id = "rw-bok-subject";
    subjectInput.type = "text";
    subjectInput.placeholder = "Week's subject (e.g., Morocco)";
    subjectInput.value = defaultSubject;
    subjectInput.addEventListener("input", () => {
      try { GM_setValue("lastSubject", subjectInput.value.trim()); } catch(e) {}
    });
    subjectRow.appendChild(subjectInput);
    body.appendChild(subjectRow);

    // Density picker
    const densityRow = document.createElement("div");
    densityRow.className = "rw-density-row";
    const densityLabel = document.createElement("span");
    densityLabel.textContent = "Per page:";
    densityRow.appendChild(densityLabel);

    densities.forEach((d) => {
      const btn = document.createElement("button");
      btn.className = "density-btn" + (d === savedDensity ? " active" : "");
      btn.textContent = d;
      btn.dataset.perpage = String(d);
      btn.addEventListener("click", () => {
        densityRow.querySelectorAll(".density-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        try { GM_setValue("density", String(d)); } catch(e) {}
      });
      densityRow.appendChild(btn);
    });
    body.appendChild(densityRow);

    // Palette picker
    const paletteRow = document.createElement("div");
    paletteRow.className = "rw-palette-row";
    const paletteLabel = document.createElement("span");
    paletteLabel.textContent = "Palette:";
    paletteRow.appendChild(paletteLabel);

    let savedPalette = 0;
    try { savedPalette = parseInt(GM_getValue("palette", "0")) || 0; } catch(e) {}

    ARTICLE_PALETTES.forEach((pal, idx) => {
      const btn = document.createElement("button");
      btn.className = "palette-btn" + (idx === savedPalette ? " active" : "");
      btn.dataset.palette = String(idx);
      // Color swatch dots
      const dots = document.createElement("div");
      dots.className = "swatch-dots";
      pal.colors.slice(0, 4).forEach((c) => {
        const dot = document.createElement("span");
        dot.className = "swatch-dot";
        dot.style.background = c.border;
        dots.appendChild(dot);
      });
      btn.appendChild(dots);
      btn.appendChild(document.createTextNode(pal.name));
      btn.addEventListener("click", () => {
        paletteRow.querySelectorAll(".palette-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        try { GM_setValue("palette", String(idx)); } catch(e) {}
      });
      paletteRow.appendChild(btn);
    });
    body.appendChild(paletteRow);

    // Medley buttons
    const medleyBtn = document.createElement("button");
    medleyBtn.className = "medley-btn";
    medleyBtn.textContent = "Open: Open Print Medley (new tab)";
    medleyBtn.addEventListener("click", openMedley);
    body.appendChild(medleyBtn);

    const medleyDlBtn = document.createElement("button");
    medleyDlBtn.textContent = "Download: Download Medley HTML";
    medleyDlBtn.addEventListener("click", downloadMedley);
    body.appendChild(medleyDlBtn);

    // -- Section: Utilities ---------------------
    const utilLabel = document.createElement("div");
    utilLabel.className = "rw-section-label";
    utilLabel.textContent = "Tools: Utilities";
    body.appendChild(utilLabel);

    const utilButtons = [
      { label: "Refresh: Refresh Count",       cls: "",      action: () => { panel.remove(); setTimeout(buildPanel, 300); } },
      { label: "Debug: Dump Page Structure", cls: "debug-btn", action: () => { debugPageStructure(); showStatus("Debug: Check console (F12)!"); } },
    ];

    utilButtons.forEach((btn) => {
      const button = document.createElement("button");
      button.textContent = btn.label;
      if (btn.cls) button.className = btn.cls;
      button.addEventListener("click", btn.action);
      body.appendChild(button);
    });

    const status = document.createElement("div");
    status.className = "status-msg";
    status.id = "rw-bok-status";
    body.appendChild(status);

    panel.appendChild(header);
    panel.appendChild(body);

    function setPanelMinimized(isMinimized) {
      if (isMinimized) {
        panel.classList.add("minimized");
        body.style.display = "none";
      } else {
        panel.classList.remove("minimized");
        body.style.display = "";
      }
    }

    let minimized = true;
    try {
      minimized = GM_getValue("panelMinimized", "true") !== "false";
    } catch(e) { }

    setPanelMinimized(minimized);

    header.addEventListener("click", function () {
      minimized = !minimized;
      setPanelMinimized(minimized);

      try {
        GM_setValue("panelMinimized", minimized ? "true" : "false");
      } catch(e) { }
    });

    document.body.appendChild(panel);
    log("Panel added to DOM");

    if (entries.length === 0) {
      showStatus("Warning: No entries found - press Ctrl+Shift+D to debug");
    }
  }

  function getFreshEntries() {
    return extractEntries();
  }

  // -- Page guard: only show on BOK tab -------
  function isBOKPage() {
    return /assignmentTab:cbok/i.test(window.location.hash);
  }

  function removePanel() {
    const existing = document.getElementById("rw-bok-export-panel");
    if (existing) existing.remove();
  }

  // -- Init ------------------------------------
  function init() {
    log("init() - URL:", window.location.href);
    if (isBOKPage()) {
      buildPanel();

      [2000, 4000, 8000].forEach((ms) => {
        setTimeout(() => {
          if (!isBOKPage()) return;
          const existing = document.getElementById("rw-bok-export-panel");
          if (existing) {
            const fresh = extractEntries();
            const badge = existing.querySelector(".count-badge");
            if (badge) badge.textContent = fresh.length;
            const subjInput = document.getElementById("rw-bok-subject");
            if (subjInput && !subjInput.value.trim()) {
              const scraped = scrapeSubject();
              if (scraped) subjInput.value = scraped;
            }
            log(`Delayed re-scan (${ms}ms): ${fresh.length} entries`);
          } else if (isBOKPage()) {
            buildPanel();
          }
        }, ms);
      });
    }
  }

  // -- SPA navigation: show/hide on hash change -
  window.addEventListener("hashchange", () => {
    log("hashchange - isBOK:", isBOKPage());
    if (isBOKPage()) {
      if (!document.getElementById("rw-bok-export-panel")) {
        buildPanel();
      }
    } else {
      removePanel();
    }
  });

  // -- Keyboard shortcuts ----------------------
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === "D") {
      e.preventDefault(); debugPageStructure(); showStatus("Debug: Check console (F12)!");
    }
    if (e.ctrlKey && e.shiftKey && e.key === "E") {
      e.preventDefault(); buildPanel(); showStatus("Refresh: Panel rebuilt!");
    }
  });

  // -- Start -----------------------------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("load", () => {
    setTimeout(() => {
      if (isBOKPage() && !document.getElementById("rw-bok-export-panel")) {
        buildPanel();
      }
    }, 3000);
  });

  window.BOKExport = {
    extract: extractEntries, build: buildPanel, debug: debugPageStructure,
    getEntries: getFreshEntries, medley: openMedley,
  };

  log("v1.6.0 loaded - A4 landscape orientation. BOKExport.medley() | Ctrl+Shift+E/D");
})();