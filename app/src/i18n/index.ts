import en from './en.json';
import zh from './zh-CN.json';

export type Lang = 'en' | 'zh';

const DICTS: Record<Lang, Record<string, string>> = { en, zh };

export function tr(lang: Lang, key: string): string {
  return DICTS[lang][key] ?? en[key as keyof typeof en] ?? key;
}
