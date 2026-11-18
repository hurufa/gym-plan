// i18n.js
// UI language (Indonesian / English). setLang() loads data/i18n/<lang>.json via loadData;
// t('a.b.c', {n: 3}) returns the string with {n} filled in; tx({en, id}) picks the content field
// for the current language. Also formats dates as "13 November 2026" and numbers per language.

import { loadData } from './data.js';

export const LANGS = ['id', 'en'];
let lang = 'en';
let strings = {};

export const getLang = () => lang;

export function detectLang() {
  return (navigator.language || 'en').toLowerCase().startsWith('id') ? 'id' : 'en';
}

export async function setLang(next) {
  lang = LANGS.includes(next) ? next : 'en';
  strings = await loadData(`i18n/${lang}`);
  document.documentElement.lang = lang;
  return lang;
}

const lookup = (obj, key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

export function t(key, vars = {}) {
  const v = lookup(strings, key);
  if (typeof v !== 'string') {
    console.warn(`Missing i18n key: ${key}`);
    return key;
  }
  return v.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

// For arrays/objects stored in the strings file (e.g. option lists).
export const tRaw = key => lookup(strings, key);

export const tx = field => (field == null ? '' : typeof field === 'string' ? field : field[lang] ?? field.en ?? '');

const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  id: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
};

// Accepts a Date or a local 'YYYY-MM-DD' string. Output: "13 November 2026".
export function formatDate(d, l = lang) {
  let y, m, day;
  if (typeof d === 'string') [y, m, day] = d.split('-').map(Number);
  else { y = d.getFullYear(); m = d.getMonth() + 1; day = d.getDate(); }
  return `${day} ${MONTHS[l][m - 1]} ${y}`;
}

export function formatNumber(n, opts = {}, l = lang) {
  return new Intl.NumberFormat(l === 'id' ? 'id-ID' : 'en-GB', opts).format(n);
}

export const formatIDR = n => `Rp ${formatNumber(Math.round(n), {}, 'id')}`;
