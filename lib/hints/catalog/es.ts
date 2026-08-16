import type { StaticHint } from './types';

/**
 * Spanish static catalog. Mirrors `ru.ts` entry by entry: same order, same
 * tones, same spirit. Local idioms are adapted (e.g. Vladivostok becomes a
 * Madrid–Moscow walk). Participant gender is unknown by design, so phrases
 * addressed to the reader avoid gendered adjectives and participles. Every
 * phrase must stay within MAX_HINT_LENGTH and pass the Spanish filter.
 */
export const CATALOG_ES: readonly StaticHint[] = [
  { text: 'Una tortuga va a 0,27 km/h. Ganamos incluso a la velocidad mínima.', tone: 'neutral' },
  { text: 'Cada paseo es una pequeña victoria sobre la silla. El marcador sigue subiendo.', tone: 'praise' },
  { text: 'La cinta está ahí, mirándote. Ahora mismo. En silencio.', tone: 'tease' },
  { text: 'La silla nunca se cansa. Ese es precisamente su problema.', tone: 'tease' },
  { text: 'Caminar sin moverse del sitio es la única forma de sumar kilómetros sin salir de la oficina.', tone: 'neutral' },
  { text: 'El récord de inactividad de la cinta se actualiza solo, sin tu ayuda.', tone: 'tease' },
  { text: 'A 3–4 km/h se puede hablar en una reunión sin problema. Comprobado por colegas.', tone: 'tip' },
  { text: 'Apunta la distancia justo al terminar: en una hora ya no la recordarás.', tone: 'tip' },
  { text: 'Una cinta bajo la mesa no sustituye un paseo al aire libre. Pero 5 km al día son 5 km al día.', tone: 'tip' },
  { text: 'Empieza con 10 minutos. Una racha de paseos cortos vale más que uno heroico.', tone: 'tip' },
  { text: 'Más velocidad no es mejor: a 4 km/h se puede caminar y trabajar a la vez.', tone: 'tip' },
  { text: 'La racha cuenta días laborables: el fin de semana no la rompe. Descansa sin culpa.', tone: 'tip' },

  // Category 4: absurd statistics. Animals are the safest comparison source:
  // speed is measurable and nobody gets offended.
  { text: 'El perezoso alcanza 0,24 km/h. Incluso a velocidad mínima vas cuatro veces más rápido.', tone: 'neutral' },
  { text: 'Un caracol recorre 50 metros en una hora. A ti te basta un minuto.', tone: 'neutral' },
  { text: 'El avestruz corre a 70 km/h. Eso sí, trabajando en la mesa es un desastre.', tone: 'tease' },
  { text: 'El pingüino camina a 3,6 km/h. Exactamente tu ritmo durante una reunión.', tone: 'neutral' },
  { text: 'Un elefante pasea a 6 km/h. Alcanzarlo es perfectamente posible.', tone: 'neutral' },
  { text: 'Una gallina llega a 14 km/h. La cinta no da para tanto. Empate.', tone: 'tease' },
  { text: 'El guepardo aguanta 110 km/h veinte segundos. Tú aguantas 4 km/h cuarenta minutos.', tone: 'tease' },
  { text: 'La jirafa camina a 16 km/h y no dice nada en todo el trayecto. Algo que aprender.', tone: 'tease' },
  { text: 'Una ballena nada 100 km al día. Pero no tiene ni una sola fecha de entrega.', tone: 'neutral' },
  { text: 'La paloma vuela a 80 km/h. Caminar, en cambio, nunca lo aprendió del todo.', tone: 'tease' },
  { text: 'Un topo excava 20 metros por noche. Tú los caminas en quince segundos.', tone: 'neutral' },
  { text: 'El panda se mueve a 3 km/h y duerme diez horas. El primer punto ya lo dominas.', tone: 'tease' },
  { text: 'El koala duerme 22 horas al día. Con las dos restantes le sobra para todo su programa.', tone: 'tease' },
  { text: 'El armadillo corre a 48 km/h. Nadie lo esperaba, tú tampoco.', tone: 'neutral' },
  { text: 'Un perro de paseo recorre 8 km, 6 de ellos en círculos. Una estrategia conocida.', tone: 'tease' },
  { text: 'Una ardilla recorre 3 km al día por las ramas. Tu cinta es bastante más estable.', tone: 'neutral' },
  { text: 'El flamenco aguanta horas sobre una pata. La estrategia funciona, pero no da puntos.', tone: 'tease' },
  { text: 'La tortuga Jonathan lleva 190 años sin prisa alguna. Pero racha no tiene.', tone: 'tease' },
  { text: 'El canguro salta a 70 km/h. Caminando, en cambio, es de una torpeza notable.', tone: 'neutral' },
  { text: 'Un caracol gigante tiene el récord: 0,048 km/h. Hay récords de todo tipo.', tone: 'neutral' },
  { text: 'Los pingüinos de Adelia caminan 50 km hasta el nido. Y jamás escriben al chat.', tone: 'tease' },
  { text: 'El oso hormiguero camina a 1,6 km/h. Va más lento que tú, pero al menos tiene excusa.', tone: 'tease' },
  { text: 'El perezoso baja del árbol una vez por semana. Un calendario que a algunos les suena.', tone: 'tease' },
  { text: 'Una hormiga camina menos de un kilómetro en toda su vida. Tú la superaste antes del mediodía.', tone: 'neutral' },
  { text: 'Una caravana de camellos recorre 40 km al día. Y al camello nadie le escribe mensajes.', tone: 'neutral' },
  { text: 'El tiranosaurio se movía a unos 5 km/h. Vas literalmente a su ritmo.', tone: 'neutral' },

  // Distances, technology and history — the second pillar of the same category.
  { text: 'La vuelta a la Tierra son 40.075 km. A 5 km al día, 22 años. Mejor empezar hoy.', tone: 'neutral' },
  { text: 'A la Luna hay 384.400 km. A pie: 219 años sin un solo día libre.', tone: 'neutral' },
  { text: 'La cinta de correr se inventó en 1818 como castigo para presos. El progreso es evidente.', tone: 'tease' },
  { text: 'Los astronautas de la ISS caminan en la cinta con arneses. Tú tienes más suerte.', tone: 'neutral' },
  { text: 'Un camarero recorre unos 10 km por turno. Y ni un punto en la tabla.', tone: 'tease' },
  { text: 'Un legionario romano marchaba 30 km al día con todo el equipo. Tú tienes mesa y café.', tone: 'neutral' },
  { text: 'El Everest son 8.848 metros hacia arriba. Tu cinta es honestamente horizontal.', tone: 'neutral' },
  { text: 'Un maratón son 42,195 km. Ocho de tus cincos, pero sin multitud y sin medalla.', tone: 'neutral' },
  { text: 'Un cartero camina 12 km por turno. Tú tienes cinta y ni un solo perro.', tone: 'neutral' },
  { text: 'Una persona media da 4.000 pasos al día. La mitad, hasta la cafetera y de vuelta.', tone: 'tease' },
  { text: 'La meta de los 10.000 pasos la inventó un anuncio japonés de podómetros en 1965.', tone: 'neutral' },
  { text: 'Una hora a 4 km/h son unos 5.500 pasos. Sin darte cuenta y sin un solo acelerón.', tone: 'neutral' },
  { text: 'La escalera mecánica del metro va a 2,7 km/h. La cinta es más rápida y no te lleva a ningún sitio.', tone: 'neutral' },
  { text: 'En el ecuador, la Tierra gira a 1.670 km/h. Técnicamente ya estás en camino.', tone: 'tease' },
  { text: 'La Voyager 1 viaja a 61.000 km/h. Simplemente no tiene que volver a la reunión diaria.', tone: 'tease' },
  { text: 'Un peatón medio va a 5 km/h por la ciudad. En la cinta no hay semáforos.', tone: 'neutral' },
  { text: 'Un repartidor en patinete va a 25 km/h. Pero los puntos de la tabla te los llevas tú.', tone: 'tease' },
  { text: 'De Madrid a Moscú a pie son unos 3.400 km. A 5 km al día, casi dos años. Hay margen.', tone: 'neutral' },
  { text: 'Un robot aspirador recorre 300 metros por limpieza. Tú lo superaste antes del mediodía.', tone: 'neutral' },
  { text: 'Las agujas del reloj recorren 1,2 km al día sobre la esfera. Sin una sola pausa.', tone: 'neutral' },
  { text: 'El rover Curiosity recorrió 32 km en 13 años. Tú lo harás en una semana.', tone: 'neutral' },
  { text: 'El bambú crece 91 cm al día. Él crece, tú caminas. Los dos ocupados.', tone: 'neutral' },
  { text: 'El ascensor sube a 2 m/s. La escalera es más lenta, pero la escalera cuenta.', tone: 'tip' },

  // The treadmill, the chair and the leaderboard — same category, product-flavored.
  { text: 'La silla de oficina media recorre 0 km al año. Una constancia impresionante.', tone: 'tease' },
  { text: 'La cinta está ahí, mirando en silencio. Ahora mismo. Desde hace cuarenta minutos.', tone: 'tease' },
  { text: 'El récord de inactividad de la cinta se actualiza solo, sin intervención tuya.', tone: 'tease' },
  { text: 'La cinta no tiene sentido del humor, pero tiene contador. Y lo ve absolutamente todo.', tone: 'tease' },
  { text: 'Cada kilómetro no caminado se queda sin caminar. Las matemáticas no perdonan.', tone: 'tease' },
  { text: 'La cinta no recuerda que ayer no la encendiste. La tabla sí.', tone: 'tease' },

  // Category 5: real tips. Walking technique.
  { text: 'Camina despacio los dos primeros minutos. Es calentamiento, no tiempo perdido.', tone: 'tip' },
  { text: 'Baja el ritmo en los dos últimos minutos. Parar en seco corta la respiración.', tone: 'tip' },
  { text: 'No te agarres a las barandillas todo el rato: el paso se vuelve poco natural.', tone: 'tip' },
  { text: 'Mira al frente, no a los pies. El paso sale más uniforme y el cuello no se carga.', tone: 'tip' },
  { text: 'Pon la pantalla a la altura de los ojos. Si no, el cuello te dirá lo que piensa de ti.', tone: 'tip' },
  { text: 'Un calzado de suela blanda lo cambia todo. Las zapatillas de casa son mala idea.', tone: 'tip' },
  { text: '¿Cordones desatados? Para. La cinta te espera, palabra.', tone: 'tip' },
  { text: 'Si te aburres, cambia la velocidad un par de minutos. La monotonía cansa más que el ritmo.', tone: 'tip' },
  { text: 'Alterna trabajo en la silla y caminando. Ocho horas en la misma postura agotan igual.', tone: 'tip' },
  { text: 'En una sala fresca se camina mejor que en una calurosa. Abre la ventana antes de empezar.', tone: 'tip' },

  // What to do while on the treadmill.
  { text: 'Teclear caminando es difícil. Deja la cinta para leer, reuniones y pensar.', tone: 'tip' },
  { text: 'Llévate a la cinta una tarea de pensar. Caminar acelera las ideas notablemente.', tone: 'tip' },
  { text: 'No te lleves a la cinta tareas de teclear mucho. No va a funcionar.', tone: 'tip' },
  { text: 'Auriculares y un pódcast hacen invisibles cuarenta minutos. Compruébalo.', tone: 'tip' },
  { text: 'La música a 120 pulsaciones por minuto marca sola un paso cómodo y regular.', tone: 'tip' },
  { text: 'Hablar caminando suena con más energía. Los colegas de la reunión lo notan perfectamente.', tone: 'tip' },
  { text: 'Dos reuniones caminando ya son 4 km. Planifica el día con antelación.', tone: 'tip' },

  // How not to quit: habit, schedule, environment.
  { text: 'Pon el paseo en el calendario. Lo que no está en el calendario no suele ocurrir.', tone: 'tip' },
  { text: 'El paseo justo después de una reunión es el más fácil: ya estás de pie.', tone: 'tip' },
  { text: 'Dos paseos de 15 minutos suman lo mismo que uno de 30.', tone: 'tip' },
  { text: 'Decide cuánto vas a caminar antes de empezar. Decidirlo en marcha es parar antes.', tone: 'tip' },
  { text: 'Registra el paseo antes de sentarte. Después ya no hay quien se levante.', tone: 'tip' },
  { text: 'Si el día se desmorona, camina diez minutos. La racha importa más que cualquier récord.', tone: 'tip' },
  { text: 'El paseo de la mañana casi nunca se cancela. El de la tarde, muy a menudo.', tone: 'tip' },
  { text: 'Una cinta junto a la mesa se usa el triple que una en el rincón del fondo.', tone: 'tip' },
  { text: 'Queda con un colega para caminar a la misma hora. En pareja da apuro faltar.', tone: 'tip' },
  { text: 'Pon el aviso del paseo por la mañana: por la tarde lo pasarás sin mirarlo.', tone: 'tip' },
  { text: 'Ten un mínimo para días malos: 10 minutos. Cero y diez son números distintos.', tone: 'tip' },
  { text: 'La primera semana siempre cuesta más que la segunda. Después se convierte en hábito.', tone: 'tip' },
  { text: 'Pon un temporizador, no una alarma de final. Así ves cuánto queda.', tone: 'tip' },

  // Pace, numbers and working with the leaderboard.
  { text: 'No subas la velocidad cada día. Un ritmo constante da más kilómetros a la semana.', tone: 'tip' },
  { text: 'No persigas el ritmo de otros. La tabla cuenta kilómetros, no heroísmo.', tone: 'tip' },
  { text: '¿Olvidaste encender la cinta? Calcula por tiempo. Aproximado es mejor que nada.', tone: 'tip' },
  { text: 'Apunta la distancia con honestidad. Una tabla sin confianza no sirve de nada.', tone: 'tip' },
  { text: '¿Un día perdido? No empieces desde cero. Simplemente camina hoy.', tone: 'tip' },
  { text: 'Cuenta días, no récords. La regularidad gana a la intensidad.', tone: 'tip' },
  { text: 'Mira las estadísticas una vez por semana, no cada hora. Así se ve el progreso.', tone: 'tip' },
  { text: 'Registra incluso el paseo fallido. Cinco minutos también son una fila en la tabla.', tone: 'tip' },
  { text: 'Limpia la cinta al terminar. El siguiente usuario sueles ser tú.', tone: 'tip' },
  { text: 'Un buen paseo es el que ocurrió. Lo demás son detalles.', tone: 'tip' },

  // Praise: works as the closing note of the feed.
  { text: 'Cinco kilómetros hoy son cinco kilómetros que ayer no existían.', tone: 'praise' },
  { text: 'La racha no se mantiene sola. La mantienes tú, día a día.', tone: 'praise' },
  { text: 'Ya vas por delante de todos los que siguen pensando empezar el lunes.', tone: 'praise' },
  { text: 'Cada día de racha es una decisión aparte. Hoy la has tomado.', tone: 'praise' },
  { text: 'La cinta está encendida: lo más difícil de hoy ya está hecho.', tone: 'praise' },
];
