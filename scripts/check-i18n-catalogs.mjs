/**
 * Check every translation catalog in `apps/web/src/lib/i18n/copy/`.
 *
 * TypeScript already guarantees the *keys* match: each catalog types its
 * non-English entries against `typeof en`, so a missing or misspelled key fails
 * the build. What it cannot see inside a string is the `{placeholder}` set — a
 * Spanish line that drops `{count}` or `{provider}` type-checks perfectly and
 * renders a sentence with a hole in it. Same for a plural entry that has an
 * `_other` form in English and only `_one` in Spanish: `t.plural` would silently
 * fall back to English for every count but one.
 *
 * So this checks the three things the compiler cannot:
 *
 *   1. Both languages splice the same placeholders into the same key.
 *   2. Every plural family has the `_other` form its language requires
 *      (`Intl.PluralRules` decides which categories that means).
 *   3. No entry is left as a copy of the English it should have replaced —
 *      reported as a warning, since a handful legitimately match (`Prompts`,
 *      `Blog`, brand names, URLs that differ per language).
 *
 * Usage:
 *   node scripts/check-i18n-catalogs.mjs
 *
 * Exits non-zero on 1 or 2. Warnings never fail it.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'apps',
  'web',
  'src',
  'lib',
  'i18n',
  'copy'
);

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * `t.plural` always supplies `{count}` itself, so a plural entry that never
 * names it is fine — and an English `_one` form usually says "1 member"
 * literally. Neither is a mismatch worth reporting.
 */
const IMPLICIT = new Set(['count']);

const placeholders = value => {
  const found = new Set();
  for (const [, name] of value.matchAll(PLACEHOLDER)) {
    if (!IMPLICIT.has(name)) found.add(name);
  }
  return [...found].sort();
};

/**
 * Read the catalogs by importing the compiled TypeScript? No — that needs a
 * build step. These files are plain object literals with no imports beyond a
 * type, so stripping the type import and evaluating them is enough, and it
 * keeps this script runnable from a bare checkout.
 */
const loadCatalog = async file => {
  const source = await readFile(path.join(ROOT, file), 'utf8');
  const stripped = source
    .replace(/^import type .*$/gm, '')
    .replace(/^type \w+ = typeof en;$/gm, '')
    .replace(/: Catalog<\w+>/g, '')
    .replace(/^export const (\w+) =/m, 'const $1 =');
  const name = source.match(/^export const (\w+)/m)?.[1];
  if (!name) throw new Error(`${file}: no exported catalog`);
  // eslint-disable-next-line no-new-func
  const build = new Function(`${stripped}\nreturn ${name};`);
  return { name, catalog: build() };
};

/**
 * The forms a language must actually write out.
 *
 * Not every category `Intl.PluralRules` can return: `createT` falls back to the
 * *same* language's `_other`, which is the right rendering for most of them —
 * Spanish `many` fires only on exact millions and reads identically to `other`
 * outside compact notation. What cannot fall back is `one`, where using the
 * plural form is simply wrong, and `other` itself, which is the fallback.
 */
const requiredForms = lang => {
  const categories = new Set(
    new Intl.PluralRules(lang).resolvedOptions().pluralCategories
  );
  return ['one', 'other'].filter(
    form => form === 'other' || categories.has(form)
  );
};

const errors = [];
const warnings = [];

const files = (await readdir(ROOT)).filter(
  f => f.endsWith('.ts') && f !== 'index.ts'
);

for (const file of files.sort()) {
  const { name, catalog } = await loadCatalog(file);
  const [base, ...others] = Object.keys(catalog);
  const at = (lang, key) => `${name}.${lang}.${key}`;

  for (const lang of others) {
    for (const key of Object.keys(catalog[base])) {
      const from = placeholders(catalog[base][key]);
      const to = placeholders(catalog[lang][key] ?? '');

      if (from.join('|') !== to.join('|')) {
        errors.push(
          `${at(lang, key)} splices {${to.join('}, {') || '—'}} but ` +
            `${base} splices {${from.join('}, {') || '—'}}`
        );
      }

      if (
        catalog[lang][key] &&
        catalog[lang][key] === catalog[base][key] &&
        !/^https?:\/\//.test(catalog[base][key])
      ) {
        warnings.push(`${at(lang, key)} is identical to ${base}`);
      }
    }
  }

  // A plural family is any key ending `_other` in the base language; every
  // language has to write the forms it cannot fall back on.
  const families = Object.keys(catalog[base])
    .filter(k => k.endsWith('_other'))
    .map(k => k.slice(0, -'_other'.length));

  for (const lang of Object.keys(catalog)) {
    for (const family of families) {
      for (const form of requiredForms(lang)) {
        if (!catalog[lang][`${family}_${form}`]) {
          errors.push(`${at(lang, family)} is missing its "${form}" form`);
        }
      }
    }
  }
}

for (const warning of warnings) console.warn(`warn  ${warning}`);
for (const error of errors) console.error(`error ${error}`);

console.log(
  `\n${files.length} catalogs · ${errors.length} errors · ${warnings.length} warnings`
);

process.exit(errors.length ? 1 : 0);
