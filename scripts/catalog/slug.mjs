// Slugs for provinces and districts. They must stay equal to the ones Ankara's 25 districts got in
// 20261025100000_reference_catalog.sql (for example "Şereflikoçhisar" -> "sereflikochisar"), since rows are
// matched by slug when the full catalog is loaded.
const FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

export function slugifyTr(name) {
  return name
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]/g, (ch) => FOLD[ch])
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
