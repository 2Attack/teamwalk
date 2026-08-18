/**
 * Per-locale content for the Telegram bot. The builders in `../texts.ts` own
 * all branching (rank improved, streak present, busy tail omitted…) and pick a
 * random variant; locale modules only provide phrases and plural composition.
 *
 * Tone contract (see TZ 6.6): jokes about walking, the treadmill, the chair
 * and stats only — never about body, weight, food, health or age. Every event
 * keeps the same number of variants across locales.
 */

/** Short UI strings: inline buttons, callback toasts, menu labels. */
export interface TelegramUiTexts {
  /** Reply for chats without a link; token lives in the app. */
  notLinked(appName: string): string;
  /** Header above the `/settings` toggles keyboard. */
  settingsPrompt: string;
  /** Labels of the `/settings` category toggles. */
  settingsLabels: {
    start: string;
    finish: string;
    remind: string;
    free: string;
    digest: string;
    hints: string;
  };
  /** Question above the `/mute` duration keyboard. */
  mutePrompt: string;
  muteDay: string;
  muteWeek: string;
  muteForever: string;
  /** Toast after a `/mute` option is chosen. */
  mutedToast: string;
  /** Inline button under the walk-start message. */
  cancelWalkButton: string;
  walkCancelledToast: string;
  walkNotActiveToast: string;
  chatNotLinkedToast: string;
  /** Fallback for a missing user name. */
  fallbackUserName: string;
  /** Fallback for a missing treadmill name. */
  fallbackTreadmillName: string;
  /** Postscript marker before an attached hint ("P.S."). */
  hintPrefix: string;
}

/** Message content of one locale; consumed only by `lib/telegram/texts.ts`. */
export interface TelegramTexts {
  startVariants(i: { speedKmh: number; treadmillName: string }): readonly string[];

  finishStats(i: { distance: string; duration: string; avgSpeedKmh: number }): string;
  /** Appended to the stats line when the streak is alive; starts with a space. */
  finishStreakTail(streakDays: number): string;
  /** Line for an improved leaderboard position. */
  rankUpLine(rank: number): string;
  /** One line per new achievement inside the finish message. */
  achievementLine(title: string): string;
  finishClosingVariants: readonly string[];

  autocloseVariants(staleHours: number): readonly string[];

  /** "40 minutes" — busy duration under an hour. */
  busyMinutes(minutes: number): string;
  /** "8 hours" — whole hours. */
  busyHoursExact(hours: number): string;
  /** "1 h 20 min" — hours with a minute remainder. */
  busyHoursMinutes(hours: number, minutes: number): string;
  /** " — was busy for 40 minutes"; starts with the separator. */
  busyTail(busy: string): string;
  freeVariants(i: { treadmillName: string; busyTail: string }): readonly string[];
  /** Last free treadmill taken; count-neutral — must hold for 1 or N units. */
  allBusyVariants: readonly string[];

  remindStreakVariants(i: {
    idleWorkdays: number;
    streakDays: number;
    freezesLeft: number;
  }): readonly string[];
  remindIdleVariants(idleWorkdays: number): readonly string[];

  digestHeadVariants(weekKm: string): readonly string[];
  digestHeadCityVariants(weekKm: string, city: string): readonly string[];
  digestTopLine(entries: string): string;
  digestSelfLine(rank: number, km: string): string;
  digestSelfZeroVariants: readonly string[];

  welcomeHelloVariants(name: string): readonly string[];
  /** Lines after the greeting; joined with '\n' (may contain empty lines). */
  welcomeBodyLines: readonly string[];
  relinkedVariants(name: string): readonly string[];
  helpLines(appName: string): readonly string[];
  farewellVariants: readonly string[];
  achievementUnlocked(title: string): string;
  staleTokenVariants: readonly string[];

  ui: TelegramUiTexts;
}
