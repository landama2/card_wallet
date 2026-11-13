import type { Format } from './logic';

// Known loyalty programmes, by country. Picking one pre-fills the card's colour, barcode type and website (for the logo).
// Colours are each brand's main colour, darkened where needed so white text stays readable (≥ 4.5:1).
// ponytail: formats are the usual barcode on the plastic card, from memory, like the websites; a scan or a code that
// doesn't fit the format always wins. No domain = no site with a usable icon found. Fix entries as real cards show otherwise.
export const CATEGORIES = ['Groceries', 'Drugstores', 'Fuel', 'Home', 'Fashion', 'Sport', 'Pets', 'Books & toys'] as const;
export type Store = { cat: (typeof CATEGORIES)[number]; name: string; domain?: string; color: string; format: Format; aliases?: string[] };

export const STORES: Record<string, Store[]> = {
  cz: [
    // Groceries
    { cat: 'Groceries', name: 'Albert', domain: 'albert.cz', color: '#0057a8', format: 'ean13', aliases: ['Můj Albert'] },
    { cat: 'Groceries', name: 'BILLA', domain: 'billa.cz', color: '#c8102e', format: 'ean13', aliases: ['BILLA Klub'] },
    { cat: 'Groceries', name: 'COOP', domain: 'coop.cz', color: '#007a3d', format: 'ean13', aliases: ['Dobrá karta', 'COOP Jednota'] },
    { cat: 'Groceries', name: 'Globus', domain: 'globus.cz', color: '#006b3f', format: 'ean13', aliases: ['Můj Globus'] },
    { cat: 'Groceries', name: 'Kaufland', domain: 'kaufland.cz', color: '#d0021b', format: 'ean13', aliases: ['Kaufland Card'] },
    { cat: 'Groceries', name: 'Lidl', domain: 'lidl.cz', color: '#0050aa', format: 'qr', aliases: ['Lidl Plus'] },
    { cat: 'Groceries', name: 'MAKRO', domain: 'makro.cz', color: '#003d7c', format: 'code128', aliases: ['MAKRO Klub'] },
    { cat: 'Groceries', name: 'PENNY', domain: 'penny.cz', color: '#cd1719', format: 'ean13', aliases: ['Moje Penny', 'Penny Market'] },
    { cat: 'Groceries', name: 'Tesco', domain: 'itesco.cz', color: '#00539f', format: 'ean13', aliases: ['Tesco Clubcard', 'Clubcard'] },
    { cat: 'Groceries', name: 'Tchibo', domain: 'tchibo.cz', color: '#1d3557', format: 'ean13', aliases: ['TchiboCard'] },
    { cat: 'Groceries', name: 'JIP', domain: 'jip.cz', color: '#b5121b', format: 'ean13' },
    { cat: 'Groceries', name: 'TERNO', domain: 'terno.cz', color: '#c4161c', format: 'ean13', aliases: ['TREFA'] },
    // Drugstores and pharmacies
    { cat: 'Drugstores', name: 'dm', domain: 'dm.cz', color: '#002b5c', format: 'ean13', aliases: ['dm drogerie', 'dm active beauty'] },
    { cat: 'Drugstores', name: 'Rossmann', domain: 'rossmann.cz', color: '#c3002f', format: 'ean13', aliases: ['Rossmann Club'] },
    { cat: 'Drugstores', name: 'TETA', domain: 'tetadrogerie.cz', color: '#c8102e', format: 'ean13', aliases: ['TETA drogerie', 'TETA klub'] },
    { cat: 'Drugstores', name: 'Dr. Max', domain: 'drmax.cz', color: '#00663a', format: 'ean13', aliases: ['Dr Max', 'Dr. Max Klub'] },
    { cat: 'Drugstores', name: 'BENU', domain: 'benu.cz', color: '#007a3d', format: 'ean13', aliases: ['BENU Plus', 'BENU lékárna'] },
    { cat: 'Drugstores', name: 'Pilulka', domain: 'pilulka.cz', color: '#00754a', format: 'ean13', aliases: ['Pilulka Klub'] },
    { cat: 'Drugstores', name: 'Magistra', domain: 'magistra.cz', color: '#0a5c36', format: 'ean13', aliases: ['Magistra Klub'] },
    // Fuel
    { cat: 'Fuel', name: 'Shell', domain: 'shell.cz', color: '#c8102e', format: 'ean13', aliases: ['Shell ClubSmart', 'ClubSmart'] },
    { cat: 'Fuel', name: 'OMV', domain: 'omv.cz', color: '#003a70', format: 'ean13', aliases: ['OMV myStation', 'myStation'] },
    { cat: 'Fuel', name: 'MOL', domain: 'molcesko.cz', color: '#b5121b', format: 'qr', aliases: ['MOL Move'] },
    { cat: 'Fuel', name: 'ORLEN', domain: 'orlen.cz', color: '#c8102e', format: 'ean13', aliases: ['Benzina', 'ORLEN Benzina'] },
    // Home
    { cat: 'Home', name: 'IKEA', domain: 'ikea.com', color: '#0058a3', format: 'code128', aliases: ['IKEA Family'] },
    { cat: 'Home', name: 'XXXLutz', domain: 'xxxlutz.cz', color: '#c8102e', format: 'ean13', aliases: ['XXXL'] },
    { cat: 'Home', name: 'Möbelix', domain: 'moebelix.cz', color: '#c4161c', format: 'ean13' },
    { cat: 'Home', name: 'Kika', color: '#b5121b', format: 'ean13' },
    { cat: 'Home', name: 'SCONTO', domain: 'sconto.cz', color: '#004f9f', format: 'ean13', aliases: ['SCONTO Club'] },
    { cat: 'Home', name: 'Hornbach', domain: 'hornbach.cz', color: '#a84300', format: 'ean13' },
    { cat: 'Home', name: 'OBI', domain: 'obi.cz', color: '#b84c00', format: 'ean13', aliases: ['OBI Heimwerker'] },
    // Fashion and shoes
    { cat: 'Fashion', name: 'H&M', domain: 'hm.com', color: '#c8102e', format: 'qr', aliases: ['HM', 'H&M Membership'] },
    { cat: 'Fashion', name: 'C&A', domain: 'c-and-a.com', color: '#003a70', format: 'ean13', aliases: ['CA', 'C&A for you'] },
    { cat: 'Fashion', name: 'CCC', domain: 'ccc.eu', color: '#a6192e', format: 'ean13', aliases: ['Klub CCC'] },
    { cat: 'Fashion', name: 'Peek & Cloppenburg', domain: 'peek-cloppenburg.cz', color: '#1a1a1a', format: 'ean13', aliases: ['P&C', 'Insider P&C'] },
    { cat: 'Fashion', name: 'Baťa', domain: 'bata.cz', color: '#c8102e', format: 'ean13', aliases: ['Bata', 'Baťa klub'] },
    { cat: 'Fashion', name: 'Humanic', domain: 'humanic.net', color: '#b5121b', format: 'ean13', aliases: ['Shoemanic'] },
    { cat: 'Fashion', name: 'SAM 73', domain: 'sam73.cz', color: '#1f3a2e', format: 'ean13', aliases: ['SAM73'] },
    { cat: 'Fashion', name: 'GECO', domain: 'geco.cz', color: '#0b3d91', format: 'ean13' },
    // Sport
    { cat: 'Sport', name: 'Decathlon', domain: 'decathlon.cz', color: '#0064a6', format: 'ean13' },
    { cat: 'Sport', name: 'Sportisimo', domain: 'sportisimo.cz', color: '#c8102e', format: 'ean13', aliases: ['Sportisimo Klub'] },
    { cat: 'Sport', name: 'Intersport', domain: 'intersport.cz', color: '#b5121b', format: 'ean13' },
    { cat: 'Sport', name: 'Sport&Bonus', domain: 'a3sport.cz', color: '#003a70', format: 'ean13', aliases: ['A3 Sport', 'Sport Bonus'] },
    // Pets
    { cat: 'Pets', name: 'Super zoo', domain: 'superzoo.cz', color: '#00704a', format: 'ean13', aliases: ['Superzoo', 'Super zoo Family'] },
    { cat: 'Pets', name: 'Zvěrokruh', domain: 'zverokruh.cz', color: '#8a3b12', format: 'ean13' },
    { cat: 'Pets', name: 'Petko', color: '#6b2c91', format: 'ean13', aliases: ['Petko+'] },
    // Books and toys
    { cat: 'Books & toys', name: 'Knihy Dobrovský', domain: 'knihydobrovsky.cz', color: '#8b1e3f', format: 'ean13', aliases: ['Dobrovský'] },
    { cat: 'Books & toys', name: 'Grada', domain: 'grada.cz', color: '#a6192e', format: 'ean13', aliases: ['Grada Klub'] },
    { cat: 'Books & toys', name: 'Knihy BASIC', color: '#1d3557', format: 'ean13', aliases: ['BASIC'] },
    { cat: 'Books & toys', name: 'Luxor', domain: 'luxor.cz', color: '#1a1a1a', format: 'ean13', aliases: ['Neoluxor'] },
    { cat: 'Books & toys', name: 'Pompo', domain: 'pompo.cz', color: '#b5121b', format: 'ean13', aliases: ['Pompo Klub'] },
    { cat: 'Books & toys', name: 'Dráčik', domain: 'dracik.cz', color: '#c4161c', format: 'ean13', aliases: ['Dracik'] },
    { cat: 'Books & toys', name: 'Bambule', domain: 'bambule.cz', color: '#6b2c91', format: 'ean13', aliases: ['Klub Bambule'] },
  ],
};

const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const byKey = new Map(Object.values(STORES).flat().flatMap((s) => [s.name, ...(s.aliases ?? [])].map((n) => [key(n), s] as const)));

// "Můj Albert", "albert" and "ALBERT" all find Albert; anything else is null.
export const findStore = (name: string): Store | null => byKey.get(key(name)) ?? null;

// The store picker's search: any word of the name or an alias starting with the query ("kn" finds Knihy Dobrovský).
export const searchStores = (q: string, stores = Object.values(STORES).flat()) => {
  const words = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/);
  const k = words(q).join('');
  return k ? stores.filter((s) => [s.name, ...(s.aliases ?? [])].some((n) => words(n).some((_, i, all) => all.slice(i).join('').startsWith(k)))) : stores;
};
