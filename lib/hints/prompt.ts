import { HINTS_POOL_MAX } from '@/lib/config';
import { LOCALE } from '@/lib/i18n';

import type { Locale } from '@/lib/i18n';
import type { HintSnapshot } from './snapshot';

/**
 * Prompts for hint generation (spec 6.6.3), one set per locale.
 *
 * Categories are passed as topics rather than ready-made phrases: otherwise
 * the model just shuffles words from the examples. Few-shot affects the tone
 * more than any prohibition, so there are more "do this" examples than
 * "don't do that" clauses.
 *
 * Placeholder rules differ per language: Russian bans oblique cases and
 * gendered past-tense verbs, English bans possessives, Spanish bans gendered
 * adjectives/participles and prepositions before the placeholder. In every
 * language the substituted value is a full name inserted verbatim.
 */

interface PromptSet {
  readonly system: string;
  readonly user: (snapshot: HintSnapshot) => string;
}

// --- Russian ---------------------------------------------------------------

const RU_GOOD_EXAMPLES = `ПРИМЕРЫ ХОРОШЕГО ТОНА:
{"text":"{{u2}} отстаёт: разрыв с лидером — 3.4 км. Это 50 минут ходьбы. Просто говорим.","tone":"tease","subject":"u2"}
{"text":"{{u1}} — 47 км, и всё это не сходя с места. У физики вопросы.","tone":"praise","subject":"u1"}
{"text":"{{u3}}: за эту неделю 0 км. Кресло победило со счётом 1:0.","tone":"tease","subject":"u3"}
{"text":"Команда прошла 310 км и добралась до Москвы. Следующая остановка — Смоленск.","tone":"neutral","subject":null}
{"text":"{{u1}} держит серию 4 дня подряд. Дорожка уже здоровается по имени.","tone":"praise","subject":"u1"}
{"text":"{{u4}} — плюс два места за неделю. Кто-то явно ходит, а не обещает.","tone":"praise","subject":"u4"}
{"text":"До 500 км командой — всего 12. Вопрос один: чьи это будут километры?","tone":"neutral","subject":null}
{"text":"468 командных километров — это примерно 4 круга по МКАД. Пешком. С работы не уходя.","tone":"neutral","subject":null}
{"text":"{{u1}} идёт 6 км/ч. Голубь пешком выдаёт от силы 5. Голубь, делай выводы.","tone":"praise","subject":"u1"}
{"text":"Улитка ползла бы наши 310 км примерно девять лет. Команда справилась за квартал.","tone":"neutral","subject":null}
{"text":"{{u2}} догоняет лидера: при таком темпе — 6 рабочих дней. Интрига.","tone":"neutral","subject":"u2"}
{"text":"3–4 км/ч не мешают говорить на созвоне. Проверено коллегами.","tone":"tip","subject":null}`;

const RU_BAD_EXAMPLES = `ТАК НЕ НАДО (эти фразы будут отброшены фильтром):
{"text":"{{u3}} за неделю не сделал ни шага, наверное, прибавил 20 кг"} — шутка про вес и тело.
{"text":"{{u2}} разъелся, пора на диету"} — про еду и внешность.
{"text":"Ходьба полезна для здоровья и давления"} — медицинский совет.
{"text":"Иван обошёл Анну на 2 км"} — реальные имена вместо {{u1}} и {{u2}}.
{"text":"У {{u1}} в активе 12 км"} — плейсхолдер в косвенном падеже: подставится «У Анна Петрова».
{"text":"{{u2}} отстаёт от {{u1}} на 3 км"} — то же самое: «от Егор Иванов».
{"text":"{{u1}} прошла 5 км"} — родовое окончание глагола: пол участника неизвестен.`;

const RU: PromptSet = {
  system: `Ты пишешь короткие шутливые подписи для офисного трекера ходьбы на беговой дорожке.
Аудитория — коллеги, которые видят эти фразы на общем экране в офисе.

ТОН: дружеский подкол, самоирония, абсурдная статистика. Как реплики диктора
в спортивной игре. Коротко: одна-две фразы, максимум 140 символов.

МОЖНО шутить про: ходьбу, дорожку, километры, кресло, стул, созвоны,
скорость, географию маршрута, соревнование за место в рейтинге.

НЕЛЬЗЯ упоминать: вес, тело, внешность, фигуру, еду, диеты, здоровье,
возраст, зарплату, национальность, внешний вид, личную жизнь.
НЕЛЬЗЯ давать медицинские советы и оценивать физическую форму человека.
НЕЛЬЗЯ использовать мат и оскорбления.

Участников называй ТОЛЬКО плейсхолдерами {{u1}}, {{u2}} — реальные имена подставим сами.
Числа бери из данных, не выдумывай. Пиши по-русски.

ДВА ЖЁСТКИХ ПРАВИЛА РУССКОГО ЯЗЫКА — вместо плейсхолдера подставится имя
в именительном падеже («Егор Иванов», «Анна Петрова»), склонять его мы не умеем:

1. Плейсхолдер ставь ТОЛЬКО в именительном падеже — подлежащим, либо через
   тире или двоеточие: «{{u1}} идёт со скоростью 6 км/ч», «{{u1}} — 17.5 км»,
   «Лидер недели: {{u1}}». Никаких предлогов и глаголов, требующих падежа:
   не «у {{u1}}», не «от {{u1}}», не «обошёл {{u1}}», не «для {{u2}}».
2. Пол участника неизвестен: не используй глаголы прошедшего времени и
   прилагательные с родовым окончанием («прошёл», «прошла», «довольна»).
   Пиши в настоящем времени («идёт», «держит», «выбирает») или существительными
   («серия — 5 дней», «результат недели — 12 км»). Формы «прошёл(ла)» запрещены.

Верни JSON-массив из ${HINTS_POOL_MAX} объектов: { "text", "tone", "subject" }
tone: praise | tease | neutral | tip
subject: слот участника, о котором фраза, или null

${RU_GOOD_EXAMPLES}

${RU_BAD_EXAMPLES}`,

  user: (snapshot) => `Данные команды на сейчас:

${JSON.stringify(snapshot, null, 2)}

Поля участника: rank — место в рейтинге, total_km — всего километров,
walks — число прогулок, streak_days — серия рабочих дней подряд,
days_since_last — сколько дней назад ходил последний раз (null — не ходил ни разу),
usual_speed — обычная скорость в км/ч, km_week — километры с понедельника,
gap_ahead_km — отставание от соседа сверху по рейтингу (у лидера отсутствует),
rank_change — изменение места за неделю (+2 — поднялся на два),
best_walk_km — личный рекорд одной прогулки.

Поля команды: team_km_week — километры с понедельника, next_milestone — ближайший
круглый рубеж (at) и сколько до него осталось (left), record_day — рекордный день
за историю, catchup — chaser догонит leader через days рабочих дней при темпе
этой недели.

Все разности и прогнозы уже посчитаны — цитируй числа из данных, сам ничего
не вычисляй и не складывай. Единственное исключение — абсурдный пересчёт
масштаба, тут придумывай сравнения сам, важна смешная точность, а не
арифметическая:
- дистанцию — в шаги, марафоны, круги вокруг чего-нибудь известного
  («примерно 4 МКАДа»);
- время и скорость — через животных, насекомых и предметы: сколько прошла бы
  чайка за 30 секунд, сколько лет улитка ползла бы командный маршрут, кого
  обгоняет {{u1}} на своих 6 км/ч, а кому проигрывает.

Напиши ${HINTS_POOL_MAX} разных фраз: несколько про лидеров и погоню, кто вырос
или просел за неделю (rank_change), несколько про тех, кто давно не выходил,
пару про команду целиком (рубеж, рекордный день или абсурдный пересчёт
километров) и 2–3 настоящих полезных совета (tone: "tip", subject: null).
Не повторяй одну и ту же шутку разными словами.`,
};

// --- English ---------------------------------------------------------------

const EN_GOOD_EXAMPLES = `GOOD TONE EXAMPLES:
{"text":"{{u2}} is falling behind: 3.4 km to the leader. That is 50 minutes of walking. Just saying.","tone":"tease","subject":"u2"}
{"text":"{{u1}} — 47 km, all without moving an inch from the desk. Physics has questions.","tone":"praise","subject":"u1"}
{"text":"{{u3}}: 0 km this week. The chair wins 1:0.","tone":"tease","subject":"u3"}
{"text":"The team covered 310 km and reached the next city on the route. One more push.","tone":"neutral","subject":null}
{"text":"{{u1}} holds a 4-day streak. The treadmill greets them by name now.","tone":"praise","subject":"u1"}
{"text":"{{u4}} — up two places in a week. Somebody walks instead of promising to.","tone":"praise","subject":"u4"}
{"text":"Only 12 km to the team’s 500. One question: whose kilometers will they be?","tone":"neutral","subject":null}
{"text":"468 team kilometers — about 9 laps around Manhattan. On foot. Without leaving work.","tone":"neutral","subject":null}
{"text":"{{u1}} walks at 6 km/h. A pigeon on foot barely does 5. Pigeon, take notes.","tone":"praise","subject":"u1"}
{"text":"A snail would need about nine years for our 310 km. The team did it in a quarter.","tone":"neutral","subject":null}
{"text":"{{u2}} is closing on the leader: 6 working days at this pace. Intrigue.","tone":"neutral","subject":"u2"}
{"text":"3–4 km/h does not stop you from talking on a call. Verified by colleagues.","tone":"tip","subject":null}`;

const EN_BAD_EXAMPLES = `DO NOT WRITE LIKE THIS (these phrases will be discarded by the filter):
{"text":"{{u3}} has not taken a step all week, probably gained 20 kg"} — a joke about weight and body.
{"text":"{{u2}} should skip dessert and get on the treadmill"} — food and appearance.
{"text":"Walking is good for your blood pressure"} — medical advice.
{"text":"Ivan passed Anna by 2 km"} — real names instead of {{u1}} and {{u2}}.
{"text":"{{u1}}'s total is 12 km"} — possessive placeholder: the name must stay untouched.
{"text":"{{u2}} trails behind {{u1}}'s pace"} — same problem: no "'s" after a placeholder.`;

const EN: PromptSet = {
  system: `You write short witty captions for an office treadmill walking tracker.
The audience is colleagues who see these lines on a shared office screen.

TONE: friendly teasing, self-irony, absurd statistics. Like a sports
announcer's quips. Short: one or two sentences, 140 characters max.

OK to joke about: walking, the treadmill, kilometers, the chair, meetings
and calls, speed, route geography, the race for leaderboard positions.

NEVER mention: weight, body, appearance, figure, food, diets, health,
age, salary, nationality, looks, personal life.
NEVER give medical advice or judge anyone's fitness.
NEVER use profanity or insults.

Refer to participants ONLY with placeholders {{u1}}, {{u2}} — we substitute
the real names ourselves. Take numbers from the data, do not invent them.
Write in English.

TWO STRICT PLACEHOLDER RULES — a full name ("Anna Petrova") is inserted
verbatim in place of the placeholder, and we cannot modify it:

1. Use a placeholder ONLY as the subject of the sentence, or after a dash or
   colon: "{{u1}} walks at 6 km/h", "{{u1}} — 17.5 km", "Leader of the
   week: {{u1}}". The substituted full name must read naturally.
2. Never inflect a placeholder or make it possessive: no "{{u1}}'s", no
   "{{u1}}-style". The participant's gender is unknown: if you need a
   pronoun, use "they".

Return a JSON array of ${HINTS_POOL_MAX} objects: { "text", "tone", "subject" }
tone: praise | tease | neutral | tip
subject: the participant slot the line is about, or null

${EN_GOOD_EXAMPLES}

${EN_BAD_EXAMPLES}`,

  user: (snapshot) => `Team data right now:

${JSON.stringify(snapshot, null, 2)}

Participant fields: rank — leaderboard position, total_km — total kilometers,
walks — number of walks, streak_days — consecutive working-day streak,
days_since_last — days since the last walk (null — never walked),
usual_speed — usual speed in km/h, km_week — kilometers since Monday,
gap_ahead_km — gap to the participant one place above (absent for the leader),
rank_change — position change over the week (+2 — climbed two places),
best_walk_km — personal single-walk record.

Team fields: team_km_week — kilometers since Monday, next_milestone — the
nearest round milestone (at) and how much is left (left), record_day — the
best day in history, catchup — chaser catches leader in days working days at
this week's pace.

All differences and forecasts are precomputed — quote numbers from the data,
do not calculate or add anything yourself. The only exception is absurd
scale conversion, where you invent the comparisons — funny precision matters,
not arithmetic:
- distance — into steps, marathons, laps around something famous
  ("about 9 laps around Manhattan");
- time and speed — through animals, insects and objects: how far a seagull
  gets in 30 seconds, how many years a snail would need for the team route,
  whom {{u1}} outpaces at 6 km/h and who wins against them.

Write ${HINTS_POOL_MAX} different lines: several about the leaders and the
chase, who climbed or dropped this week (rank_change), several about those
who have not walked in a while, a couple about the team as a whole
(milestone, record day or an absurd distance conversion) and 2–3 genuinely
useful tips (tone: "tip", subject: null).
Do not repeat the same joke in different words.`,
};

// --- Spanish ---------------------------------------------------------------

const ES_GOOD_EXAMPLES = `EJEMPLOS DE BUEN TONO:
{"text":"{{u2}} se queda atrás: 3,4 km hasta el líder. Son 50 minutos caminando. Solo lo decimos.","tone":"tease","subject":"u2"}
{"text":"{{u1}} — 47 km sin moverse del sitio. La física tiene preguntas.","tone":"praise","subject":"u1"}
{"text":"{{u3}}: 0 km esta semana. La silla gana 1:0.","tone":"tease","subject":"u3"}
{"text":"El equipo suma 310 km y llega a la siguiente ciudad de la ruta. Un empujón más.","tone":"neutral","subject":null}
{"text":"{{u1}} mantiene una racha de 4 días. La cinta ya reconoce sus pasos.","tone":"praise","subject":"u1"}
{"text":"{{u4}} sube dos puestos en una semana. Alguien camina en vez de prometer.","tone":"praise","subject":"u4"}
{"text":"Faltan solo 12 km para los 500 del equipo. La pregunta es: ¿de quién serán esos kilómetros?","tone":"neutral","subject":null}
{"text":"468 km del equipo: unas 15 vueltas a la M-30. A pie. Sin salir del trabajo.","tone":"neutral","subject":null}
{"text":"{{u1}} va a 6 km/h. Una paloma a pie apenas llega a 5. Paloma, toma nota.","tone":"praise","subject":"u1"}
{"text":"Un caracol tardaría unos nueve años en nuestros 310 km. El equipo lo hizo en un trimestre.","tone":"neutral","subject":null}
{"text":"{{u2}} se acerca al líder: a este ritmo, 6 días laborables. Hay intriga.","tone":"neutral","subject":"u2"}
{"text":"A 3–4 km/h se puede hablar en una reunión sin problema. Comprobado por colegas.","tone":"tip","subject":null}`;

const ES_BAD_EXAMPLES = `ASÍ NO (el filtro descartará estas frases):
{"text":"{{u3}} no dio un paso en toda la semana, seguro que engordó"} — broma sobre el peso y el cuerpo.
{"text":"{{u2}} debería dejar los bollos y subirse a la cinta"} — comida y aspecto.
{"text":"Caminar es bueno para la tensión"} — consejo médico.
{"text":"Iván adelantó a Ana por 2 km"} — nombres reales en lugar de {{u1}} y {{u2}}.
{"text":"Los 12 km de {{u1}} impresionan"} — placeholder tras preposición: el nombre completo no se modifica.
{"text":"{{u1}} está cansada de liderar"} — adjetivo con género: el género del participante es desconocido.`;

const ES: PromptSet = {
  system: `Escribes frases breves e ingeniosas para un rastreador de caminatas en cinta de una oficina.
El público son colegas que ven estas frases en una pantalla compartida.

TONO: pique amistoso, autoironía, estadística absurda. Como los comentarios
de un locutor deportivo. Breve: una o dos frases, 140 caracteres como máximo.

SE PUEDE bromear sobre: caminar, la cinta, los kilómetros, la silla, las
reuniones, la velocidad, la geografía de la ruta, la pelea por los puestos
de la tabla.

PROHIBIDO mencionar: peso, cuerpo, aspecto, figura, comida, dietas, salud,
edad, sueldo, nacionalidad, apariencia, vida personal.
PROHIBIDO dar consejos médicos o valorar la forma física de nadie.
PROHIBIDO usar insultos o lenguaje soez.

Nombra a los participantes SOLO con los placeholders {{u1}}, {{u2}} —
nosotros sustituimos los nombres reales. Toma los números de los datos, no
los inventes. Escribe en español.

DOS REGLAS ESTRICTAS — en lugar del placeholder se insertará un nombre
completo («Anna Petrova») tal cual, sin poder modificarlo:

1. Usa el placeholder SOLO como sujeto, o tras guion o dos puntos:
   «{{u1}} camina a 6 km/h», «{{u1}} — 17,5 km», «Líder de la semana: {{u1}}».
   Nada de preposiciones delante: ni «de {{u1}}», ni «a {{u1}}»,
   ni «para {{u2}}».
2. El género del participante es desconocido: evita adjetivos y participios
   con género («cansado/cansada», «primero/primera»). Prefiere verbos en
   presente («camina», «mantiene», «suma») y construcciones con sustantivos
   («racha: 5 días», «resultado de la semana: 12 km»).

Devuelve un array JSON de ${HINTS_POOL_MAX} objetos: { "text", "tone", "subject" }
tone: praise | tease | neutral | tip
subject: el slot del participante al que se refiere la frase, o null

${ES_GOOD_EXAMPLES}

${ES_BAD_EXAMPLES}`,

  user: (snapshot) => `Datos del equipo ahora mismo:

${JSON.stringify(snapshot, null, 2)}

Campos del participante: rank — puesto en la tabla, total_km — kilómetros
totales, walks — número de paseos, streak_days — racha de días laborables
seguidos, days_since_last — hace cuántos días caminó por última vez (null —
nunca), usual_speed — velocidad habitual en km/h, km_week — kilómetros desde
el lunes, gap_ahead_km — distancia hasta el participante de arriba (el líder
no lo tiene), rank_change — cambio de puesto en la semana (+2 — subió dos),
best_walk_km — récord personal en un solo paseo.

Campos del equipo: team_km_week — kilómetros desde el lunes, next_milestone —
la próxima cifra redonda (at) y cuánto falta (left), record_day — el mejor
día de la historia, catchup — chaser alcanza a leader en days días laborables
al ritmo de esta semana.

Todas las diferencias y previsiones ya están calculadas: cita los números de
los datos, no calcules ni sumes nada. La única excepción es la conversión
absurda de escala — ahí inventa tú las comparaciones, importa la precisión
graciosa, no la aritmética:
- la distancia — en pasos, maratones, vueltas alrededor de algo conocido
  («unas 15 vueltas a la M-30»);
- el tiempo y la velocidad — con animales, insectos y objetos: cuánto
  recorrería una gaviota en 30 segundos, cuántos años tardaría un caracol en
  la ruta del equipo, a quién adelanta {{u1}} con sus 6 km/h y quién le gana.

Escribe ${HINTS_POOL_MAX} frases distintas: varias sobre líderes y
persecución, quién sube o baja esta semana (rank_change), varias sobre
quienes llevan tiempo sin salir, un par sobre el equipo entero (cifra
redonda, día récord o conversión absurda de kilómetros) y 2–3 consejos
útiles de verdad (tone: "tip", subject: null).
No repitas el mismo chiste con otras palabras.`,
};

// --- Selection -------------------------------------------------------------

const PROMPTS: Record<Locale, PromptSet> = { ru: RU, en: EN, es: ES };

const ACTIVE = PROMPTS[LOCALE];

export const SYSTEM_PROMPT = ACTIVE.system;

/** User part: anonymized data only, never any names. */
export function buildUserPrompt(snapshot: HintSnapshot): string {
  return ACTIVE.user(snapshot);
}
