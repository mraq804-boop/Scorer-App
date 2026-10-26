const FORM_BLOCKS: readonly (readonly [number, number])[] = [
  [0xfb50, 0xfbff],
  [0xfe70, 0xfefc],
];
const UIGHUR_ALEF_MAKSURA_FORMS: ReadonlySet<number> = new Set([0xfbe8, 0xfbe9]);
const LAM = "ل";
const ZWNJ = "‌";
const ZWJ = "‍";

const ISOLATED = 0;
const FINAL = 1;
const INITIAL = 2;
const MEDIAL = 3;
const DUAL_JOINING_FORMS = 4;

const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u{fe0f}\u{200d}\u{20e3}]/gu;
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿ]/;
const ARABIC_MARK =/(?=[؀-ۿ])\p{Mn}/gu;
const ARABIC_LETTER = /(?=\p{Script=Arabic})\p{L}/u;
const NEUTRAL = /[\s\p{P}\p{S}]/u;

type Tables = { forms: Map<string, readonly string[]>; lamAlef: Map<string, readonly string[]> };

function buildTables(): Tables {
  const forms = new Map<string, string[]>();
  const lamAlef = new Map<string, string[]>();
  for (const [first, last] of FORM_BLOCKS) {
    for (let code = first; code <= last; code += 1) {
      if (UIGHUR_ALEF_MAKSURA_FORMS.has(code)) continue;
      const form = String.fromCodePoint(code);
      const letters = Array.from(form.normalize("NFKC"));
      if (letters.length === 1 && letters[0] !== form) {
        forms.set(letters[0], [...(forms.get(letters[0]) ?? []), form]);
      } else if (letters.length === 2 && letters[0] === LAM) {
        lamAlef.set(letters[1], [...(lamAlef.get(letters[1]) ?? []), form]);
      }
    }
  }
  return { forms, lamAlef };
}

const { forms: FORMS, lamAlef: LAM_ALEF } = buildTables();

function joinsNext(char: string | undefined): boolean {
  return char === ZWJ || (char !== undefined && FORMS.get(char)?.length === DUAL_JOINING_FORMS);
}

function joinsPrevious(char: string | undefined): boolean {
  return char === ZWJ || (char !== undefined && (FORMS.get(char)?.length ?? 0) >= 2);
}

function shapeArabic(text: string): string {
  const chars = Array.from(text.normalize("NFC").replace(ARABIC_MARK, ""));
  let shaped = "";
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (char === ZWNJ || char === ZWJ) continue;
    const connected = joinsNext(chars[index - 1]) && joinsPrevious(char);
    const ligature = char === LAM ? LAM_ALEF.get(chars[index + 1] ?? "") : undefined;
    if (ligature !== undefined) {
      shaped += ligature[connected ? FINAL : ISOLATED];
      index += 1;
      continue;
    }
    const forms = FORMS.get(char);
    if (forms === undefined) {
      shaped += char;
      continue;
    }
    const next = joinsNext(char) && joinsPrevious(chars[index + 1]);
    const form = connected ? (next ? MEDIAL : FINAL) : next ? INITIAL : ISOLATED;
    shaped += forms[form] ?? forms[ISOLATED];
  }
  return shaped;
}

type Run = { rtl: boolean; chars: string[] };

function directionRuns(text: string): Run[] {
  const chars = Array.from(text);
  const strong = chars.map((char) => (NEUTRAL.test(char) ? null : ARABIC_LETTER.test(char)));
  const runs: Run[] = [];
  chars.forEach((char, index) => {
    let rtl = strong[index];
    if (rtl === null) {
      const before = strong.slice(0, index).findLast((value) => value !== null);
      const after = strong.slice(index + 1).find((value) => value !== null);
      rtl = before === true && after === true;
    }
    const last = runs.at(-1);
    if (last?.rtl === rtl) last.chars.push(char);
    else runs.push({ rtl, chars: [char] });
  });
  return runs;
}

export function imageText(text: string): string {
  const plain = text.replace(EMOJI, "").replace(/\s+/g, " ").trim();
  if (!ARABIC_SCRIPT.test(plain)) return plain;
  return directionRuns(shapeArabic(plain))
    .map((run) => (run.rtl ? run.chars.reverse() : run.chars).join(""))
    .join("");
}
