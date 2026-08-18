import { plural } from '@/lib/i18n';

import type { TelegramTexts } from './types';

/** English bot content. Same spirit and variant count as the Russian original. */

const days = (n: number): string => plural({ one: '{count} day', other: '{count} days' }, n);

const workdays = (n: number): string =>
  plural({ one: '{count} working day', other: '{count} working days' }, n);

const freezesLine = (n: number): string =>
  plural({ one: '{count} freeze left.', other: '{count} freezes left.' }, n);

export const en: TelegramTexts = {
  startVariants: (i) => [
    `🚶 Off we go: ${i.speedKmh} km/h on “${i.treadmillName}”.`,
    `🚶 Started: “${i.treadmillName}”, ${i.speedKmh} km/h. The chair is on its own now.`,
    `🚶 “${i.treadmillName}” just came to life — ${i.speedKmh} km/h. If that's not you, the button is below.`,
  ],

  finishStats: (i) => `🏁 ${i.distance} km in ${i.duration} (${i.avgSpeedKmh} km/h).`,
  finishStreakTail: (streakDays) => ` Streak — ${days(streakDays)}.`,
  rankUpLine: (rank) => `📈 You climbed to place #${rank}.`,
  achievementLine: (title) => `🏅 New achievement: “${title}”`,
  finishClosingVariants: [
    'The chair got shut out today.',
    'The treadmill says thanks.',
    'Stats updated — the announcer approves.',
    'One more line in the chronicles of walking.',
  ],

  autocloseVariants: (h) => [
    `⏸ Walk closed automatically: ${h} hours passed and nobody ever hit “Finish”. The distance was not recorded.`,
    `⏸ The treadmill waited ${h} hours for the “Finish” button and gave up — walk closed automatically, distance not recorded.`,
    `⏸ The walk hung for over ${h} hours and was closed automatically. The kilometers were not recorded — hit “Finish” next time.`,
  ],

  busyMinutes: (min) => plural({ one: '{count} minute', other: '{count} minutes' }, min),
  busyHoursExact: (h) => plural({ one: '{count} hour', other: '{count} hours' }, h),
  busyHoursMinutes: (h, m) => `${h} h ${m} min`,
  busyTail: (busy) => ` — it was busy for ${busy}`,
  freeVariants: (i) => [
    `🟢 “${i.treadmillName}” just freed up${i.busyTail}. Who's first?`,
    `🟢 “${i.treadmillName}” is free again${i.busyTail}. The queue is gone — the moment is yours.`,
    `🟢 A spot on “${i.treadmillName}” opened up${i.busyTail}. Twenty minutes of walking won't walk themselves.`,
  ],

  allBusyVariants: [
    `🔴 No free treadmills right now. The bot will ping you the moment one opens up.`,
    `🔴 Not a single treadmill free — the office is walking at full capacity. Watch for the green light.`,
    `🔴 No point heading down yet: everything's taken. The chair celebrates, but not for long.`,
  ],

  remindStreakVariants: (i) => {
    const streak = days(i.streakDays);
    const idle = workdays(i.idleWorkdays);
    const freezes = freezesLine(i.freezesLeft);
    return [
      `Your ${streak} streak is on the line — today decides. ${freezes}`,
      `The treadmill has stood idle for ${idle}, staring out the window. The ${streak} streak is still intact — today is the last chance. ${freezes}`,
      `${idle} without walks, yet the ${streak} streak still holds. One session today — and it lives on. ${freezes}`,
    ];
  },
  remindIdleVariants: (n) => [
    `The treadmill hasn't seen you for ${workdays(n)}. It holds no grudge — it's just slowly gathering dust.`,
    `The chair is celebrating ${workdays(n)} of absolute rule. The treadmill proposes a coup.`,
    `${workdays(n)} of silence in the stats. Twenty minutes of walking — and the chart comes back to life.`,
  ],

  digestHeadVariants: (km) => [
    `Week closed: the team added ${km} km 🎉`,
    `Weekly recap: +${km} km to the shared total.`,
  ],
  digestHeadCityVariants: (km, city) => [
    `Week closed: the team added ${km} km. Latest mark on the route — ${city} 🎉`,
    `Weekly recap: +${km} km to the shared total. On the map the team passed the “${city}” mark.`,
    `Another ${km} km behind. The route says ${city} is already in the rearview.`,
  ],
  digestTopLine: (entries) => `Top 3: ${entries}.`,
  digestSelfLine: (rank, km) => `You're #${rank} (${km} km).`,
  digestSelfZeroVariants: [
    'Your week went by without kilometers — the new one starts with a clean slate.',
    'You logged 0.00 km this week. The treadmill is ready to fix that at any moment.',
  ],

  welcomeHelloVariants: (name) => [
    `Hi, ${name}! Telegram is linked — now the treadmill can text first.`,
    `${name}, you're connected! Card linked, channel open.`,
    `Done, ${name}: this chat now knows everything about your walks.`,
  ],
  welcomeBodyLines: [
    "What I'll send:",
    '• start — with an “It\'s not me” button, in case someone started for you',
    '• finish: kilometers, streak, achievements',
    '• a reminder when the treadmill gets bored',
    '• “treadmill freed up”, when all of them were busy',
    '• a weekly digest on Mondays',
    '',
    'Each category can be turned off separately: /settings. Pause — /mute, unlink — /stop.',
  ],
  relinkedVariants: (name) => [
    `The “${name}” card is now linked to another Telegram — notifications no longer come here. If that's a surprise, grab a fresh link in the app and put things back.`,
    `The link to the “${name}” card has moved to another chat. Notifications here are stopped; a fresh link from the app can bring it back.`,
  ],
  helpLines: (appName) => [
    "I don't do much, but it's all to the point:",
    '/settings — which notifications to send',
    '/mute — silence for a day, a week or forever',
    '/stop — unlink Telegram',
    '',
    `Everything else — start, finish, leaderboard — lives in the ${appName} app.`,
  ],
  farewellVariants: [
    'Unlinked. The treadmill holds no grudge — it rarely does. Want to come back — a fresh link awaits in the app.',
    'Link severed, stats intact. A new link lives in the member card, whenever you feel like it.',
    'Not a single message more. The treadmill will quietly miss you; the way back is in the app.',
  ],
  achievementUnlocked: (title) => `🏅 New achievement: “${title}”`,
  staleTokenVariants: [
    'The link is stale or already used. Grab a fresh one in the app — in the member card.',
    'That token has served its time: linking links are single-use. A new one awaits in the app, in the member card.',
  ],

  ui: {
    notLinked: (appName) =>
      `This chat is not linked to ${appName}. Grab a linking link in the app — it lives in the member card.`,
    settingsPrompt: '⚙️ Notification settings — tap to toggle:',
    settingsLabels: {
      start: 'Walk start',
      finish: 'Walk finish',
      remind: 'Reminders',
      free: 'Treadmill freed up',
      digest: 'Weekly digest',
      hints: 'Hints in messages',
    },
    mutePrompt: 'How long should notifications stay quiet?',
    muteDay: 'A day',
    muteWeek: 'A week',
    muteForever: 'Forever',
    mutedToast: 'Muted',
    cancelWalkButton: "It's not me — cancel",
    walkCancelledToast: 'Walk cancelled',
    walkNotActiveToast: 'The walk is no longer active',
    chatNotLinkedToast: 'Chat is not linked',
    fallbackUserName: 'member',
    fallbackTreadmillName: 'Treadmill',
    hintPrefix: 'P.S.',
  },
};
