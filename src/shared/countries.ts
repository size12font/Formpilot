const COUNTRY_NAMES: Record<string, Record<string, string>> = {
  US: { en: "United States", es: "Estados Unidos", de: "Vereinigte Staaten", fr: "États-Unis", id: "Amerika Serikat" },
  CA: { en: "Canada", fr: "Canada" }, GB: { en: "United Kingdom", es: "Reino Unido", de: "Vereinigtes Königreich" },
  DE: { en: "Germany", es: "Alemania", de: "Deutschland", fr: "Allemagne" }, FR: { en: "France", de: "Frankreich", es: "Francia" },
  ES: { en: "Spain", es: "España", de: "Spanien" }, IT: { en: "Italy", it: "Italia", de: "Italien" },
  KR: { en: "South Korea", ko: "대한민국" }, JP: { en: "Japan", ja: "日本" }, CN: { en: "China", zh: "中国" },
  AU: { en: "Australia" }, NZ: { en: "New Zealand" }, BR: { en: "Brazil", pt: "Brasil" }, MX: { en: "Mexico", es: "México" },
  IN: { en: "India", hi: "भारत" }, AE: { en: "United Arab Emirates", ar: "الإمارات العربية المتحدة" },
  TH: { en: "Thailand", th: "ประเทศไทย" }, VN: { en: "Vietnam", vi: "Việt Nam" },
  ID: { en: "Indonesia", id: "Indonesia" }
};

// ISO 3166-1 alpha-2 codes. Keeping the code list local makes country matching
// deterministic and avoids the unsafe "first two letters" fallback.
const ISO2_CODES = new Set(`AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(/\s+/));

const normalize = (value: string) => value.trim().toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const EN_DISPLAY_NAMES = (() => {
  try { return new Intl.DisplayNames(["en"], { type: "region" }); }
  catch { return null; }
})();

export function countryIso2(value: string): string {
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  if (ISO2_CODES.has(upper)) return upper;
  const target = normalize(trimmed);
  for (const code of ISO2_CODES) {
    const names = [COUNTRY_NAMES[code]?.en, ...Object.values(COUNTRY_NAMES[code] ?? {})].filter(Boolean);
    if (names.some((name) => normalize(name!) === target)) return code;
    const display = EN_DISPLAY_NAMES?.of(code);
    if (display && normalize(display) === target) return code;
  }
  return "";
}

export function countryName(value: string, lang: string): string {
  const iso2 = countryIso2(value);
  if (!iso2) return value;
  const language = lang.toLowerCase().split("-")[0] || "en";
  const explicit = COUNTRY_NAMES[iso2]?.[language];
  if (explicit) return explicit;
  try {
    return new Intl.DisplayNames([language, "en"], { type: "region" }).of(iso2) ?? COUNTRY_NAMES[iso2]?.en ?? value;
  } catch {
    return COUNTRY_NAMES[iso2]?.en ?? value;
  }
}

const COUNTRY_ALIASES: Record<string, string[]> = {
  US: ["USA", "United States of America", "Estados Unidos", "États-Unis", "Amerika Serikat"],
  GB: ["UK", "Great Britain", "Britain"], KR: ["Republic of Korea", "Korea, Republic of"],
  AE: ["UAE", "United Arab Emirates"], CZ: ["Czechia", "Czech Republic"]
};

export function countryCandidates(value: string, lang: string): string[] {
  const iso2 = countryIso2(value);
  if (!iso2) return [value];
  const candidates = new Set<string>([value, iso2, countryName(iso2, lang), countryName(iso2, "en")]);
  for (const alias of COUNTRY_ALIASES[iso2] ?? []) candidates.add(alias);
  return [...candidates].filter(Boolean);
}
