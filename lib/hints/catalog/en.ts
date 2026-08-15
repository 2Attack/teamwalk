import type { StaticHint } from './types';

/**
 * English static catalog. Mirrors `ru.ts` entry by entry: same order, same
 * tones, same spirit. Local idioms are adapted, not translated literally
 * (e.g. Vladivostok becomes a coast-to-coast US walk). Every phrase must
 * stay within MAX_HINT_LENGTH and pass the English banned-topic filter.
 */
export const CATALOG_EN: readonly StaticHint[] = [
  { text: 'A tortoise does 0.27 km/h. We win even at the lowest speed.', tone: 'neutral' },
  { text: 'Every walk is a small victory over the chair. The score keeps growing.', tone: 'praise' },
  { text: 'The treadmill is standing there watching you. Right now. Silently.', tone: 'tease' },
  { text: 'The chair never gets tired. That is exactly its problem.', tone: 'tease' },
  { text: 'Walking in place is the only way to cover kilometers without leaving the office.', tone: 'neutral' },
  { text: 'The treadmill idle record updates itself, no effort required on your part.', tone: 'tease' },
  { text: '3–4 km/h does not stop you from talking on a call. Verified by colleagues.', tone: 'tip' },
  { text: 'Log your distance right after the walk: an hour later you will not remember it.', tone: 'tip' },
  { text: 'A desk treadmill will not replace a walk outside. But 5 km a day is 5 km a day.', tone: 'tip' },
  { text: 'Start with 10 minutes. A streak of short walks beats one heroic session.', tone: 'tip' },
  { text: 'Faster is not better: at 4 km/h you can walk and work at the same time.', tone: 'tip' },
  { text: 'Streaks count working days only: weekends will not break yours. Rest easy.', tone: 'tip' },

  // Category 4: absurd statistics. Animals are the safest comparison source:
  // speed is measurable and nobody gets offended.
  { text: 'A sloth tops out at 0.24 km/h. Even at minimum speed you are four times faster.', tone: 'neutral' },
  { text: 'A snail covers 50 meters in an hour. You need one minute for that.', tone: 'neutral' },
  { text: 'An ostrich runs 70 km/h. But it is completely useless at desk work.', tone: 'tease' },
  { text: 'A penguin walks at 3.6 km/h. That is exactly your pace during a call.', tone: 'neutral' },
  { text: 'An elephant strolls at 6 km/h. Catching up is entirely realistic.', tone: 'neutral' },
  { text: 'A chicken hits 14 km/h. The treadmill cannot go that fast. Call it a draw.', tone: 'tease' },
  { text: 'A cheetah holds 110 km/h for twenty seconds. You hold 4 km/h for forty minutes.', tone: 'tease' },
  { text: 'A giraffe walks 16 km/h and stays silent the whole way. Something to learn there.', tone: 'tease' },
  { text: 'A whale swims 100 km a day. But it has zero deadlines.', tone: 'neutral' },
  { text: 'A pigeon flies at 80 km/h. Walking, it never really figured out.', tone: 'tease' },
  { text: 'A mole digs 20 meters per night. You walk that in fifteen seconds.', tone: 'neutral' },
  { text: 'A panda moves at 3 km/h and sleeps ten hours a day. You have mastered step one already.', tone: 'tease' },
  { text: 'A koala sleeps 22 hours a day. The remaining two cover its entire agenda.', tone: 'tease' },
  { text: 'An armadillo runs 48 km/h. Nobody expected that, including you.', tone: 'neutral' },
  { text: 'A dog on a walk covers 8 km, 6 of them in circles. A familiar strategy.', tone: 'tease' },
  { text: 'A squirrel runs 3 km of branches a day. Your treadmill is noticeably more stable.', tone: 'neutral' },
  { text: 'A flamingo stands on one leg for hours. A valid strategy, but it earns no points.', tone: 'tease' },
  { text: 'Jonathan the tortoise is 190 and never hurries anywhere. But he holds no streak.', tone: 'tease' },
  { text: 'A kangaroo jumps at 70 km/h. Its walking, however, is remarkably clumsy.', tone: 'neutral' },
  { text: 'A giant snail holds the record at 0.048 km/h. Records come in all kinds.', tone: 'neutral' },
  { text: 'Adélie penguins walk 50 km to the nest. And never once text the group chat.', tone: 'tease' },
  { text: 'An anteater walks 1.6 km/h. Slower than you, but at least it has an excuse.', tone: 'tease' },
  { text: 'A sloth climbs down its tree once a week. A schedule some of us recognize.', tone: 'tease' },
  { text: 'An ant walks less than a kilometer in its whole life. You beat that before lunch.', tone: 'neutral' },
  { text: 'A camel caravan covers 40 km a day. Nobody messages the camel meanwhile.', tone: 'neutral' },
  { text: 'A T. rex moved at roughly 5 km/h. You are literally matching its pace.', tone: 'neutral' },

  // Distances, technology and history — the second pillar of the same category.
  { text: 'Earth’s circumference is 40,075 km. At 5 km a day that is 22 years. Better start today.', tone: 'neutral' },
  { text: 'The Moon is 384,400 km away. On foot: 219 years without a single day off.', tone: 'neutral' },
  { text: 'The treadmill was invented in 1818 as a punishment for prisoners. Progress is real.', tone: 'tease' },
  { text: 'Astronauts on the ISS walk the treadmill strapped in with harnesses. You got the better deal.', tone: 'neutral' },
  { text: 'A waiter walks about 10 km per shift. And not a single point on the leaderboard.', tone: 'tease' },
  { text: 'A Roman legionary marched 30 km a day in full gear. You have a desk and coffee.', tone: 'neutral' },
  { text: 'Everest is 8,848 meters up. Your treadmill is honestly horizontal.', tone: 'neutral' },
  { text: 'A marathon is 42.195 km. That is eight of your 5Ks, minus the crowd and the medal.', tone: 'neutral' },
  { text: 'A mail carrier walks 12 km per shift. You have a treadmill and zero dogs.', tone: 'neutral' },
  { text: 'The average person takes 4,000 steps a day. Half of them to the coffee machine and back.', tone: 'tease' },
  { text: 'The 10,000-steps target was invented by a Japanese pedometer ad in 1965.', tone: 'neutral' },
  { text: 'An hour at 4 km/h is about 5,500 steps. Effortless and without a single sprint.', tone: 'neutral' },
  { text: 'A subway escalator moves at 2.7 km/h. The treadmill is faster and takes you nowhere.', tone: 'neutral' },
  { text: 'At the equator, Earth spins at 1,670 km/h. Technically you are already moving.', tone: 'tease' },
  { text: 'Voyager 1 travels at 61,000 km/h. It just never has to come back for standup.', tone: 'tease' },
  { text: 'The average city pedestrian does 5 km/h. The treadmill has no traffic lights.', tone: 'neutral' },
  { text: 'A courier on a scooter does 25 km/h. Yet the leaderboard points go to you.', tone: 'tease' },
  { text: 'Walking across the US coast to coast is about 4,500 km. At 5 km a day, two and a half years.', tone: 'neutral' },
  { text: 'A robot vacuum drives 300 meters per cleaning. You outwalked it before noon.', tone: 'neutral' },
  { text: 'Clock hands travel 1.2 km a day around the dial. Without a single break.', tone: 'neutral' },
  { text: 'The Curiosity rover covered 32 km in 13 years. You will do that in a week.', tone: 'neutral' },
  { text: 'Bamboo grows 91 cm a day. It grows, you walk. Everyone is busy.', tone: 'neutral' },
  { text: 'An elevator climbs 2 m/s. Stairs are slower, but they actually count.', tone: 'tip' },

  // The treadmill, the chair and the leaderboard — same category, product-flavored.
  { text: 'The average office chair travels 0 km a year. Impressive consistency.', tone: 'tease' },
  { text: 'The treadmill stands there watching silently. Right now. For forty minutes already.', tone: 'tease' },
  { text: 'The treadmill idle record keeps updating entirely on its own.', tone: 'tease' },
  { text: 'The treadmill has no sense of humor, but it has a counter. It sees everything.', tone: 'tease' },
  { text: 'Every unwalked kilometer stays unwalked. The math is merciless.', tone: 'tease' },
  { text: 'The treadmill forgets you skipped it yesterday. The leaderboard does not.', tone: 'tease' },

  // Category 5: real tips. Walking technique.
  { text: 'Walk slowly for the first two minutes. That is a warm-up, not wasted time.', tone: 'tip' },
  { text: 'Slow down for the last two minutes. A sudden stop throws off your breathing.', tone: 'tip' },
  { text: 'Do not hold the handrails the whole time: it makes your gait unnatural.', tone: 'tip' },
  { text: 'Look ahead, not at your feet. Your stride gets steadier and your neck will thank you.', tone: 'tip' },
  { text: 'Put the screen at eye level. Otherwise your neck will share its honest opinion of you.', tone: 'tip' },
  { text: 'Soft-soled shoes change everything. Slippers are a bad idea.', tone: 'tip' },
  { text: 'Shoelace untied? Stop. The treadmill will wait, promise.', tone: 'tip' },
  { text: 'Bored? Change the speed for a couple of minutes. Monotony tires you faster than pace.', tone: 'tip' },
  { text: 'Alternate sitting and walking work. Eight hours in one position wears you down either way.', tone: 'tip' },
  { text: 'Walking is easier in a cool room. Open a window before you start.', tone: 'tip' },

  // What to do while on the treadmill.
  { text: 'Typing while walking is hard. Save the treadmill for reading, calls and thinking.', tone: 'tip' },
  { text: 'Bring a thinking task to the treadmill. Walking speeds up thoughts remarkably.', tone: 'tip' },
  { text: 'Do not bring heavy-typing tasks to the treadmill. It will not work.', tone: 'tip' },
  { text: 'Headphones and a podcast make forty minutes disappear. Just try it.', tone: 'tip' },
  { text: 'Music at 120 beats per minute sets a steady, comfortable stride on its own.', tone: 'tip' },
  { text: 'You sound livelier talking on the move. Colleagues on the call can absolutely hear it.', tone: 'tip' },
  { text: 'Two walking calls a day is already 4 km. Plan your day in advance.', tone: 'tip' },

  // How not to quit: habit, schedule, environment.
  { text: 'Put the walk in your calendar. Things outside the calendar rarely happen.', tone: 'tip' },
  { text: 'A walk right after a call is the easiest one: you are already on your feet.', tone: 'tip' },
  { text: 'Two 15-minute walks give the same distance as one 30-minute walk.', tone: 'tip' },
  { text: 'Decide the duration in advance. Deciding on the go means stopping early.', tone: 'tip' },
  { text: 'Log the walk before you sit down. Once seated, you are not getting up.', tone: 'tip' },
  { text: 'If the day fell apart, walk ten minutes. The streak matters more than any record.', tone: 'tip' },
  { text: 'A morning walk almost never gets cancelled. An evening one — often.', tone: 'tip' },
  { text: 'A treadmill next to the desk gets used three times more than one in a far corner.', tone: 'tip' },
  { text: 'Agree with a colleague to walk at the same time. Skipping is awkward in pairs.', tone: 'tip' },
  { text: 'Set the walk reminder for the morning: in the afternoon you will just swipe it away.', tone: 'tip' },
  { text: 'Set a bad-day minimum: 10 minutes. Zero and ten are different numbers.', tone: 'tip' },
  { text: 'The first week is always harder than the second. After that it becomes a habit.', tone: 'tip' },
  { text: 'Set a timer, not an end-of-walk alarm. That way you can see how much is left.', tone: 'tip' },

  // Pace, numbers and working with the leaderboard.
  { text: 'Do not raise the speed every day. A steady pace earns more kilometers per week.', tone: 'tip' },
  { text: 'Do not chase someone else’s pace. The leaderboard counts kilometers, not heroics.', tone: 'tip' },
  { text: 'Forgot to start the treadmill? Estimate by time. Approximate beats nothing.', tone: 'tip' },
  { text: 'Log your distance honestly. A leaderboard without trust is pointless.', tone: 'tip' },
  { text: 'Missed a day? Do not restart from zero. Just walk today.', tone: 'tip' },
  { text: 'Count days, not records. Consistency wins over intensity.', tone: 'tip' },
  { text: 'Check the stats once a week, not every hour. That is how you see progress.', tone: 'tip' },
  { text: 'Log even a failed walk. Five minutes is still a row in the table.', tone: 'tip' },
  { text: 'Wipe down the treadmill after yourself. The next user is usually you.', tone: 'tip' },
  { text: 'A good walk is the one that happened. Everything else is details.', tone: 'tip' },

  // Praise: works as the closing note of the feed.
  { text: 'Five kilometers today are five kilometers that did not exist yesterday.', tone: 'praise' },
  { text: 'A streak does not hold itself. You hold it — one day at a time.', tone: 'praise' },
  { text: 'You are already ahead of everyone still planning to start on Monday.', tone: 'praise' },
  { text: 'Every streak day is a separate decision. Today you made it.', tone: 'praise' },
  { text: 'The treadmill is on — the hardest part of today is already behind you.', tone: 'praise' },
];
