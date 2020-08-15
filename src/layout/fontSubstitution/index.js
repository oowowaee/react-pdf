import { pathOr, last } from 'ramda';

import StandardFont from './standardFont';
import { getRegisteredFonts } from '../../font';

const fontCache = {};

const IGNORED_CODE_POINTS = [173];

const getFontSize = pathOr(12, ['attributes', 'fontSize']);

const getOrCreateFont = name => {
  if (fontCache[name]) return fontCache[name];

  const font = new StandardFont(name);
  fontCache[name] = font;

  return font;
};

const shouldFallbackToFont = (codePoint, font, fallback) => {
  return (
    !IGNORED_CODE_POINTS.includes(codePoint) &&
    !font.hasGlyphForCodePoint(codePoint) &&
    fallback.hasGlyphForCodePoint(codePoint)
  );
};

// Reverse the word order and reprocess - this will only work for
// single line strings
const reverseAndProcessRuns = (string, runs) => {
  const reversedString = string
    .split(' ')
    .reverse()
    .join(' ');

  return processRuns(reversedString, runs, true);
};

const processRuns = (string, runs, isReversed = false) => {
  let lastFont = null;
  let lastIndex = 0;
  let index = 0;
  let font;

  const results = [];

  const arabicFont = getRegisteredFonts()['Arabic'].sources[0].data;
  const koreanFont = getRegisteredFonts()['Korean'].sources[0].data;

  for (const run of runs) {
    const fontSize = getFontSize(run);
    const defaultFont =
      typeof run.attributes.font === 'string'
        ? getOrCreateFont(run.attributes.font)
        : run.attributes.font;

    if (string.length === 0) {
      results.push({ start: 0, end: 0, attributes: { font: defaultFont } });
      break;
    }

    for (const char of string.slice(run.start, run.end)) {
      const codePoint = char.codePointAt();

      if (isReversed) {
        font = arabicFont;
      } else {
        const fallbackToArabic = shouldFallbackToFont(
          codePoint,
          defaultFont,
          arabicFont,
        );
        const fallbackToKorean =
          !fallbackToArabic &&
          shouldFallbackToFont(codePoint, defaultFont, koreanFont);

        if (fallbackToArabic) {
          // We are assuming that if we EVER fallback to Arabic, the entire string should be in Arabic
          return reverseAndProcessRuns(string, runs);
        } else if (fallbackToKorean) {
          font = koreanFont;
        } else {
          font = defaultFont;
        }
      }

      // If the default font does not have a glyph and the fallback font does, we use it
      if (font !== lastFont) {
        if (lastFont) {
          results.push({
            start: lastIndex,
            end: index,
            attributes: {
              font: lastFont,
              scale: lastFont ? fontSize / lastFont.unitsPerEm : 0,
            },
          });
        }

        lastFont = font;
        lastIndex = index;
      }

      index += char.length;
    }
  }

  return { results, lastFont, lastIndex };
};

const fontSubstitution = () => ({ string, runs }) => {
  const { results, lastFont, lastIndex } = processRuns(string, runs);

  if (lastIndex < string.length) {
    const fontSize = getFontSize(last(runs));

    results.push({
      start: lastIndex,
      end: string.length,
      attributes: {
        font: lastFont,
        scale: lastFont ? fontSize / lastFont.unitsPerEm : 0,
      },
    });
  }

  return { string, runs: results };
};

export default fontSubstitution;
