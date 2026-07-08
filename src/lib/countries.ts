export type Country = { code: string; name: string; flag: string };

// Compact list of common countries. Flag = regional indicator emoji from code.
function flagOf(code: string): string {
  return code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join("");
}

const RAW: Array<[string, string]> = [
  ["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"],
  ["NZ", "New Zealand"], ["IE", "Ireland"], ["FR", "France"], ["DE", "Germany"],
  ["ES", "Spain"], ["PT", "Portugal"], ["IT", "Italy"], ["NL", "Netherlands"],
  ["BE", "Belgium"], ["CH", "Switzerland"], ["AT", "Austria"], ["SE", "Sweden"],
  ["NO", "Norway"], ["DK", "Denmark"], ["FI", "Finland"], ["IS", "Iceland"],
  ["PL", "Poland"], ["CZ", "Czechia"], ["SK", "Slovakia"], ["HU", "Hungary"],
  ["RO", "Romania"], ["BG", "Bulgaria"], ["GR", "Greece"], ["TR", "Turkey"],
  ["UA", "Ukraine"], ["RU", "Russia"], ["EE", "Estonia"], ["LV", "Latvia"],
  ["LT", "Lithuania"], ["BR", "Brazil"], ["AR", "Argentina"], ["CL", "Chile"],
  ["MX", "Mexico"], ["CO", "Colombia"], ["PE", "Peru"], ["UY", "Uruguay"],
  ["VE", "Venezuela"], ["JP", "Japan"], ["KR", "South Korea"], ["CN", "China"],
  ["TW", "Taiwan"], ["HK", "Hong Kong"], ["SG", "Singapore"], ["MY", "Malaysia"],
  ["ID", "Indonesia"], ["PH", "Philippines"], ["TH", "Thailand"], ["VN", "Vietnam"],
  ["IN", "India"], ["PK", "Pakistan"], ["BD", "Bangladesh"], ["LK", "Sri Lanka"],
  ["AE", "United Arab Emirates"], ["SA", "Saudi Arabia"], ["IL", "Israel"], ["EG", "Egypt"],
  ["MA", "Morocco"], ["DZ", "Algeria"], ["TN", "Tunisia"], ["ZA", "South Africa"],
  ["NG", "Nigeria"], ["KE", "Kenya"], ["GH", "Ghana"], ["ET", "Ethiopia"],
  ["HR", "Croatia"], ["RS", "Serbia"], ["SI", "Slovenia"], ["BA", "Bosnia and Herzegovina"],
];

export const COUNTRIES: Country[] = RAW
  .map(([code, name]) => ({ code, name, flag: flagOf(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));