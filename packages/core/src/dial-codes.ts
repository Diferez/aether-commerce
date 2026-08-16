// ITU-T E.164 calling codes, keyed by ISO 3166-1 alpha-2. Used to split/join
// a flat wa.me-style digit string (e.g. "573001234567") into a country
// prefix and a local subscriber number for the admin's phone number picker.
export type DialCodeEntry = {
  iso2: string;
  dialCode: string;
  nameEn: string;
  nameEs: string;
};

export const DIAL_CODES: DialCodeEntry[] = [
  { iso2: "AF", dialCode: "93", nameEn: "Afghanistan", nameEs: "Afganistán" },
  { iso2: "AL", dialCode: "355", nameEn: "Albania", nameEs: "Albania" },
  { iso2: "DZ", dialCode: "213", nameEn: "Algeria", nameEs: "Argelia" },
  { iso2: "AD", dialCode: "376", nameEn: "Andorra", nameEs: "Andorra" },
  { iso2: "AO", dialCode: "244", nameEn: "Angola", nameEs: "Angola" },
  { iso2: "AR", dialCode: "54", nameEn: "Argentina", nameEs: "Argentina" },
  { iso2: "AM", dialCode: "374", nameEn: "Armenia", nameEs: "Armenia" },
  { iso2: "AU", dialCode: "61", nameEn: "Australia", nameEs: "Australia" },
  { iso2: "AT", dialCode: "43", nameEn: "Austria", nameEs: "Austria" },
  { iso2: "AZ", dialCode: "994", nameEn: "Azerbaijan", nameEs: "Azerbaiyán" },
  { iso2: "BS", dialCode: "1242", nameEn: "Bahamas", nameEs: "Bahamas" },
  { iso2: "BH", dialCode: "973", nameEn: "Bahrain", nameEs: "Baréin" },
  { iso2: "BD", dialCode: "880", nameEn: "Bangladesh", nameEs: "Bangladés" },
  { iso2: "BB", dialCode: "1246", nameEn: "Barbados", nameEs: "Barbados" },
  { iso2: "BY", dialCode: "375", nameEn: "Belarus", nameEs: "Bielorrusia" },
  { iso2: "BE", dialCode: "32", nameEn: "Belgium", nameEs: "Bélgica" },
  { iso2: "BZ", dialCode: "501", nameEn: "Belize", nameEs: "Belice" },
  { iso2: "BJ", dialCode: "229", nameEn: "Benin", nameEs: "Benín" },
  { iso2: "BT", dialCode: "975", nameEn: "Bhutan", nameEs: "Bután" },
  { iso2: "BO", dialCode: "591", nameEn: "Bolivia", nameEs: "Bolivia" },
  { iso2: "BA", dialCode: "387", nameEn: "Bosnia and Herzegovina", nameEs: "Bosnia y Herzegovina" },
  { iso2: "BW", dialCode: "267", nameEn: "Botswana", nameEs: "Botsuana" },
  { iso2: "BR", dialCode: "55", nameEn: "Brazil", nameEs: "Brasil" },
  { iso2: "BN", dialCode: "673", nameEn: "Brunei", nameEs: "Brunéi" },
  { iso2: "BG", dialCode: "359", nameEn: "Bulgaria", nameEs: "Bulgaria" },
  { iso2: "BF", dialCode: "226", nameEn: "Burkina Faso", nameEs: "Burkina Faso" },
  { iso2: "BI", dialCode: "257", nameEn: "Burundi", nameEs: "Burundi" },
  { iso2: "KH", dialCode: "855", nameEn: "Cambodia", nameEs: "Camboya" },
  { iso2: "CM", dialCode: "237", nameEn: "Cameroon", nameEs: "Camerún" },
  { iso2: "CA", dialCode: "1", nameEn: "Canada", nameEs: "Canadá" },
  { iso2: "CV", dialCode: "238", nameEn: "Cape Verde", nameEs: "Cabo Verde" },
  { iso2: "CF", dialCode: "236", nameEn: "Central African Republic", nameEs: "República Centroafricana" },
  { iso2: "TD", dialCode: "235", nameEn: "Chad", nameEs: "Chad" },
  { iso2: "CL", dialCode: "56", nameEn: "Chile", nameEs: "Chile" },
  { iso2: "CN", dialCode: "86", nameEn: "China", nameEs: "China" },
  { iso2: "CO", dialCode: "57", nameEn: "Colombia", nameEs: "Colombia" },
  { iso2: "KM", dialCode: "269", nameEn: "Comoros", nameEs: "Comoras" },
  { iso2: "CD", dialCode: "243", nameEn: "Congo (DRC)", nameEs: "Congo (RD)" },
  { iso2: "CG", dialCode: "242", nameEn: "Congo (Republic)", nameEs: "Congo (República)" },
  { iso2: "CR", dialCode: "506", nameEn: "Costa Rica", nameEs: "Costa Rica" },
  { iso2: "HR", dialCode: "385", nameEn: "Croatia", nameEs: "Croacia" },
  { iso2: "CU", dialCode: "53", nameEn: "Cuba", nameEs: "Cuba" },
  { iso2: "CY", dialCode: "357", nameEn: "Cyprus", nameEs: "Chipre" },
  { iso2: "CZ", dialCode: "420", nameEn: "Czechia", nameEs: "Chequia" },
  { iso2: "DK", dialCode: "45", nameEn: "Denmark", nameEs: "Dinamarca" },
  { iso2: "DJ", dialCode: "253", nameEn: "Djibouti", nameEs: "Yibuti" },
  { iso2: "DM", dialCode: "1767", nameEn: "Dominica", nameEs: "Dominica" },
  { iso2: "DO", dialCode: "1809", nameEn: "Dominican Republic", nameEs: "República Dominicana" },
  { iso2: "EC", dialCode: "593", nameEn: "Ecuador", nameEs: "Ecuador" },
  { iso2: "EG", dialCode: "20", nameEn: "Egypt", nameEs: "Egipto" },
  { iso2: "SV", dialCode: "503", nameEn: "El Salvador", nameEs: "El Salvador" },
  { iso2: "GQ", dialCode: "240", nameEn: "Equatorial Guinea", nameEs: "Guinea Ecuatorial" },
  { iso2: "ER", dialCode: "291", nameEn: "Eritrea", nameEs: "Eritrea" },
  { iso2: "EE", dialCode: "372", nameEn: "Estonia", nameEs: "Estonia" },
  { iso2: "SZ", dialCode: "268", nameEn: "Eswatini", nameEs: "Esuatini" },
  { iso2: "ET", dialCode: "251", nameEn: "Ethiopia", nameEs: "Etiopía" },
  { iso2: "FJ", dialCode: "679", nameEn: "Fiji", nameEs: "Fiyi" },
  { iso2: "FI", dialCode: "358", nameEn: "Finland", nameEs: "Finlandia" },
  { iso2: "FR", dialCode: "33", nameEn: "France", nameEs: "Francia" },
  { iso2: "GA", dialCode: "241", nameEn: "Gabon", nameEs: "Gabón" },
  { iso2: "GM", dialCode: "220", nameEn: "Gambia", nameEs: "Gambia" },
  { iso2: "GE", dialCode: "995", nameEn: "Georgia", nameEs: "Georgia" },
  { iso2: "DE", dialCode: "49", nameEn: "Germany", nameEs: "Alemania" },
  { iso2: "GH", dialCode: "233", nameEn: "Ghana", nameEs: "Ghana" },
  { iso2: "GR", dialCode: "30", nameEn: "Greece", nameEs: "Grecia" },
  { iso2: "GD", dialCode: "1473", nameEn: "Grenada", nameEs: "Granada" },
  { iso2: "GT", dialCode: "502", nameEn: "Guatemala", nameEs: "Guatemala" },
  { iso2: "GN", dialCode: "224", nameEn: "Guinea", nameEs: "Guinea" },
  { iso2: "GW", dialCode: "245", nameEn: "Guinea-Bissau", nameEs: "Guinea-Bisáu" },
  { iso2: "GY", dialCode: "592", nameEn: "Guyana", nameEs: "Guyana" },
  { iso2: "HT", dialCode: "509", nameEn: "Haiti", nameEs: "Haití" },
  { iso2: "HN", dialCode: "504", nameEn: "Honduras", nameEs: "Honduras" },
  { iso2: "HK", dialCode: "852", nameEn: "Hong Kong", nameEs: "Hong Kong" },
  { iso2: "HU", dialCode: "36", nameEn: "Hungary", nameEs: "Hungría" },
  { iso2: "IS", dialCode: "354", nameEn: "Iceland", nameEs: "Islandia" },
  { iso2: "IN", dialCode: "91", nameEn: "India", nameEs: "India" },
  { iso2: "ID", dialCode: "62", nameEn: "Indonesia", nameEs: "Indonesia" },
  { iso2: "IR", dialCode: "98", nameEn: "Iran", nameEs: "Irán" },
  { iso2: "IQ", dialCode: "964", nameEn: "Iraq", nameEs: "Irak" },
  { iso2: "IE", dialCode: "353", nameEn: "Ireland", nameEs: "Irlanda" },
  { iso2: "IL", dialCode: "972", nameEn: "Israel", nameEs: "Israel" },
  { iso2: "IT", dialCode: "39", nameEn: "Italy", nameEs: "Italia" },
  { iso2: "JM", dialCode: "1876", nameEn: "Jamaica", nameEs: "Jamaica" },
  { iso2: "JP", dialCode: "81", nameEn: "Japan", nameEs: "Japón" },
  { iso2: "JO", dialCode: "962", nameEn: "Jordan", nameEs: "Jordania" },
  { iso2: "KZ", dialCode: "7", nameEn: "Kazakhstan", nameEs: "Kazajistán" },
  { iso2: "KE", dialCode: "254", nameEn: "Kenya", nameEs: "Kenia" },
  { iso2: "KI", dialCode: "686", nameEn: "Kiribati", nameEs: "Kiribati" },
  { iso2: "KW", dialCode: "965", nameEn: "Kuwait", nameEs: "Kuwait" },
  { iso2: "KG", dialCode: "996", nameEn: "Kyrgyzstan", nameEs: "Kirguistán" },
  { iso2: "LA", dialCode: "856", nameEn: "Laos", nameEs: "Laos" },
  { iso2: "LV", dialCode: "371", nameEn: "Latvia", nameEs: "Letonia" },
  { iso2: "LB", dialCode: "961", nameEn: "Lebanon", nameEs: "Líbano" },
  { iso2: "LS", dialCode: "266", nameEn: "Lesotho", nameEs: "Lesoto" },
  { iso2: "LR", dialCode: "231", nameEn: "Liberia", nameEs: "Liberia" },
  { iso2: "LY", dialCode: "218", nameEn: "Libya", nameEs: "Libia" },
  { iso2: "LI", dialCode: "423", nameEn: "Liechtenstein", nameEs: "Liechtenstein" },
  { iso2: "LT", dialCode: "370", nameEn: "Lithuania", nameEs: "Lituania" },
  { iso2: "LU", dialCode: "352", nameEn: "Luxembourg", nameEs: "Luxemburgo" },
  { iso2: "MO", dialCode: "853", nameEn: "Macau", nameEs: "Macao" },
  { iso2: "MG", dialCode: "261", nameEn: "Madagascar", nameEs: "Madagascar" },
  { iso2: "MW", dialCode: "265", nameEn: "Malawi", nameEs: "Malaui" },
  { iso2: "MY", dialCode: "60", nameEn: "Malaysia", nameEs: "Malasia" },
  { iso2: "MV", dialCode: "960", nameEn: "Maldives", nameEs: "Maldivas" },
  { iso2: "ML", dialCode: "223", nameEn: "Mali", nameEs: "Malí" },
  { iso2: "MT", dialCode: "356", nameEn: "Malta", nameEs: "Malta" },
  { iso2: "MR", dialCode: "222", nameEn: "Mauritania", nameEs: "Mauritania" },
  { iso2: "MU", dialCode: "230", nameEn: "Mauritius", nameEs: "Mauricio" },
  { iso2: "MX", dialCode: "52", nameEn: "Mexico", nameEs: "México" },
  { iso2: "MD", dialCode: "373", nameEn: "Moldova", nameEs: "Moldavia" },
  { iso2: "MC", dialCode: "377", nameEn: "Monaco", nameEs: "Mónaco" },
  { iso2: "MN", dialCode: "976", nameEn: "Mongolia", nameEs: "Mongolia" },
  { iso2: "ME", dialCode: "382", nameEn: "Montenegro", nameEs: "Montenegro" },
  { iso2: "MA", dialCode: "212", nameEn: "Morocco", nameEs: "Marruecos" },
  { iso2: "MZ", dialCode: "258", nameEn: "Mozambique", nameEs: "Mozambique" },
  { iso2: "MM", dialCode: "95", nameEn: "Myanmar", nameEs: "Myanmar" },
  { iso2: "NA", dialCode: "264", nameEn: "Namibia", nameEs: "Namibia" },
  { iso2: "NP", dialCode: "977", nameEn: "Nepal", nameEs: "Nepal" },
  { iso2: "NL", dialCode: "31", nameEn: "Netherlands", nameEs: "Países Bajos" },
  { iso2: "NZ", dialCode: "64", nameEn: "New Zealand", nameEs: "Nueva Zelanda" },
  { iso2: "NI", dialCode: "505", nameEn: "Nicaragua", nameEs: "Nicaragua" },
  { iso2: "NE", dialCode: "227", nameEn: "Niger", nameEs: "Níger" },
  { iso2: "NG", dialCode: "234", nameEn: "Nigeria", nameEs: "Nigeria" },
  { iso2: "MK", dialCode: "389", nameEn: "North Macedonia", nameEs: "Macedonia del Norte" },
  { iso2: "NO", dialCode: "47", nameEn: "Norway", nameEs: "Noruega" },
  { iso2: "OM", dialCode: "968", nameEn: "Oman", nameEs: "Omán" },
  { iso2: "PK", dialCode: "92", nameEn: "Pakistan", nameEs: "Pakistán" },
  { iso2: "PA", dialCode: "507", nameEn: "Panama", nameEs: "Panamá" },
  { iso2: "PG", dialCode: "675", nameEn: "Papua New Guinea", nameEs: "Papúa Nueva Guinea" },
  { iso2: "PY", dialCode: "595", nameEn: "Paraguay", nameEs: "Paraguay" },
  { iso2: "PE", dialCode: "51", nameEn: "Peru", nameEs: "Perú" },
  { iso2: "PH", dialCode: "63", nameEn: "Philippines", nameEs: "Filipinas" },
  { iso2: "PL", dialCode: "48", nameEn: "Poland", nameEs: "Polonia" },
  { iso2: "PT", dialCode: "351", nameEn: "Portugal", nameEs: "Portugal" },
  { iso2: "PR", dialCode: "1787", nameEn: "Puerto Rico", nameEs: "Puerto Rico" },
  { iso2: "QA", dialCode: "974", nameEn: "Qatar", nameEs: "Catar" },
  { iso2: "RO", dialCode: "40", nameEn: "Romania", nameEs: "Rumania" },
  { iso2: "RU", dialCode: "7", nameEn: "Russia", nameEs: "Rusia" },
  { iso2: "RW", dialCode: "250", nameEn: "Rwanda", nameEs: "Ruanda" },
  { iso2: "WS", dialCode: "685", nameEn: "Samoa", nameEs: "Samoa" },
  { iso2: "SM", dialCode: "378", nameEn: "San Marino", nameEs: "San Marino" },
  { iso2: "SA", dialCode: "966", nameEn: "Saudi Arabia", nameEs: "Arabia Saudita" },
  { iso2: "SN", dialCode: "221", nameEn: "Senegal", nameEs: "Senegal" },
  { iso2: "RS", dialCode: "381", nameEn: "Serbia", nameEs: "Serbia" },
  { iso2: "SC", dialCode: "248", nameEn: "Seychelles", nameEs: "Seychelles" },
  { iso2: "SL", dialCode: "232", nameEn: "Sierra Leone", nameEs: "Sierra Leona" },
  { iso2: "SG", dialCode: "65", nameEn: "Singapore", nameEs: "Singapur" },
  { iso2: "SK", dialCode: "421", nameEn: "Slovakia", nameEs: "Eslovaquia" },
  { iso2: "SI", dialCode: "386", nameEn: "Slovenia", nameEs: "Eslovenia" },
  { iso2: "SB", dialCode: "677", nameEn: "Solomon Islands", nameEs: "Islas Salomón" },
  { iso2: "SO", dialCode: "252", nameEn: "Somalia", nameEs: "Somalia" },
  { iso2: "ZA", dialCode: "27", nameEn: "South Africa", nameEs: "Sudáfrica" },
  { iso2: "KR", dialCode: "82", nameEn: "South Korea", nameEs: "Corea del Sur" },
  { iso2: "SS", dialCode: "211", nameEn: "South Sudan", nameEs: "Sudán del Sur" },
  { iso2: "ES", dialCode: "34", nameEn: "Spain", nameEs: "España" },
  { iso2: "LK", dialCode: "94", nameEn: "Sri Lanka", nameEs: "Sri Lanka" },
  { iso2: "LC", dialCode: "1758", nameEn: "St. Lucia", nameEs: "Santa Lucía" },
  { iso2: "SD", dialCode: "249", nameEn: "Sudan", nameEs: "Sudán" },
  { iso2: "SR", dialCode: "597", nameEn: "Suriname", nameEs: "Surinam" },
  { iso2: "SE", dialCode: "46", nameEn: "Sweden", nameEs: "Suecia" },
  { iso2: "CH", dialCode: "41", nameEn: "Switzerland", nameEs: "Suiza" },
  { iso2: "SY", dialCode: "963", nameEn: "Syria", nameEs: "Siria" },
  { iso2: "TW", dialCode: "886", nameEn: "Taiwan", nameEs: "Taiwán" },
  { iso2: "TJ", dialCode: "992", nameEn: "Tajikistan", nameEs: "Tayikistán" },
  { iso2: "TZ", dialCode: "255", nameEn: "Tanzania", nameEs: "Tanzania" },
  { iso2: "TH", dialCode: "66", nameEn: "Thailand", nameEs: "Tailandia" },
  { iso2: "TL", dialCode: "670", nameEn: "Timor-Leste", nameEs: "Timor Oriental" },
  { iso2: "TG", dialCode: "228", nameEn: "Togo", nameEs: "Togo" },
  { iso2: "TO", dialCode: "676", nameEn: "Tonga", nameEs: "Tonga" },
  { iso2: "TT", dialCode: "1868", nameEn: "Trinidad and Tobago", nameEs: "Trinidad y Tobago" },
  { iso2: "TN", dialCode: "216", nameEn: "Tunisia", nameEs: "Túnez" },
  { iso2: "TR", dialCode: "90", nameEn: "Turkey", nameEs: "Turquía" },
  { iso2: "TM", dialCode: "993", nameEn: "Turkmenistan", nameEs: "Turkmenistán" },
  { iso2: "UG", dialCode: "256", nameEn: "Uganda", nameEs: "Uganda" },
  { iso2: "UA", dialCode: "380", nameEn: "Ukraine", nameEs: "Ucrania" },
  { iso2: "AE", dialCode: "971", nameEn: "United Arab Emirates", nameEs: "Emiratos Árabes Unidos" },
  { iso2: "GB", dialCode: "44", nameEn: "United Kingdom", nameEs: "Reino Unido" },
  { iso2: "US", dialCode: "1", nameEn: "United States", nameEs: "Estados Unidos" },
  { iso2: "UY", dialCode: "598", nameEn: "Uruguay", nameEs: "Uruguay" },
  { iso2: "UZ", dialCode: "998", nameEn: "Uzbekistan", nameEs: "Uzbekistán" },
  { iso2: "VU", dialCode: "678", nameEn: "Vanuatu", nameEs: "Vanuatu" },
  { iso2: "VE", dialCode: "58", nameEn: "Venezuela", nameEs: "Venezuela" },
  { iso2: "VN", dialCode: "84", nameEn: "Vietnam", nameEs: "Vietnam" },
  { iso2: "YE", dialCode: "967", nameEn: "Yemen", nameEs: "Yemen" },
  { iso2: "ZM", dialCode: "260", nameEn: "Zambia", nameEs: "Zambia" },
  { iso2: "ZW", dialCode: "263", nameEn: "Zimbabwe", nameEs: "Zimbabue" }
];

const DEFAULT_ISO2 = "CO";

// Regional indicator symbols run from U+1F1E6 ("A") to U+1F1FF ("Z"), offset
// from ASCII by the same distance for every letter - so any ISO 3166-1
// alpha-2 code converts to its flag without a 195-entry emoji table to
// keep in sync with DIAL_CODES.
export function dialCodeFlagEmoji(iso2: string): string {
  return [...iso2.toUpperCase()].map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65)).join("");
}

export function defaultDialCodeEntry(): DialCodeEntry {
  return DIAL_CODES.find((entry) => entry.iso2 === DEFAULT_ISO2)!;
}

// wa.me numbers are one flat digit string with no separators, so a stored
// value like "573001234567" has to be split back into a dial code and a
// local number for the picker. Longest-prefix-first avoids "1" (US/Canada)
// swallowing numbers that actually start with a longer NANP code like
// "1876" (Jamaica).
export function splitWhatsappNumber(value: string): { entry: DialCodeEntry; localNumber: string } {
  const digits = value.replace(/\D/g, "");
  if (!digits) return { entry: defaultDialCodeEntry(), localNumber: "" };

  const byLongestDialCode = [...DIAL_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length);
  const match = byLongestDialCode.find((entry) => digits.startsWith(entry.dialCode) && digits.length > entry.dialCode.length);
  if (match) return { entry: match, localNumber: digits.slice(match.dialCode.length) };

  return { entry: defaultDialCodeEntry(), localNumber: digits };
}

export function joinWhatsappNumber(dialCode: string, localNumber: string): string {
  return `${dialCode}${localNumber.replace(/\D/g, "")}`;
}
