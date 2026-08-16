import { plural } from '@/lib/i18n';

import type { TelegramTexts } from './types';

/** Spanish bot content. Same spirit and variant count as the Russian original. */

const days = (n: number): string =>
  plural({ one: '{count} día', many: '{count} días', other: '{count} días' }, n);

const workdays = (n: number): string =>
  plural(
    { one: '{count} día laborable', many: '{count} días laborables', other: '{count} días laborables' },
    n,
  );

const freezesLine = (n: number): string =>
  plural(
    {
      one: 'Queda {count} congelación.',
      many: 'Quedan {count} congelaciones.',
      other: 'Quedan {count} congelaciones.',
    },
    n,
  );

export const es: TelegramTexts = {
  startVariants: (i) => [
    `🚶 Vamos: ${i.speedKmh} km/h en «${i.treadmillName}».`,
    `🚶 En marcha: «${i.treadmillName}», ${i.speedKmh} km/h. La silla se queda sola.`,
    `🚶 «${i.treadmillName}» se ha puesto en movimiento — ${i.speedKmh} km/h. Si no eres tú, el botón está abajo.`,
  ],

  finishStats: (i) => `🏁 ${i.distance} km en ${i.duration} (${i.avgSpeedKmh} km/h).`,
  finishStreakTail: (streakDays) => ` Racha — ${days(streakDays)}.`,
  rankUpLine: (rank) => `📈 Subiste al puesto ${rank}.`,
  achievementLine: (title) => `🏅 Nuevo logro: «${title}»`,
  finishClosingVariants: [
    'La silla hoy perdió por goleada.',
    'La cinta te manda las gracias.',
    'Estadística actualizada — el locutor está contento.',
    'Una línea más en la crónica del caminar.',
  ],

  autocloseVariants: (h) => [
    `⏸ Caminata cerrada automáticamente: pasaron ${h} horas y nadie pulsó «Finalizar». La distancia no quedó registrada.`,
    `⏸ La cinta esperó ${h} horas el botón «Finalizar» y se rindió — caminata cerrada automáticamente, distancia sin registrar.`,
    `⏸ La caminata quedó colgada más de ${h} horas y se cerró automáticamente. Los kilómetros no se registraron — la próxima vez pulsa «Finalizar».`,
  ],

  busyMinutes: (min) =>
    plural({ one: '{count} minuto', many: '{count} minutos', other: '{count} minutos' }, min),
  busyHoursExact: (h) =>
    plural({ one: '{count} hora', many: '{count} horas', other: '{count} horas' }, h),
  busyHoursMinutes: (h, m) => `${h} h ${m} min`,
  busyTail: (busy) => ` — estuvo ocupada ${busy}`,
  freeVariants: (i) => [
    `🟢 «${i.treadmillName}» acaba de quedar libre${i.busyTail}. ¿Quién llega primero?`,
    `🟢 «${i.treadmillName}» está libre otra vez${i.busyTail}. La cola desapareció — el momento es tuyo.`,
    `🟢 Se liberó un hueco en «${i.treadmillName}»${i.busyTail}. Veinte minutos de paso no se caminan solos.`,
  ],

  remindStreakVariants: (i) => {
    const streak = days(i.streakDays);
    const idle = workdays(i.idleWorkdays);
    const freezes = freezesLine(i.freezesLeft);
    return [
      `Tu racha de ${streak} está en juego — hoy se decide. ${freezes}`,
      `La cinta lleva ${idle} parada mirando por la ventana. La racha de ${streak} sigue viva — hoy es la última oportunidad. ${freezes}`,
      `${idle} sin caminatas y la racha de ${streak} aún aguanta. Una sesión hoy — y sigue viva. ${freezes}`,
    ];
  },
  remindIdleVariants: (n) => [
    `La cinta no te ve desde hace ${workdays(n)}. No se ofende — solo se va cubriendo de polvo poco a poco.`,
    `La silla celebra ${workdays(n)} de poder absoluto. La cinta propone un golpe de estado.`,
    `${workdays(n)} de silencio en la estadística. Veinte minutos de paso — y la gráfica revive.`,
  ],

  digestHeadVariants: (km) => [
    `Semana cerrada: el equipo sumó ${km} km 🎉`,
    `Resumen semanal: +${km} km al total común.`,
  ],
  digestHeadCityVariants: (km, city) => [
    `Semana cerrada: el equipo sumó ${km} km. Última marca en la ruta — ${city} 🎉`,
    `Resumen semanal: +${km} km al total común. En el mapa el equipo pasó la marca «${city}».`,
    `Otros ${km} km atrás. La ruta indica: ${city} ya quedó a la espalda.`,
  ],
  digestTopLine: (entries) => `Top 3: ${entries}.`,
  digestSelfLine: (rank, km) => `Eres el n.º ${rank} (${km} km).`,
  digestSelfZeroVariants: [
    'Tu semana pasó sin kilómetros — la nueva empieza con la hoja en blanco.',
    'Esta semana llevas 0.00 km. La cinta está lista para arreglarlo en cualquier momento.',
  ],

  welcomeHelloVariants: (name) => [
    `¡Hola, ${name}! Telegram vinculado — ahora la cinta puede escribir primero.`,
    `¡${name}, en línea! Tarjeta vinculada, canal abierto.`,
    `Listo, ${name}: este chat ya lo sabe todo sobre tus caminatas.`,
  ],
  welcomeBodyLines: [
    'Qué te enviaré:',
    '• inicio — con el botón «No soy yo», por si alguien empezó por ti',
    '• final: kilómetros, racha, logros',
    '• un recordatorio si la cinta se aburre',
    '• «cinta libre», cuando estaban todas ocupadas',
    '• el resumen semanal los lunes',
    '',
    'Cada categoría se apaga por separado: /settings. Pausa — /mute, desvincular — /stop.',
  ],
  relinkedVariants: (name) => [
    `La tarjeta «${name}» ahora está vinculada a otro Telegram — las notificaciones ya no llegan aquí. Si es una sorpresa, toma un enlace nuevo en la app y déjalo todo como estaba.`,
    `El vínculo con la tarjeta «${name}» se mudó a otro chat. Las notificaciones aquí están detenidas; puedes recuperar el vínculo con un enlace nuevo desde la app.`,
  ],
  helpLines: (appName) => [
    'Sé hacer poco, pero al grano:',
    '/settings — qué notificaciones enviar',
    '/mute — silenciar por un día, una semana o para siempre',
    '/stop — desvincular Telegram',
    '',
    `Todo lo demás — inicio, final, ranking — vive en la app ${appName}.`,
  ],
  farewellVariants: [
    'Desvinculado. La cinta no se ofende — casi nunca lo hace. Si quieres volver, un enlace nuevo te espera en la app.',
    'Vínculo roto, estadística intacta. El enlace nuevo está en la tarjeta del participante, cuando te animes.',
    'Ni un mensaje más. La cinta te echará de menos en silencio; el enlace de regreso está en la app.',
  ],
  achievementUnlocked: (title) => `🏅 Nuevo logro: «${title}»`,
  staleTokenVariants: [
    'El enlace caducó o ya fue usado. Toma uno nuevo en la app — en la tarjeta del participante.',
    'Ese token ya cumplió su ciclo: los enlaces de vinculación son de un solo uso. Uno nuevo te espera en la app, en la tarjeta del participante.',
  ],

  ui: {
    notLinked: (appName) =>
      `Este chat no está vinculado a ${appName}. Toma el enlace de vinculación en la app — vive en la tarjeta del participante.`,
    settingsPrompt: '⚙️ Ajustes de notificaciones — toca para alternar:',
    settingsLabels: {
      start: 'Inicio de caminata',
      finish: 'Final de caminata',
      remind: 'Recordatorios',
      free: 'Cinta libre',
      digest: 'Resumen semanal',
      hints: 'Pistas en los mensajes',
    },
    mutePrompt: '¿Por cuánto tiempo silencio las notificaciones?',
    muteDay: 'Un día',
    muteWeek: 'Una semana',
    muteForever: 'Para siempre',
    mutedToast: 'Silenciado',
    cancelWalkButton: 'No soy yo — cancelar',
    walkCancelledToast: 'Caminata cancelada',
    walkNotActiveToast: 'La caminata ya no está activa',
    chatNotLinkedToast: 'Chat no vinculado',
    fallbackUserName: 'participante',
    fallbackTreadmillName: 'Cinta',
    hintPrefix: 'P. D.',
  },
};
