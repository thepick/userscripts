// ==UserScript==
// @name         1337x Enhancements + Ratings
// @namespace    https://greasyfork.org/en/users/567951-stuart-saddler
// @version      2026.10.23.1
// @description  Enhances 1337x with ratings, thumbnail previews, comment popups, magnet links, and a customizable settings panel.
// @author       Stuart Saddler + OpenAI patch
// @contributor  darkred, NotNeo, barn852, French Bond, sharmanhall
// @match        *://*.1337x.to/*
// @match        *://*.1337x.ws/*
// @match        *://*.1337x.eu/*
// @match        *://*.1337x.se/*
// @match        *://*.1337x.is/*
// @match        *://*.1337x.gd/*
// @match        *://*.x1337x.cc/*
// @match        *://*.1337x.st/*
// @match        *://*.x1337x.ws/*
// @match        *://*.x1337x.eu/*
// @match        *://*.x1337x.se/*
// @match        *://*.1377x.to/*
// @match        *://*.1337xx.to/*
// @match        http://l337xdarkkaqfwzntnfk5bmoaroivtl6xsbatabvlb52umg6v3ch44yd.onion/*
// @match        https://www.1337x.to/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      omdbapi.com
// @connect      api.themoviedb.org
// @connect      api.tvmaze.com
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=1337x.to
// @downloadURL https://update.greasyfork.org/scripts/546143/1337x%20Enhancements%20%2B%20Ratings.user.js
// @updateURL https://update.greasyfork.org/scripts/546143/1337x%20Enhancements%20%2B%20Ratings.meta.js
// ==/UserScript==
// Source: https://github.com/thepick/userscripts

(function() {
    'use strict';

    const DEBUG = true;

    function log(msg) {
        if (!DEBUG) return;
        const args = Array.prototype.slice.call(arguments, 1);
        try {
            console.log.apply(console, ['[1337x DEBUG] ' + msg].concat(args));
        } catch (e) {}
    }

    var config = {
        showThumbnails: GM_getValue('showThumbnails', true),
        showExtraColumn: GM_getValue('showExtraColumn', true),
        showButtonsInNameColumn: GM_getValue('showButtonsInNameColumn', false),
        fullWidthSite: GM_getValue('fullWidthSite', true),
        visibleImages: GM_getValue('visibleImages', 4),
        queueFetchDelay: GM_getValue('queueFetchDelay', 0),
        maxRetries: GM_getValue('maxRetries', 1),
        enableCommentsPopup: GM_getValue('enableCommentsPopup', true),
        enableRatings: GM_getValue('enableRatings', true),
        showRatingSource: GM_getValue('showRatingSource', false),
        omdbApiKey: GM_getValue('omdbApiKey', ''),
        tmdbApiKey: GM_getValue('tmdbApiKey', ''),
        ratingsMaxReqPer5s: GM_getValue('ratingsMaxReqPer5s', 8)
    };

    var CACHE_DURATION = 5 * 60 * 1000;
    var extraColumnAdded = false;
    var commentCache = new Map();
    var ratingByTorrentId = new Map();
    var ratingByKey = new Map();
    var pendingRatings = new Map();
    var reqTimes = [];
    var fetchQueue = [];
    var activeFetches = 0;
    var queueTimer = null;
    var lastFetchStarted = -Infinity;
    var MAX_CONCURRENT = 3;
    var inited = false;

    function saveConfig() {
        Object.keys(config).forEach(function(key) {
            GM_setValue(key, config[key]);
        });
    }

    function isCloudflareChallengeText(text) {
        if (!text) return false;
        // Normal pages also use /cdn-cgi/ for email protection and other assets.
        return /<title[^>]*>\s*(?:Just a moment|Attention Required!\s*\|\s*Cloudflare)/i.test(text) ||
            /(?:window\.)?_cf_chl_opt\s*=/.test(text) ||
            /\bid\s*=\s*["']cf-(?:browser-verification|challenge-running)["']/i.test(text);
    }

    function computeBackoffDelayMs(retryIndex) {
        var base = (typeof config.queueFetchDelay === 'number' && config.queueFetchDelay > 0) ? config.queueFetchDelay : 250;
        return base * Math.pow(2, retryIndex + 1);
    }

    function sleep(ms) {
        return new Promise(function(resolve) {
            setTimeout(resolve, ms);
        });
    }

    function fetchSameOriginText(url) {
        return fetch(url, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        }).then(function(resp) {
            return resp.text().then(function(text) {
                return { ok: resp.ok, status: resp.status, text: text };
            });
        });
    }

    function fetchSameOriginJson(url) {
        return fetch(url, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }).then(function(resp) {
            return resp.text().then(function(text) {
                return { ok: resp.ok, status: resp.status, text: text };
            });
        });
    }

    async function fetchHtmlWithCfRetry(url, attemptIndex) {
        var r = await fetchSameOriginText(url);
        var cf = isCloudflareChallengeText(r.text);
        var retryableStatus = (r.status === 403 || r.status === 429 || r.status === 503);
        if (r.ok && !cf) return r.text;
        if ((cf || retryableStatus || !r.ok) && attemptIndex < config.maxRetries) {
            var delay = computeBackoffDelayMs(attemptIndex);
            log('CF/Fetch issue for %s (status=%s cf=%s). Retrying in %sms...', url, r.status, cf, delay);
            await sleep(delay);
            return fetchHtmlWithCfRetry(url, attemptIndex + 1);
        }
        // Retries exhausted — throw so callers can handle failure cleanly
        if (cf) throw new Error('CF_CHALLENGE');
        return r.text || '';
    }

    async function fetchJsonWithCfRetry(url, attemptIndex) {
        var r = await fetchSameOriginJson(url);
        var cf = isCloudflareChallengeText(r.text);
        var retryableStatus = (r.status === 403 || r.status === 429 || r.status === 503);
        if (r.ok && !cf) return r.text;
        if ((cf || retryableStatus || !r.ok) && attemptIndex < config.maxRetries) {
            var delay = computeBackoffDelayMs(attemptIndex);
            log('CF/Fetch issue (JSON) for %s (status=%s cf=%s). Retrying in %sms...', url, r.status, cf, delay);
            await sleep(delay);
            return fetchJsonWithCfRetry(url, attemptIndex + 1);
        }
        return r.text || '';
    }

    async function ratingRateLimit() {
        while (true) {
            var now = Date.now();
            while (reqTimes.length && now - reqTimes[0] >= 5000) reqTimes.shift();
            if (reqTimes.length < Math.max(1, parseInt(config.ratingsMaxReqPer5s, 10) || 8)) {
                reqTimes.push(now);
                return;
            }
            await sleep(Math.max(1, 5000 - (now - reqTimes[0]) + 25));
        }
    }

    function gmFetchJson(url, headers) {
        return new Promise(function(resolve, reject) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: headers || { 'Accept': 'application/json' },
                timeout: 15000,
                onload: function(r) {
                    if (r.status >= 200 && r.status < 300) {
                        try {
                            resolve(JSON.parse(r.responseText));
                        } catch (e) {
                            reject(new Error('JSON parse error @ ' + url));
                        }
                    } else {
                        reject(new Error('HTTP ' + r.status + ' @ ' + url));
                    }
                },
                onerror: function() { reject(new Error('GM_xmlhttpRequest network error @ ' + url)); },
                ontimeout: function() { reject(new Error('GM_xmlhttpRequest timeout @ ' + url)); }
            });
        });
    }

    var TV_TAG = /\bS\d{1,2}E\d{1,2}(?:[-E]\d{1,2})?\b/i;
    var TV_SEASON_PACK = /\bS\d{1,2}\b(?!E\d)/i;
    var TV_DATE = /\b(19|20)\d{2}[ ._-](0[1-9]|1[0-2])[ ._-](0[1-9]|[12]\d|3[01])\b/;
    var VIDEO_MARK = /\b(?:2160|1080|720|480)p\b|\.mkv\b|\.mp4\b|\b(?:XviD|DivX)\b/i;
    var RELEASE_MARK = /\b(?:WEB(?:-?DL|-?Rip)?|Blu(?:-?Ray)?|HDTV|DVDRip|BRRip|BDRip|REMUX|WEB[-.\ s]?HD|WEBDL|WEBRip|iT|AMZN|NF|MAX|ATV|MA|IMAX|HDR10\+?|DV)\b|\b(?:x264|x265|H\.?26[45]|HEVC|AV1)\b|\b(?:DDP? ?(?:5\.1|7\.1)|AC-?3|AAC|Opus|TrueHD|DTS(?:-HD)?(?: ?MA)?|Atmos)\b/i;
    var NEGATIVE = /\b(FLAC|MP3|APE|OGG|WAV|Vinyl|Album|Soundtrack|Deluxe\sEdition|24-96|24bit|16Bit|44\.1kHz|320kbps|EPUB|MOBI|PDF|CBR|CBZ|Magazine|Cookbook|Guide|Manual|Workbook|WSJ|Wall\sStreet\sJournal|Week\+|Comics?|APK|Android|x64|x86|Portable|Pre-Activated|Keygen|Crack(?:ed)?|Patch|Setup|Installer|Plug-?in|VST|Adobe|Topaz|MAGIX|VEGAS|Office|Windows|Premiere|After\sEffects|FitGirl|DLCs?|MULTi\d{1,2}|GOG|Steam|Codex|ElAmigos|Razor1911|Reloaded|Campaign|Zombies|Multiplayer)\b/i;

    function isMovieOrTV(title) {
        if (NEGATIVE.test(title)) return false;
        if (TV_TAG.test(title) || TV_SEASON_PACK.test(title) || TV_DATE.test(title)) return true;
        return VIDEO_MARK.test(title) && (RELEASE_MARK.test(title) || /\b(?:19|20)\d{2}\b/.test(title));
    }

    function slugify(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/&/g, ' and ')
            .replace(/[\.\_\-]+/g, ' ')
            .replace(/[^a-z0-9 ]/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    // FIX: Extract year from the raw title. Needed by callers that already have
    // a cleaned title and just need the year for filtering (e.g. OMDb search).
    // Note: extractTitleAndYear() uses the last year found, which is correct.
    function extractYear(t) {
        var matches = String(t || '').match(/\b(19|20)\d{2}\b/g);
        if (!matches || !matches.length) return '';
        return matches[matches.length - 1];
    }

    // Clean a raw title string into human-readable form.
    function cleanTitle(raw) {
        if (!raw) return '';
        var s = String(raw);
        s = s.replace(/[._]+/g, ' ');
        s = s.replace(/\s+-\s+/g, ' ');
        s = s.replace(/[\[\]\(\)]/g, ' ');
        s = s.trim();
        s = s.replace(/^[-]+|[-]+$/g, '');
        s = s.trim();
        s = s.replace(/\s{2,}/g, ' ');
        s = s.trim();
        return s;
    }

    // FIX (spec): Last-year extraction.
    // The release year always marks the end of the actual title. Use the LAST
    // year found so that year-like numbers in the title (Blade Runner 2049,
    // 1917, 2001 A Space Odyssey) are preserved as part of the title.
    function extractTitleAndYear(filename) {
        var s = String(filename || '');

        // Remove file extension
        s = s.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm)$/i, '');

        // --- TV detection: look for S##E## or S## season pack tags ---
        var tvMatch = s.match(/\b(S\d{1,2}E\d{1,2}(?:[-E]\d{1,2})?|S\d{1,2})\b/i);

        if (tvMatch) {
            // Everything before the S##E## tag is the title
            var rawTvTitle = s.substring(0, tvMatch.index);

            // Still try to find a year in the full string (some TV releases include it)
            var yearMatches = s.match(/\b((?:19|20)\d{2})\b/g);
            var year = yearMatches ? yearMatches[yearMatches.length - 1] : '';

            var season = tvMatch[1].match(/S(\d{1,2})/i);
            var seasonNum = season ? parseInt(season[1], 10) : null;

            return {
                title: cleanTitle(rawTvTitle),
                year: year,
                isTv: true,
                season: seasonNum,
                episodeTag: tvMatch[1].toUpperCase()
            };
        }

        // --- Movie detection: use last year as the dividing line ---
        var yearPattern = /\b((19|20)\d{2})\b/g;
        var allMatches = [];
        var m;

        while ((m = yearPattern.exec(s)) !== null) {
            allMatches.push({ value: m[1], index: m.index });
        }

        if (allMatches.length === 0) {
            return {
                title: cleanTitle(s),
                year: '',
                isTv: false,
                season: null,
                episodeTag: null
            };
        }

        var chosen = allMatches[allMatches.length - 1];
        var rawTitle = s.substring(0, chosen.index);

        return {
            title: cleanTitle(rawTitle),
            year: chosen.value,
            isTv: false,
            season: null,
            episodeTag: null
        };
    }

    function buildCacheKey(source, key) {
        return source + ':' + String(key || '').toLowerCase();
    }

    function formatRating(value) {
        var n = parseFloat(value);
        if (isNaN(n) || n <= 0) return null;
        return n.toFixed(1) + '/10';
    }

    async function omdbByTitle(title, year) {
        if (!config.omdbApiKey) throw new Error('OMDb key missing');
        var url = 'https://www.omdbapi.com/?t=' + encodeURIComponent(title) +
            (year ? '&y=' + encodeURIComponent(year) : '') +
            '&apikey=' + encodeURIComponent(config.omdbApiKey);
        await ratingRateLimit();
        return gmFetchJson(url);
    }

    async function tmdbFindByImdbId(imdbID) {
        if (!config.tmdbApiKey) throw new Error('TMDb key missing');
        var url = 'https://api.themoviedb.org/3/find/' + encodeURIComponent(imdbID) +
            '?api_key=' + encodeURIComponent(config.tmdbApiKey) +
            '&external_source=imdb_id';
        await ratingRateLimit();
        return gmFetchJson(url);
    }

    async function tmdbSearchMulti(title, year) {
        if (!config.tmdbApiKey) throw new Error('TMDb key missing');
        var url = 'https://api.themoviedb.org/3/search/multi?api_key=' +
            encodeURIComponent(config.tmdbApiKey) +
            '&query=' + encodeURIComponent(title);
        await ratingRateLimit();
        var data = await gmFetchJson(url);
        if (!data || !Array.isArray(data.results)) return null;

        var wantYear = parseInt(year, 10);
        var wantTitle = slugify(title);
        var best = null;
        var bestScore = -1;

        data.results.forEach(function(item) {
            if (!item) return;
            if (item.media_type !== 'movie' && item.media_type !== 'tv') return;
            var candidateTitle = slugify(item.title || item.name || item.original_title || item.original_name || '');
            if (!candidateTitle) return;

            var score = 0;
            if (candidateTitle === wantTitle) score += 5;
            else if (candidateTitle.indexOf(wantTitle) !== -1 || wantTitle.indexOf(candidateTitle) !== -1) score += 3;

            var dateStr = item.release_date || item.first_air_date || '';
            var itemYear = parseInt(String(dateStr).slice(0, 4), 10);
            if (!isNaN(wantYear) && !isNaN(itemYear)) {
                var diff = Math.abs(wantYear - itemYear);
                if (diff === 0) score += 4;
                else if (diff === 1) score += 2;
                else if (diff <= 2) score += 1;
                else if (diff > 10) score -= 4;
                else if (diff > 5)  score -= 2;
            }
            if (typeof item.vote_count === 'number') {
                if (item.vote_count >= 100)  score += 1;
                // vote count bonus capped — year match must win
            }

            if (score > bestScore) {
                bestScore = score;
                best = item;
            }
        });

        return best;
    }

    async function tvmazeSearch(title, year) {
        var url = 'https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(title);
        await ratingRateLimit();
        var data = await gmFetchJson(url);
        if (!Array.isArray(data) || !data.length) return null;

        var wantYear = parseInt(year, 10);
        var wantTitle = slugify(title);
        var best = null;
        var bestScore = -1;

        data.forEach(function(entry) {
            var show = entry && entry.show;
            if (!show) return;
            var candidateTitle = slugify(show.name || '');
            if (!candidateTitle) return;

            var score = 0;
            if (candidateTitle === wantTitle) score += 5;
            else if (candidateTitle.indexOf(wantTitle) !== -1 || wantTitle.indexOf(candidateTitle) !== -1) score += 3;

            var premieredYear = parseInt(String(show.premiered || '').slice(0, 4), 10);
            if (!isNaN(wantYear) && !isNaN(premieredYear)) {
                var diff = Math.abs(wantYear - premieredYear);
                if (diff === 0) score += 3;
                else if (diff === 1) score += 2;
                else if (diff <= 2) score += 1;
            }

            if (show.rating && typeof show.rating.average === 'number') score += 1;

            if (score > bestScore) {
                bestScore = score;
                best = show;
            }
        });

        return best;
    }

    async function resolveRatingFromApis(rawTitle, overrideYear) {
        var info = extractTitleAndYear(rawTitle);
        var year = overrideYear || info.year;
        var key = buildCacheKey('pending', info.title + '|' + year);
        if (pendingRatings.has(key)) return pendingRatings.get(key);
        var request = lookupRatingFromApis(info, year);
        pendingRatings.set(key, request);
        try {
            return await request;
        } finally {
            pendingRatings.delete(key);
        }
    }

    async function lookupRatingFromApis(info, year) {
        var cleanedTitle = info.title;

        if (!cleanedTitle) return null;

        log('resolveRatingFromApis: cleaned="%s" year="%s" isTv=%s season=%s', cleanedTitle, year, info.isTv, info.season);

        var omdbKey = buildCacheKey('omdb-title', cleanedTitle + '|' + year);
        var tmdbKey = buildCacheKey('tmdb-title', cleanedTitle + '|' + year);
        var tvmazeKey = buildCacheKey('tvmaze-title', cleanedTitle + '|' + year);

        if (ratingByKey.has(omdbKey)) {
            var omdbCached = ratingByKey.get(omdbKey);
            if (omdbCached === null) {
                // Fall through to try TMDb, but don't re-query OMDb
            } else {
                return omdbCached;
            }
        }
        if (ratingByKey.has(tmdbKey)) {
            var tmdbCached = ratingByKey.get(tmdbKey);
            if (tmdbCached === null) {
                // Fall through to try TVmaze
            } else {
                return tmdbCached;
            }
        }
        if (config.omdbApiKey && !ratingByKey.has(omdbKey)) {
            try {
                log('resolveRatingFromApis: trying OMDb for "%s" (year=%s)', cleanedTitle, year);
                var omdb = await omdbByTitle(cleanedTitle, year);
                if (omdb && omdb.Response === 'True') {
                    var rating = formatRating(omdb.imdbRating);
                    if (rating) {
                        var omdbResult = {
                            source: 'OMDb',
                            rating: rating,
                            value: parseFloat(omdb.imdbRating),
                            imdbID: omdb.imdbID || null
                        };
                        ratingByKey.set(omdbKey, omdbResult);
                        return omdbResult;
                    }
                    // Cache null so we never retry a "N/A" movie
                    ratingByKey.set(omdbKey, null);

                    if (omdb.imdbID && config.tmdbApiKey) {
                        try {
                            log('resolveRatingFromApis: OMDb imdbID=%s, trying TMDb find', omdb.imdbID);
                            var tmdbFind = await tmdbFindByImdbId(omdb.imdbID);
                            var candidates = [].concat(tmdbFind.movie_results || []).concat(tmdbFind.tv_results || []);
                            if (candidates.length) {
                                var first = candidates[0];
                                var tmdbFromIdRating = formatRating(first.vote_average);
                                if (tmdbFromIdRating) {
                                    var tmdbByIdResult = {
                                        source: 'TMDb',
                                        rating: tmdbFromIdRating,
                                        value: parseFloat(first.vote_average)
                                    };
                                    ratingByKey.set(tmdbKey, tmdbByIdResult);
                                    return tmdbByIdResult;
                                }
                            }
                        } catch (e) {
                            // Keep the IMDb-ID fallback retryable after a temporary failure.
                            ratingByKey.delete(omdbKey);
                            log('resolveRatingFromApis: TMDb find failed: %s', e && e.message ? e.message : e);
                        }
                    }
                } else if (omdb && omdb.Response === 'False' && omdb.Error === 'Movie not found!') {
                    ratingByKey.set(omdbKey, null);
                }
            } catch (e) {
                log('resolveRatingFromApis: OMDb failed: %s', e && e.message ? e.message : e);
            }
        }

        if (config.tmdbApiKey && !ratingByKey.has(tmdbKey)) {
            try {
                log('resolveRatingFromApis: trying TMDb search for "%s"', cleanedTitle);
                var tmdb = await tmdbSearchMulti(cleanedTitle, year);
                if (tmdb) {
                    var tmdbRating = formatRating(tmdb.vote_average);
                    if (tmdbRating) {
                        var tmdbResult = {
                            source: 'TMDb',
                            rating: tmdbRating,
                            value: parseFloat(tmdb.vote_average)
                        };
                        ratingByKey.set(tmdbKey, tmdbResult);
                        return tmdbResult;
                    }
                    // Movie found in TMDb but has no votes yet
                    var noRatingResult = {
                        source: 'TMDb',
                        rating: 'No Rating',
                        value: 0
                    };
                    ratingByKey.set(tmdbKey, noRatingResult);
                    return noRatingResult;
                }
                ratingByKey.set(tmdbKey, null);
            } catch (e2) {
                log('resolveRatingFromApis: TMDb failed: %s', e2 && e2.message ? e2.message : e2);
            }
        }

        if (ratingByKey.has(tvmazeKey)) return ratingByKey.get(tvmazeKey);
        try {
            log('resolveRatingFromApis: trying TVmaze for "%s"', cleanedTitle);
            var show = await tvmazeSearch(cleanedTitle, year);
            if (show && show.rating && typeof show.rating.average === 'number') {
                var tvmazeResult = {
                    source: 'TVmaze',
                    rating: formatRating(show.rating.average),
                    value: parseFloat(show.rating.average)
                };
                ratingByKey.set(tvmazeKey, tvmazeResult);
                return tvmazeResult;
            }
            ratingByKey.set(tvmazeKey, null);
        } catch (e3) {
            log('resolveRatingFromApis: TVmaze failed: %s', e3 && e3.message ? e3.message : e3);
        }

        return null;
    }

    function getTorrentIdFromHref(href) {
        var m = String(href || '').match(/\/torrent\/(\d+)\//);
        return m ? m[1] : null;
    }

    function ratingColorFromValue(value) {
        var n = parseFloat(value);
        if (n > 7) return '#23b14d';
        if (n >= 6) return '#d4aa00';
        if (n > 0 && n <= 7) return '#d14545';
        return '#888';
    }

    function getOrCreateMetaRow(linkEl) {
        if (!linkEl || !linkEl.parentNode) return null;
        var parent = linkEl.parentNode;
        var meta = parent.querySelector('.x1337-meta-row');
        if (meta) return meta;
        meta = document.createElement('div');
        meta.className = 'x1337-meta-row';
        if (linkEl.nextSibling) parent.insertBefore(meta, linkEl.nextSibling);
        else parent.appendChild(meta);
        return meta;
    }

    // FIX: Guard against detached DOM nodes
    function renderRatingAfter(linkEl, ratingObj) {
        if (!linkEl || !ratingObj) return;
        if (!linkEl.parentNode) return;
        var meta = getOrCreateMetaRow(linkEl);
        if (!meta) return;
        if (meta.querySelector('.imdb-dot')) return;

        var span = document.createElement('span');
        span.className = 'imdb-dot';
        span.title = (ratingObj.source || 'Rating') + ': ' + ratingObj.rating;
        span.innerHTML =
            '<span class="dot" style="background:' + ratingColorFromValue(ratingObj.value) + '"></span>' +
            '<span class="rating-text">' + ratingObj.rating + '</span>' +
            (config.showRatingSource ? '<span class="rating-source">(' + ratingObj.source + ')</span>' : '');

        meta.appendChild(span);
    }

    // FIX: Pass raw link text and extracted year to resolveRatingFromApis so the
    // year is never lost to cleanTitle() stripping it out.
    async function getRatingForRow(rawTitle, torrentHref) {
        if (!config.enableRatings || !isMovieOrTV(rawTitle)) return null;
        var tid = getTorrentIdFromHref(torrentHref) || '';
        var info = extractTitleAndYear(rawTitle);
        var key = tid + '|' + info.title.toLowerCase() + '|' + info.year;
        if (tid && ratingByTorrentId.has(key)) return ratingByTorrentId.get(key);
        var year = extractYear(rawTitle);
        var ratingObj = await resolveRatingFromApis(rawTitle, year);
        if (tid && ratingObj) ratingByTorrentId.set(key, ratingObj);
        return ratingObj;
    }

    async function enhanceRowRating(link, url) {
        var rawText = (link.textContent || '').trim();
        if (link.dataset.ratingTitle && link.dataset.ratingTitle !== rawText) {
            var previous = link.parentNode && link.parentNode.querySelector('.imdb-dot');
            if (previous) previous.remove();
            delete link.dataset.ratingTitle;
        }
        if (!config.enableRatings || !isMovieOrTV(rawText) || /(?:\.{3}|…)\s*$/.test(rawText) || link.dataset.ratingTitle === rawText) return;
        link.dataset.ratingTitle = rawText;
        try {
            var rating = await getRatingForRow(rawText, url);
            if (!link.isConnected || !config.enableRatings || link.dataset.ratingTitle !== rawText) return;
            if (!rating) {
                delete link.dataset.ratingTitle;
                return;
            }
            var old = link.parentNode.querySelector('.imdb-dot');
            if (old) old.remove();
            renderRatingAfter(link, rating);
        } catch (e) {
            if (link.dataset.ratingTitle === rawText) delete link.dataset.ratingTitle;
            log('Row rating failed: %s', e && e.message ? e.message : e);
        }
    }

    async function enhanceMainTitleWithRating() {
        if (!config.enableRatings || !/^\/torrent\/\d+\//.test(location.pathname)) return;
        var h1 = document.querySelector('.box-info-heading h1, .torrent-detail-page h1, h1');
        if (!h1 || h1.querySelector('.imdb-dot')) return;
        var raw = h1.textContent || document.title || '';
        var year = extractYear(raw);
        var rating = await resolveRatingFromApis(raw, year);
        if (!rating || h1.querySelector('.imdb-dot')) return;
        var span = document.createElement('span');
        span.className = 'imdb-dot';
        span.title = (rating.source || 'Rating') + ': ' + rating.rating;
        span.style.cssText = 'margin-left:8px;margin-right:8px;color:#222;font-weight:600;display:inline-flex;align-items:center;gap:5px;';
        span.innerHTML =
            '<span class="dot" style="background:' + ratingColorFromValue(rating.value) + ';width:10px;height:10px;border-radius:50%;display:inline-block"></span>' +
            '<span>' + rating.rating + '</span>' +
            (config.showRatingSource ? '<span class="rating-source">(' + rating.source + ')</span>' : '');
        h1.appendChild(span);
    }

    function showPopup(message, duration) {
        if (typeof duration !== 'number') duration = 2000;
        var el = document.createElement('div');
        el.id = 'x1337-popup';
        el.textContent = message;
        document.body.appendChild(el);
        requestAnimationFrame(function() { el.style.opacity = '1'; });
        setTimeout(function() {
            el.style.opacity = '0';
            setTimeout(function() { if (el && el.parentNode) el.parentNode.removeChild(el); }, 320);
        }, duration);
    }

    function cleanPageTitle(title) {
        if (title && title.indexOf('Download ') === 0) title = title.substring(9);
        var i = title ? title.indexOf(' Torrent |') : -1;
        if (i !== -1) title = title.substring(0, i);
        return title ? title.trim() : '';
    }

    function optimizeImageUrl(src) {
        var out = String(src || '');
        out = out.replace('https://imgtraffic.com/1s/', 'https://imgtraffic.com/1/');
        out = out.replace('https://22pixx.xyz/as/', 'https://22pixx.xyz/a/');
        out = out.replace('http://imgblaze.net/data_server_', 'https://www.imgopaleno.site/data_server_');
        out = out.replace('/small/small_', '/big/');
        out = out.replace(/\.th\.jpg$/i, '.jpg');
        return out;
    }

    function removeEnlargedImg() {
        var wrap = document.getElementById('x1337-enlarged-wrap');
        if (wrap) wrap.remove();
    }

    function updateEnlargedImgPosition(e) {
        var wrap = document.getElementById('x1337-enlarged-wrap');
        if (!wrap) return;
        var rect = wrap.getBoundingClientRect();
        var iw = Math.ceil(rect.width);
        var ih = Math.ceil(rect.height);
        var left = e.clientX + 20;
        var top = e.clientY + 20;
        if (left + iw > window.innerWidth) left = e.clientX - iw - 20;
        if (top + ih > window.innerHeight) top = e.clientY - ih - 20;
        wrap.style.left = left + 'px';
        wrap.style.top = top + 'px';
    }

    function showEnlargedImg(imgSrc, event) {
        removeEnlargedImg();
        var wrap = document.createElement('div');
        wrap.id = 'x1337-enlarged-wrap';
        var img = new Image();
        img.onload = function() {
            wrap.appendChild(img);
            document.body.appendChild(wrap);
            requestAnimationFrame(function() { updateEnlargedImgPosition(event); });
        };
        img.src = imgSrc;
    }

    function appendImages(link, doc) {
        if (!config.showThumbnails) return;
        if (!link || !link.parentNode || link.parentNode.querySelector('.thumbnail-container')) return;
        var imgs = doc.querySelectorAll('#description img');
        log('Found %s images for %s', imgs.length, link.href);
        if (!imgs.length) return;

        var flex = document.createElement('div');
        flex.className = 'thumbnail-container';
        flex.style.display = 'flex';
        flex.style.flexWrap = 'wrap';
        flex.style.gap = '10px';
        flex.style.marginTop = '10px';

        var clones = [];
        var expanded = false;
        var btn = document.createElement('button');
        btn.textContent = 'Show More';
        function updateImages() {
            clones.forEach(function(img, i) {
                img.style.display = expanded || i < config.visibleImages ? 'block' : 'none';
            });
            btn.style.display = clones.length > config.visibleImages && clones.some(function(img) {
                return img.naturalWidth > 0;
            }) ? 'block' : 'none';
            if (!clones.length) flex.remove();
        }
        Array.prototype.forEach.call(imgs, function(img) {
            var src;
            try {
                src = img.getAttribute('data-original') || img.getAttribute('src');
                if (!src) return;
                src = new URL(src, link.href);
                if (!/^https?:$/.test(src.protocol)) return;
                src = src.href;
            } catch (e) { return; }
            var c = document.createElement('img');
            c.alt = img.getAttribute('alt') || 'Torrent preview';
            c.loading = 'lazy';
            c.style.maxHeight = '100px';
            c.style.margin = '0';
            c.onload = updateImages;
            c.onerror = function() {
                if (c.src !== src) {
                    c.src = src;
                    return;
                }
                c.onerror = null;
                clones.splice(clones.indexOf(c), 1);
                c.remove();
                updateImages();
            };
            flex.appendChild(c);
            clones.push(c);
            c.src = optimizeImageUrl(src);
            c.addEventListener('mouseover', function(e) { showEnlargedImg(c.src, e); });
            c.addEventListener('mousemove', updateEnlargedImgPosition);
            c.addEventListener('mouseout', removeEnlargedImg);
        });

        if (!clones.length) return;
        btn.onclick = function() {
            expanded = !expanded;
            btn.textContent = expanded ? 'Show Less' : 'Show More';
            updateImages();
        };
        flex.appendChild(btn);
        updateImages();

        var meta = getOrCreateMetaRow(link);
        if (meta && meta.nextSibling) link.parentNode.insertBefore(flex, meta.nextSibling);
        else link.parentNode.appendChild(flex);
    }

    function addDownloadButtons(link, torrentLink, magnetLink) {
        if (!config.showButtonsInNameColumn) return;
        if (!link) return;
        var meta = getOrCreateMetaRow(link);
        if (!meta || meta.querySelector('.buttons-container')) return;

        var container = document.createElement('div');
        container.className = 'buttons-container';
        if (magnetLink) {
            var magnetBtn = document.createElement('a');
            magnetBtn.href = magnetLink.href;
            magnetBtn.className = 'list-button-magnet';
            magnetBtn.title = 'Magnet link';
            magnetBtn.innerHTML = '<i class="flaticon-magnet"></i>';
            container.appendChild(magnetBtn);
        }
        if (torrentLink) {
            var torrentBtn = document.createElement('a');
            torrentBtn.href = torrentLink.href;
            torrentBtn.className = 'list-button-dl';
            torrentBtn.title = 'Torrent download';
            torrentBtn.innerHTML = '<i class="flaticon-torrent-download"></i>';
            container.appendChild(torrentBtn);
        }
        meta.insertBefore(container, meta.querySelector('.imdb-dot'));
    }

    function getCachedComments(tid) {
        var c = commentCache.get(tid);
        return c && (Date.now() - c.ts < CACHE_DURATION) ? c.data : null;
    }

    function cacheComments(tid, data) {
        commentCache.set(tid, { ts: Date.now(), data: data });
    }

    function showCommentsPopup(commentsHTML, torrentTitle) {
        var old = document.getElementById('comments-modal-overlay');
        if (old) old.remove();

        var overlay = document.createElement('div');
        overlay.id = 'comments-modal-overlay';

        var container = document.createElement('div');
        container.id = 'comments-modal-container';

        var close = document.createElement('span');
        close.id = 'comments-modal-close';
        close.innerHTML = '&times;';

        var title = document.createElement('h2');
        title.textContent = 'Comments for: ' + torrentTitle;

        var content = document.createElement('div');
        content.id = 'comments-modal-content';
        content.innerHTML = commentsHTML || '<i>No user comments found.</i>';

        container.appendChild(close);
        container.appendChild(title);
        container.appendChild(content);
        overlay.appendChild(container);
        document.body.appendChild(overlay);

        close.onclick = function() { overlay.remove(); };
        overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    }

    function displayComments(arr, fallbackTitle) {
        if (!Array.isArray(arr) || !arr.length) {
            showCommentsPopup('<i>No user comments found.</i>', fallbackTitle);
            return;
        }
        var html = arr.map(function(c) {
            var safeComment = String(c.comment || '').replace(/\n/g, '<br>');
            return '<div class="comment-detail">' +
                '<div class="comment-info clearfix"><strong>' + c.username + '</strong> · <span>' + c.posted + '</span></div>' +
                '<div class="comment-content">' + safeComment + '</div>' +
                '</div>';
        }).join('');
        showCommentsPopup(html, fallbackTitle);
    }

    async function fetchAndPopupComments(torrentUrl, fallbackTitle) {
        var tid = getTorrentIdFromHref(torrentUrl);
        if (!tid) {
            showPopup('Could not extract torrent ID.', 1500);
            return;
        }

        var cached = getCachedComments(tid);
        if (cached) {
            displayComments(cached, fallbackTitle);
            return;
        }

        showPopup('Fetching comments...', 1000);
        var apiUrl = location.protocol + '//' + location.host + '/comments.php?torrentid=' + tid;
        var txt = '';
        try {
            txt = await fetchJsonWithCfRetry(apiUrl, 0);
        } catch (e) {
            txt = '';
        }

        if (!txt || isCloudflareChallengeText(txt)) {
            var ok = confirm('Cloudflare blocked the request.\n\nOpen comments in a new tab instead?');
            if (ok) window.open(torrentUrl + '#comments', '_blank');
            return;
        }

        try {
            var data = JSON.parse(txt);
            cacheComments(tid, data);
            displayComments(data, fallbackTitle);
        } catch (e2) {
            showPopup('Failed to parse comments.', 2000);
        }
    }

    function initCommentPopups() {
        var nodes = document.querySelectorAll('.table-list-wrap span.comments');
        Array.prototype.forEach.call(nodes, function(icon) {
            if (icon.dataset.listenerAttached) return;
            icon.dataset.listenerAttached = 'true';
            if ((parseInt(icon.textContent.trim(), 10) || 0) > 0) {
                icon.style.cursor = 'pointer';
                icon.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!config.enableCommentsPopup) return;
                    var row = icon.closest('tr');
                    if (!row) return;
                    var link = row.querySelector('a[href^="/torrent/"]');
                    if (!link) return;
                    var url = link.href.indexOf('http') === 0 ? link.href : (location.origin + link.getAttribute('href'));
                    var title = (link.textContent || '').trim() || document.title;
                    fetchAndPopupComments(url, title);
                }, false);
            }
        });
        document.body.classList.toggle('comments-popup-enabled', config.enableCommentsPopup);
    }

    function addClickListeners(links, type) {
        Array.prototype.forEach.call(links, function(a) {
            a.addEventListener('click', function(e) {
                var href = this.getAttribute('href');
                if (href !== 'javascript:void(0)') return;
                e.preventDefault();
                var tLink = this.getAttribute('data-href');
                if (!tLink) {
                    showPopup('No torrent URL found');
                    return;
                }
                if (this.dataset.loading === '1') return;
                this.dataset.loading = '1';
                showPopup('Loading torrent info...');
                var self = this;
                (async function() {
                    var html = '';
                    try { html = await fetchHtmlWithCfRetry(tLink, 0); } catch (e2) { html = ''; }
                    if (!html || isCloudflareChallengeText(html)) {
                        self.dataset.loading = '0';
                        window.location.href = tLink;
                        return;
                    }
                    var doc = new DOMParser().parseFromString(html, 'text/html');
                    var magnet = doc.querySelector('a[href^="magnet:"]');
                    var torrent = doc.querySelector('.dropdown-menu > li > a');
                    var picked = (type === 'ml') ? magnet : torrent;
                    if (!picked) {
                        self.dataset.loading = '0';
                        window.location.href = tLink;
                        return;
                    }
                    var finalHref = picked.href.replace('http:', 'https:');
                    self.setAttribute('href', finalHref);
                    self.dataset.loading = '0';
                    window.location.href = finalHref;
                })().catch(function(err) {
                    self.dataset.loading = '0';
                    log('Icon click fetch error:', err);
                    showPopup('Error loading torrent page');
                });
            }, false);
        });
    }

    function appendColumn() {
        if (!config.showExtraColumn || extraColumnAdded) return;
        var tables = document.querySelectorAll('.table-list-wrap');
        var isSeries = window.location.href.indexOf('/series/') !== -1;
        var title = 'ml&nbsp;dl';

        Array.prototype.forEach.call(tables, function(wrap) {
            var cells = wrap.querySelectorAll(
                '.table-list > thead > tr:not(.blank) > th:nth-child(1), ' +
                '.table-list > tbody > tr:not(.blank) > td:nth-child(1)'
            );

            Array.prototype.forEach.call(cells, function(cell, idx) {
                if (idx === 0 && !isSeries) {
                    cell.insertAdjacentHTML('afterend', '<th class="coll-1b">' + title + '</th>');
                } else {
                    var titleLink = cell.querySelectorAll('a')[1];
                    var href = titleLink ? titleLink.href : '';
                    cell.insertAdjacentHTML('afterend',
                        '<td class="coll-1b dl-buttons">' +
                        '<div class="dl-buttons-inner">' +
                        '<a class="list-button-magnet" href="javascript:void(0)" data-href="' + href + '" title="Magnet link"><i class="flaticon-magnet"></i></a>' +
                        '<a class="list-button-dl" href="javascript:void(0)" data-href="' + href + '" title="Torrent download"><i class="flaticon-torrent-download"></i></a>' +
                        '</div>' +
                        '</td>'
                    );
                }
            });
            extraColumnAdded = true;
        });

        addClickListeners(document.querySelectorAll('.list-button-magnet'), 'ml');
        addClickListeners(document.querySelectorAll('.list-button-dl'), 'dl');
    }

    function queueFetchRequest(link, onSuccess) {
        fetchQueue.push({ link: link, onSuccess: onSuccess, retries: 0 });
        processQueue();
    }

    function processQueue() {
        if (queueTimer !== null) return;
        while (activeFetches < MAX_CONCURRENT && fetchQueue.length) {
            var delay = Math.max(0, Number(config.queueFetchDelay) || 0);
            var wait = lastFetchStarted + delay - Date.now();
            if (wait > 0) {
                queueTimer = setTimeout(function() {
                    queueTimer = null;
                    processQueue();
                }, wait);
                return;
            }
            var item = fetchQueue.shift();
            activeFetches++;
            lastFetchStarted = Date.now();
            fetchContent(item.link, item.onSuccess, item.retries);
        }
    }

    function fetchContent(link, onSuccess, retries) {
        if (typeof retries !== 'number') retries = 0;
        log('Fetching (Native+CF): %s (try %s/%s)', link, retries + 1, config.maxRetries + 1);

        (async function() {
            try {
                var html = await fetchHtmlWithCfRetry(link, retries);
            } catch (e) {
                if (e && e.message === 'CF_CHALLENGE') {
                    log('Queue skipping %s — persistent CF challenge, cannot bypass', link);
                } else {
                    log('Queue fetch error for %s: %s', link, e && e.message ? e.message : e);
                }
                activeFetches--;
                processQueue();
                return;
            }
            if (isCloudflareChallengeText(html)) {
                var nextDelay = computeBackoffDelayMs(retries);
                log('Queue got CF challenge for %s. Requeue after %sms', link, nextDelay);
                setTimeout(function() {
                    activeFetches--;
                    fetchQueue.push({ link: link, onSuccess: onSuccess, retries: retries + 1 });
                    processQueue();
                }, nextDelay);
                return;
            }

            var doc = new DOMParser().parseFromString(html, 'text/html');
            try { onSuccess(doc); } catch (e) { log('onSuccess error: %s', e && e.message ? e.message : e); }
            activeFetches--;
            processQueue();
        })().catch(function(err) {
            log('fetchContent error for %s: %s', link, err && err.message ? err.message : err);
            activeFetches--;
            processQueue();
        });
    }

    function enhanceRows() {
        var links = document.querySelectorAll('.table-list tbody tr td.name a[href^="/torrent/"]');
        Array.prototype.forEach.call(links, function(link) {
            var row = link.closest('tr');
            if (!row || row.dataset.processed === 'true') return;
            row.dataset.processed = 'true';

            var url = link.href.indexOf('http') === 0 ? link.href : (location.origin + link.getAttribute('href'));
            enhanceRowRating(link, url);

            queueFetchRequest(url, function(doc) {
                try {
                    updateLinkTitle(link, doc);
                } catch (e) {}

                try {
                    var magnetLink = doc.querySelector('a[href^="magnet:"]');
                    var torrentLink = doc.querySelector('.dropdown-menu > li > a');
                    addDownloadButtons(link, torrentLink, magnetLink);
                } catch (e3) {}

                enhanceRowRating(link, url);

                try {
                    appendImages(link, doc);
                } catch (e2) {}
            });
        });
    }

    function updateLinkTitle(link, doc) {
        var titleEl = doc.querySelector('title');
        var raw = titleEl ? titleEl.innerText : '';
        var t = cleanPageTitle(raw || '');
        if (t) link.innerText = t;
    }

    // FIX: Debounce the MutationObserver callback to prevent queue flooding
    var observerTimer = null;
    function addMutationObserver() {
        var relevant = '.table-list-wrap, .table-list, .table-list tbody tr, .table-list-wrap span.comments, h1';
        var mo = new MutationObserver(function(records) {
            var hasNewContent = records.some(function(record) {
                return Array.prototype.some.call(record.addedNodes, function(node) {
                    if (node.nodeType !== 1 || node.closest('#x1337-settings-wrapper, #x1337-popup, #x1337-enlarged-wrap, #comments-modal-overlay')) return false;
                    return node.matches(relevant) || !!node.querySelector(relevant);
                });
            });
            if (!hasNewContent) return;
            clearTimeout(observerTimer);
            observerTimer = setTimeout(function() {
                appendColumn();
                enhanceRows();
                initCommentPopups();
                enhanceMainTitleWithRating();
            }, 250);
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    function addSettingsMenu() {
        if (document.getElementById('x1337-settings-wrapper')) return;

        var settingsHTML = '' +
        '<div id="x1337-settings-wrapper">' +
        '  <div id="x1337-settings-toggle">⚙️</div>' +
        '  <div id="x1337-settings-content">' +
        '    <h3>1337x Enhancements</h3>' +
        '    <div class="x1337-option">' +
        '      <label><input type="checkbox" id="x1337-show-thumbnails"' + (config.showThumbnails ? ' checked' : '') + '> Show Thumbnails</label>' +
        '      <div class="x1337-sub-option"' + (config.showThumbnails ? '' : ' style="display:none"') + ' style="margin-left:22px;margin-top:6px">' +
        '        <label>Visible Images: <input type="number" id="x1337-visible-images" value="' + config.visibleImages + '" min="1" max="10"></label>' +
        '        <label>Queue Fetch Delay (ms): <input type="number" id="x1337-queue-fetch-delay" value="' + config.queueFetchDelay + '" min="0" max="5000"></label>' +
        '        <label>Max Fetch Retries: <input type="number" id="x1337-max-retries" value="' + config.maxRetries + '" min="0" max="10"></label>' +
        '      </div>' +
        '    </div>' +
        '    <div class="x1337-option"><label><input type="checkbox" id="x1337-show-magnet-column"' + (config.showExtraColumn ? ' checked' : '') + '> Show Magnet URL Column</label></div>' +
        '    <div class="x1337-option"><label><input type="checkbox" id="x1337-show-buttons-in-name"' + (config.showButtonsInNameColumn ? ' checked' : '') + '> Show Buttons in Name Column</label></div>' +
        '    <div class="x1337-option"><label><input type="checkbox" id="x1337-full-width-site"' + (config.fullWidthSite ? ' checked' : '') + '> Full Width Site</label></div>' +
        '    <div class="x1337-option"><label><input type="checkbox" id="x1337-enable-comments-popup"' + (config.enableCommentsPopup ? ' checked' : '') + '> Enable Comments Popup</label></div>' +
        '    <hr style="border-color:#F14E13;border-width:1px 0 0;margin:10px 0">' +
        '    <h3>Ratings</h3>' +
        '    <div class="x1337-option"><label><input type="checkbox" id="x1337-enable-ratings"' + (config.enableRatings ? ' checked' : '') + '> Show Ratings</label></div>' +
        '    <div class="x1337-option"><label><input type="checkbox" id="x1337-show-rating-source"' + (config.showRatingSource ? ' checked' : '') + '> Show rating source label</label></div>' +
        '    <div class="x1337-option"><label>OMDb API Key: <input type="text" id="x1337-omdb-key" value="' + (config.omdbApiKey || '') + '" placeholder="Optional"></label></div>' +
        '    <div class="x1337-option"><label>TMDb API Key: <input type="text" id="x1337-tmdb-key" value="' + (config.tmdbApiKey || '') + '" placeholder="Optional"></label></div>' +
        '    <div class="x1337-option"><label>Max Rating Requests / 5s: <input type="number" id="x1337-ratings-rl" value="' + config.ratingsMaxReqPer5s + '" min="3" max="25"></label></div>' +
        '    <button id="x1337-save-settings">Save Settings</button><br>' +
        '  </div>' +
        '</div>';

        document.body.insertAdjacentHTML('beforeend', settingsHTML);

        document.getElementById('x1337-settings-toggle').addEventListener('click', function() {
            var wrap = document.getElementById('x1337-settings-wrapper');
            wrap.style.right = wrap.style.right === '0px' ? '-340px' : '0px';
        });

        document.getElementById('x1337-show-thumbnails').addEventListener('change', function() {
            var sub = document.querySelector('.x1337-sub-option');
            if (sub) sub.style.display = this.checked ? 'block' : 'none';
        });

        document.getElementById('x1337-save-settings').addEventListener('click', function() {
            config.showThumbnails = document.getElementById('x1337-show-thumbnails').checked;
            config.showExtraColumn = document.getElementById('x1337-show-magnet-column').checked;
            config.showButtonsInNameColumn = document.getElementById('x1337-show-buttons-in-name').checked;
            config.fullWidthSite = document.getElementById('x1337-full-width-site').checked;
            config.visibleImages = parseInt(document.getElementById('x1337-visible-images').value || '4', 10);
            config.queueFetchDelay = parseInt(document.getElementById('x1337-queue-fetch-delay').value || '0', 10);
            config.maxRetries = parseInt(document.getElementById('x1337-max-retries').value || '1', 10);
            config.enableCommentsPopup = document.getElementById('x1337-enable-comments-popup').checked;
            config.enableRatings = document.getElementById('x1337-enable-ratings').checked;
            config.showRatingSource = document.getElementById('x1337-show-rating-source').checked;
            config.omdbApiKey = (document.getElementById('x1337-omdb-key').value || '').trim();
            config.tmdbApiKey = (document.getElementById('x1337-tmdb-key').value || '').trim();
            config.ratingsMaxReqPer5s = parseInt(document.getElementById('x1337-ratings-rl').value || '8', 10);

            saveConfig();
            applySettings();
            showPopup('Settings saved');
        });
    }

    function applySettings() {
        document.body.classList.toggle('comments-popup-enabled', config.enableCommentsPopup);
        appendColumn();
        enhanceRows();
        enhanceMainTitleWithRating();
    }

    GM_addStyle(
        '.list-button-magnet > i.flaticon-magnet { font-size:13px; color:#da3a04; }' +
        '.list-button-dl > i.flaticon-torrent-download { font-size:13px; color:#89ad19; }' +
        'table.table-list td.dl-buttons {' +
        'border-left:1px solid #f6f6f6; border-right:1px solid #c0c0c0; padding-left:2.5px; padding-right:2.5px; text-align:center !important; position:relative; display:table-cell !important; width:6%; }' +
        'table.table-list td.coll-1b { border-right:1px solid silver; }' +
        '.table-list > thead > tr > th:nth-child(2), .table-list > thead > tr > td:nth-child(2) { text-align:center; }' +
        '.x1337-meta-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:8px; margin-bottom:4px; }' +
        '.imdb-dot { display:inline-flex; align-items:center; gap:6px; vertical-align:middle; font-size:inherit !important; line-height:inherit !important; }' +
        '.imdb-dot .dot { width:10px; height:10px; border-radius:50%; display:inline-block; }' +
        '.imdb-dot .rating-text { font-size:inherit !important; color:inherit !important; font-weight:bold !important; font-family:inherit !important; font-stretch:normal !important; letter-spacing:normal !important; }' +
        '.imdb-dot .rating-source { font-size:11px; color:#666 !important; }' +
        '.buttons-container { display:inline-flex; align-items:center; gap:4px; margin-left:0; margin-right:0; }' +
        '.dl-buttons-inner { display:inline-flex; flex-direction:row; align-items:center; gap:4px; margin-right:8px; }' +
        (config.fullWidthSite ? '.container{max-width:none !important} main.container,div.container{max-width:1450px}' : '') +
        '#x1337-settings-wrapper{font-family:"Open Sans",sans-serif; background:#fff !important; color:#111 !important; border-radius:5px; box-shadow:0 0 10px rgba(0,0,0,.15); position:fixed; top:20px; right:-340px; width:340px; transition:right .3s ease; z-index:9999;}' +
        '#x1337-settings-wrapper, #x1337-settings-wrapper * { color:#111 !important; }' +
        '#x1337-settings-toggle{position:absolute; left:-32px; top:0; width:32px; height:32px; background:#F14E13 !important; color:#fff !important; border-top-left-radius:5px; border-bottom-left-radius:5px; box-shadow:-2px 0 5px rgba(0,0,0,.2); cursor:pointer; text-align:center; line-height:32px;}' +
        '#x1337-settings-content{ padding:15px; }' +
        '#x1337-settings-content h3{ color:#e15920 !important; border-bottom:1px solid #e15920 !important; padding-bottom:10px; margin-bottom:15px; }' +
        '.x1337-option{ margin-bottom:12px; }' +
        '.x1337-option label{ display:flex; align-items:center; gap:8px; cursor:pointer; }' +
        '#x1337-settings-wrapper input[type="number"],#x1337-settings-wrapper input[type="text"]{ background:#fff !important; color:#111 !important; border:1px solid #bbb !important; padding:5px; border-radius:3px; }' +
        '#x1337-settings-wrapper input::placeholder{ color:#777 !important; }' +
        '#x1337-settings-wrapper input[type="checkbox"]{ accent-color:#e15920; }' +
        '#x1337-save-settings{ background:#F14E13 !important; color:#fff !important; border:none; padding:10px 20px; border-radius:3px; cursor:pointer; box-shadow:0 0 10px rgba(241,78,19,.35); }' +
        '#x1337-save-settings:hover{ background:#ff6a3c !important; }' +
        '#x1337-popup{ position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#F14E13; color:#fff; padding:10px 20px; border-radius:5px; z-index:10000; opacity:0; transition:opacity .3s; }' +
        '#comments-modal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:10001; display:flex; align-items:center; justify-content:center; }' +
        '#comments-modal-container{ background:#232323; color:#eee; border-radius:8px; box-shadow:0 2px 24px #000b; max-width:700px; width:90%; max-height:75vh; overflow-y:auto; padding:0 0 1em; border:1px solid #666; position:relative; }' +
        '#comments-modal-close{ position:absolute; top:12px; right:30px; font-size:32px; font-weight:700; cursor:pointer; color:#aaa; }' +
        '#comments-modal-close:hover{ color:#fff !important; }' +
        '#comments-modal-container h2{ font-size:1.2em; color:#e15920; margin:1.1em 1.1em .3em; padding-bottom:.3em; border-bottom:1px solid #333; }' +
        '#comments-modal-content{ margin:0 1.1em .5em; }' +
        '#comments-modal-content .comment-detail{ background:#282828; margin:1em 0; border-radius:6px; padding:1em 1em .5em; border:1px solid #30303b; }' +
        '#x1337-enlarged-wrap{ position:fixed; z-index:10000; border:2px solid #F14E13; box-shadow:0 0 10px rgba(0,0,0,.5); background:transparent; pointer-events:none; display:inline-block; line-height:0; }' +
        '#x1337-enlarged-wrap img{ display:block; max-width:500px; max-height:500px; margin:0; }'
    );

    function init() {
        if (inited) return;
        inited = true;
        showPopup('1337x Enhancements + Ratings loaded', 2000);
        addSettingsMenu();
        applySettings();
        initCommentPopups();
        addMutationObserver();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
