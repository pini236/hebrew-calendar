/**
 * Interface language: Hebrew or English. "auto" follows the phone (or browser): Hebrew when its
 * first language is Hebrew, English for any other language.
 *
 * Text is written in place, both languages side by side: tr('היום', 'Today'). The language is read
 * when the text is rendered, so never call tr() at module level (it would freeze the first language).
 */
export type Lang = 'he' | 'en';
export type LangPref = 'auto' | Lang;

let current: Lang = 'he';

/** The phone's language as one of ours */
export function phoneLang(): Lang {
  if (typeof navigator === 'undefined') return 'he';
  const first = (navigator.languages && navigator.languages[0]) || navigator.language || 'he';
  return /^(he|iw)\b/i.test(first) ? 'he' : 'en';
}

export function resolveLang(pref: LangPref | undefined): Lang {
  return pref === 'he' || pref === 'en' ? pref : phoneLang();
}

export const lang = () => current;
export const isHe = () => current === 'he';

/** Sets the language and the page direction (rtl for Hebrew) */
export function setLang(l: Lang) {
  current = l;
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root.lang !== l) root.lang = l;
    const dir = l === 'he' ? 'rtl' : 'ltr';
    if (root.dir !== dir) root.dir = dir;
  }
}

/** The text in the current language */
export function tr(he: string, en: string) {
  return current === 'he' ? he : en;
}

/** A list (months, weekdays…) that reads in the current language wherever it is indexed or mapped */
export function byLang(he: readonly string[], en: readonly string[]): readonly string[] {
  return new Proxy(he as string[], {
    get: (_t, p) => Reflect.get(current === 'he' ? he : en, p),
  });
}

/** The locale for Intl formatters */
export const locale = () => (current === 'he' ? 'he-IL' : 'en-US');

/** "1 day" / "3 days" style plurals for English; Hebrew callers pass their own forms */
export function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}
