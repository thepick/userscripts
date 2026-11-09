// Matching oracle copied from a993d30; do not change with the implementation.
    function escapeRegex(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function foldText(value) {
        return value.normalize('NFKC').replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '').toLowerCase();
    }

    const phraseSeparators = new RegExp('[\\s\\p{Pd}_]+', 'gu');

    function phraseText(value) {
        return value.replace(phraseSeparators, ' ');
    }

    function compileRules(entries) {
        return entries.map(entry => foldText(entry).trim()).filter(Boolean).map(entry => {
            if (/\s/.test(entry)) return { phrase: entry, normalizedPhrase: phraseText(entry) };
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
        text = foldText(text);
        const phrases = phraseText(text);
        for (const rule of rules) {
            if (rule.phrase !== undefined) {
                if (text.includes(rule.phrase) || phrases.includes(rule.normalizedPhrase)) return rule.phrase;
            } else {
                const match = rule.regex.exec(text);
                if (match) return match[2];
            }
        }
        return null;
    }


module.exports={compile:compileRules,match:matchBlock};
