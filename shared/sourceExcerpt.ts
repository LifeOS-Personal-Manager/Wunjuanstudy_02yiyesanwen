export interface SourceExcerptMatch {
  start: number;
  end: number;
  excerpt: string;
  normalized: boolean;
}

const IGNORED_FORMATTING = /[\s，。！？；：、】【、,.!?;:…—\-()（）\[\]{}「」『』“”‘’"']/u;
const TRAILING_PUNCTUATION = /[，。！？；：、】【、,.!?;:…—]/u;

interface ComparableText {
  text: string;
  starts: number[];
  ends: number[];
}

function toComparableText(value: string): ComparableText {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (let offset = 0; offset < value.length;) {
    const character = String.fromCodePoint(value.codePointAt(offset)!);
    const end = offset + character.length;
    for (const normalizedCharacter of character.normalize("NFKC")) {
      if (!IGNORED_FORMATTING.test(normalizedCharacter)) {
        text += normalizedCharacter;
        starts.push(offset);
        ends.push(end);
      }
    }
    offset = end;
  }
  return { text, starts, ends };
}

/** Locates a formatted manual excerpt and always returns an original-text slice. */
export function findSourceExcerpt(originalText: string, input: string): SourceExcerptMatch | null {
  const source = toComparableText(originalText);
  const candidate = toComparableText(input.trim());
  if (!candidate.text) return null;
  const comparableStart = source.text.indexOf(candidate.text);
  if (comparableStart < 0) return null;
  const comparableEnd = comparableStart + candidate.text.length - 1;
  const start = source.starts[comparableStart];
  let end = source.ends[comparableEnd];
  while (end < originalText.length) {
    const character = String.fromCodePoint(originalText.codePointAt(end)!);
    if (!TRAILING_PUNCTUATION.test(character)) break;
    end += character.length;
  }
  const excerpt = originalText.slice(start, end);
  return { start, end, excerpt, normalized: excerpt !== input };
}