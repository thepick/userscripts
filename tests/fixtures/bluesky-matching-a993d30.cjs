// Matching oracle copied from a993d30; do not change with the implementation.
const patterns = new Map();
    function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function foldText(value) { return value.normalize('NFKC').replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '').toLowerCase(); }
    const phraseSeparators = new RegExp('[\\s\\p{Pd}_]+', 'gu');
    function phraseText(value) { return value.replace(phraseSeparators, ' '); }
    function cleanText(value) { return phraseText(foldText(value)).trim(); }
    function termToRegex(term) {
        if (!term || typeof term !== 'string')
            return null;
        if (!patterns.has(term)) {
            const entry = foldText(term).trim(), variants = [entry];
            if (!entry)
                return null;
            if (/\s/.test(entry))
                patterns.set(term, new RegExp(escapeRegExp(phraseText(entry)), 'iu'));
            else {
                // shortcut: regular English plurals only; enter irregular forms separately.
                if (/^[a-z]+$/.test(entry)) {
                    if (/[^aeiou]y$/.test(entry))
                        variants.push(entry.slice(0, -1) + 'ies');
                    else if (/(s|x|z|ch|sh)$/.test(entry))
                        variants.push(entry + 'es');
                    else
                        variants.push(entry + 's');
                }
                patterns.set(term, new RegExp('(^|[^\\p{L}\\p{N}_])(' + variants.map(escapeRegExp).join('|') + ')(?=$|[^\\p{L}\\p{N}_])', 'iu'));
            }
        }
        return patterns.get(term);
    }
    function regexMatchAny(text, terms) {
        if (!text || !terms.length)
            return null;
        const folded = foldText(text), phrases = phraseText(folded);
        for (const term of terms) {
            const re = termToRegex(term);
            if (re && re.test(/\s/.test(foldText(term).trim()) ? phrases : folded))
                return term;
        }
        return null;
    }

module.exports={compile:terms=>terms,match:regexMatchAny};
