import { LOCALE } from '@/lib/i18n';

import type { Locale } from '@/lib/i18n';

/**
 * Deterministic hint post-filter (spec 6.6.4).
 *
 * The prompt states the intent but guarantees nothing: between the model and
 * the screen there must be code that never lets banned topics through. A
 * phrase that fails the check is dropped silently — never rewritten and never
 * sent back to the model.
 *
 * Why not `\b` as sketched in the spec: in JS `\b` is defined through `\w`,
 * and `\w` is ASCII `[A-Za-z0-9_]`. Cyrillic is not part of it, so `/\bвес/`
 * never matches the string «вес». Word boundaries are built manually with
 * lookarounds over Unicode letter/digit properties, which also works for
 * Latin-script locales.
 *
 * The banned rule list is per-locale: each language has its own word stems
 * for the same categories (weight, body, food, health, age, money,
 * nationality, personal life, profanity, insults).
 */

/** Longer text cannot be read in the feed within 7 s and breaks the layout (spec 6.6.10). */
export const MAX_HINT_LENGTH = 160;

/** Left and right word boundaries that work for any Unicode script. */
const LB = '(?<![\\p{L}\\p{Nd}])';
const RB = '(?![\\p{L}\\p{Nd}])';

/** Exact word forms: «вес», «веса», but not «весело» and not «весь». */
function exact(body: string): RegExp {
  return new RegExp(`${LB}(?:${body})${RB}`, 'iu');
}

/** Word stem with any ending: «диет» → «диета», «диетический». */
function stem(body: string): RegExp {
  return new RegExp(`${LB}(?:${body})\\p{L}*`, 'iu');
}

interface BannedRule {
  /** The category lands in the log — it shows which topic the model drifts into. */
  readonly category: string;
  readonly re: RegExp;
}

/**
 * Banned topics, Russian. The rules are deliberately redundant: a false
 * rejection costs one phrase from the pool, a body joke that slips through
 * costs trust in the whole product.
 */
const RU_BANNED: readonly BannedRule[] = [
  // Weight. «прибавил 20 кг» is caught, «прошёл 20 км» is not: different
  // words, and word boundaries keep «км» inside «км/ч» from matching.
  { category: 'вес', re: exact('вес|веса|весу|весом|весе|весы|весов|весам|весами|весах') },
  { category: 'вес', re: exact('весит|весят|весил|весила|весили|весить') },
  { category: 'вес', re: exact('кг') },
  { category: 'вес', re: stem('килограмм') },
  { category: 'вес', re: stem('взвеш|взвесил') },
  { category: 'вес', re: stem('похуде|худею|худеет|худеть|худел') },
  { category: 'вес', re: stem('толст|потолстел') },
  { category: 'вес', re: exact('поправился|поправилась|поправились') },
  // Body and appearance.
  { category: 'тело', re: stem('фигур') },
  { category: 'тело', re: new RegExp(`${LB}живот(?!н)\\p{L}*`, 'iu') },
  { category: 'тело', re: new RegExp(`${LB}жир(?!аф)\\p{L}*`, 'iu') },
  { category: 'тело', re: stem('талия|талии|талию|бедр|ягодиц|задниц|пузо|пуз') },
  { category: 'тело', re: stem('мышц|бицепс|телосложен') },
  { category: 'тело', re: stem('внешност|наружност') },
  { category: 'тело', re: stem('разъел|объел|наел|переел|обжор') },
  // Food and diets.
  { category: 'еда', re: stem('диет|калори|фастфуд|бургер|пицц|пончик|булочк|шаурм|перекус') },
  { category: 'еда', re: exact('еда|еды|еде|едой|ел|ела|ест|едят|съел|съела|съесть') },
  // Health and medicine.
  { category: 'здоровье', re: stem('здоровь|нездоров') },
  { category: 'здоровье', re: stem('болезн|больниц|врач|доктор|таблетк|лекарств') },
  { category: 'здоровье', re: exact('болеет|болел|болела|болит|болят') },
  { category: 'здоровье', re: stem('диагноз|симптом|давлени|пульс|сердц|травм|похмель') },
  // Age.
  { category: 'возраст', re: stem('возраст|старик|старе|пожил|пенсион|ровесник') },
  // Money.
  { category: 'деньги', re: stem('зарплат|получк|премиальн') },
  { category: 'деньги', re: exact('доход|дохода|доходы|доходом') },
  // Nationality and beliefs.
  { category: 'национальность', re: stem('национальн|нацмен|мигрант|вероисповед|религи') },
  // Personal life.
  { category: 'личное', re: stem('развод|свидан|любовн') },
  { category: 'личное', re: exact('жена|жены|жене|женой|муж|мужа|мужу|мужем|девушка|парень') },
  // Profanity.
  { category: 'мат', re: stem('хуй|хуе|хуи|хуя|нахуй|похуй|охуе|ахуе') },
  { category: 'мат', re: stem('пизд|бляд|ебал|ебан|ебуч|ебат|ебну|заеб|наеб|уеб|доеб') },
  { category: 'мат', re: exact('бля') },
  { category: 'мат', re: stem('мудак|мудил|говн|дерьм|жоп|срак|сран|долбо|залуп|гандон') },
  { category: 'мат', re: stem('пидор|пидар|педик|хренов') },
  { category: 'мат', re: exact('сука|суки|суке|суку|сукой') },
  // Insults.
  { category: 'оскорбление', re: stem('идиот|дебил|кретин|тупиц|урод|ничтожеств|никчемн') },
  { category: 'оскорбление', re: exact('тупой|тупая|тупые|дурак|дура|дураки|лох|лохи') },
];

/** Banned topics, English. Same categories, English stems. */
const EN_BANNED: readonly BannedRule[] = [
  // Weight. `stem('weigh')` also covers "weight", "weighs", "weighed".
  { category: 'weight', re: stem('weigh') },
  { category: 'weight', re: exact('kg|lb|lbs|pound|pounds') },
  { category: 'weight', re: stem('kilogram|overweight|underweight') },
  { category: 'weight', re: exact('fat|fatter|fattest|slim') },
  { category: 'weight', re: stem('skinny|chubby|obes|slimm') },
  // Body and appearance. Exact forms where a stem would over-match
  // ("butt" → "button").
  { category: 'body', re: stem('belly|bellies') },
  { category: 'body', re: exact('waist|waistline|butt|butts|thigh|thighs') },
  { category: 'body', re: stem('muscle|biceps|physique|appearance') },
  { category: 'body', re: stem('overeat|overate') },
  // Food and diets.
  { category: 'food', re: stem('diet|calorie') },
  { category: 'food', re: stem('fastfood|fast food|burger|pizza|donut|doughnut|snack') },
  { category: 'food', re: exact('food|foods') },
  { category: 'food', re: exact('eat|eats|ate|eaten|eating') },
  // Health and medicine.
  { category: 'health', re: stem('health') },
  { category: 'health', re: stem('disease|illness|hospital|doctor|medicin|medical') },
  { category: 'health', re: exact('sick|ill|pill|pills') },
  { category: 'health', re: stem('diagnos|symptom|injur|hangover') },
  { category: 'health', re: exact('pulse') },
  { category: 'health', re: stem('blood pressure|heart rate') },
  // Age. Exact forms only: `stem('age')` would catch "agenda" and "agent".
  { category: 'age', re: exact('age|ages|aged|aging|ageing') },
  { category: 'age', re: stem('elderly|pension|retiree|retirement') },
  // Money.
  { category: 'money', re: stem('salar|paycheck|payday') },
  { category: 'money', re: exact('income|incomes|wage|wages') },
  // Nationality and beliefs.
  { category: 'nationality', re: stem('nationalit|ethnic|migrant|immigrant|religio') },
  // Personal life. "dating" is exact: banning `stem('dat')` or "date" would
  // catch calendar dates.
  { category: 'personal', re: stem('divorc') },
  { category: 'personal', re: exact('wife|husband|girlfriend|boyfriend|lover|lovers|dating') },
  // Profanity.
  { category: 'profanity', re: stem('fuck|motherfuck|shit|bullshit') },
  { category: 'profanity', re: stem('asshole|arsehole|dickhead|douche|bastard') },
  { category: 'profanity', re: exact('ass|asses|arse|dick|dicks|crap|piss|pissed|bitch|bitches') },
  // Insults.
  { category: 'insult', re: stem('idiot|moron|cretin|imbecil|pathetic|worthless') },
  { category: 'insult', re: exact('stupid|dumb|dumber|dumbest|loser|losers|fool|fools') },
];

/**
 * Banned topics, Spanish. Patterns are written without diacritics — the
 * Spanish normalizer strips them before matching («engordó» → «engordo»).
 */
const ES_BANNED: readonly BannedRule[] = [
  // Weight. "pesar" (despite) stays allowed, verb forms are exact.
  { category: 'weight', re: exact('peso|pesos|pesa|pesan|pesaba|pesaban') },
  { category: 'weight', re: exact('kg|kilo|kilos') },
  { category: 'weight', re: stem('kilogramo|adelgaz|engord') },
  { category: 'weight', re: stem('gord|delgad|flac') },
  // Body and appearance.
  { category: 'body', re: stem('figur|barrig|panza|tripa|cintur') },
  { category: 'body', re: stem('muscul|bicep|gras|trasero|nalga|aparienc') },
  { category: 'body', re: exact('culo|culos|fisico|fisicos') },
  // Food and diets.
  { category: 'food', re: stem('diet|calori') },
  { category: 'food', re: stem('hamburgues|pizz|rosquill|bolleri|comilon') },
  { category: 'food', re: exact('comida|comidas') },
  { category: 'food', re: exact('come|comen|comer|comio|comia|comian|comido') },
  // Health and medicine. Exact 'salud' keeps «saluda» (greets) allowed.
  { category: 'health', re: exact('salud') },
  { category: 'health', re: stem('saludable|enferm') },
  { category: 'health', re: stem('hospital|doctor|pastilla|farmaci|medicament|medicin') },
  { category: 'health', re: exact('medico|medicos|medica|medicas') },
  { category: 'health', re: stem('diagnostic|sintoma|lesion|resaca') },
  { category: 'health', re: stem('pulso|cardiac|corazon') },
  { category: 'health', re: exact('tension|tensiones') },
  // Age.
  { category: 'age', re: exact('edad|edades|viejo|vieja|viejos|viejas') },
  { category: 'age', re: stem('ancian|jubil|envejec') },
  // Money.
  { category: 'money', re: stem('salari|sueldo') },
  { category: 'money', re: exact('nomina|nominas|ingresos') },
  // Nationality and beliefs.
  { category: 'nationality', re: stem('nacionalidad|etni|migrant|inmigrant|religi') },
  // Personal life.
  { category: 'personal', re: stem('divorci|amante|romance') },
  { category: 'personal', re: exact('novio|novia|novios|novias|esposo|esposa|marido') },
  // Profanity. 'cono' is «coño» after diacritics stripping; blocking the
  // homograph is acceptable over-blocking.
  { category: 'profanity', re: stem('joder|jodid|mierd|gilipoll|capull|carajo|cojon|pendej') },
  { category: 'profanity', re: stem('puta|puto|cabron|maricon') },
  { category: 'profanity', re: exact('cono|conos|marica|maricas|polla|pollas') },
  // Insults.
  { category: 'insult', re: stem('idiot|imbecil|estupid|inutil|patetic|fracasad|cretin') },
  { category: 'insult', re: exact('tonto|tonta|tontos|tontas') },
];

const RULES: Record<Locale, readonly BannedRule[]> = {
  ru: RU_BANNED,
  en: EN_BANNED,
  es: ES_BANNED,
};

/**
 * Per-locale normalization before matching: case must never help bypass the
 * filter. Russian folds «ё» to «е» (all patterns use «е»); Spanish strips
 * diacritics so patterns can be written in plain ASCII («médico» → «medico»).
 * NFD stripping is not applied to Russian: it would decompose «й» into «и»
 * and break exact word forms.
 */
const NORMALIZERS: Record<Locale, (text: string) => string> = {
  ru: (text) => text.toLowerCase().replace(/ё/g, 'е'),
  en: (text) => text.toLowerCase(),
  es: (text) => text.toLowerCase().normalize('NFD').replace(/\p{M}+/gu, ''),
};

const BANNED = RULES[LOCALE];
const normalize = NORMALIZERS[LOCALE];

/** The only allowed placeholder shape: `{{u1}}`, `{{u2}}`… */
const PLACEHOLDER = /\{\{u\d+\}\}/g;

/**
 * Rejection reason for the log, or `null` when the phrase is safe.
 * Codes: `empty`, `too_long`, `placeholder`, `banned:<category>`.
 */
export function rejectReason(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'empty';
  if (trimmed.length > MAX_HINT_LENGTH) return 'too_long';

  // Unclosed or foreign placeholders: after removing valid `{{uN}}` no curly
  // braces may remain — otherwise "{name}" would reach the screen.
  const withoutPlaceholders = trimmed.replace(PLACEHOLDER, '');
  if (withoutPlaceholders.includes('{') || withoutPlaceholders.includes('}')) {
    return 'placeholder';
  }

  const normalized = normalize(withoutPlaceholders);
  for (const rule of BANNED) {
    if (rule.re.test(normalized)) return `banned:${rule.category}`;
  }

  return null;
}

/** Quick check for call sites that do not need the reason. */
export function isSafe(text: string): boolean {
  return rejectReason(text) === null;
}
