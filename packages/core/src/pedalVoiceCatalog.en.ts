/**
 * Pedal voice catalog — ENGLISH pools.
 *
 * One line per message. Sassy pools rotate per send (12 variants); neutral
 * pools rotate too (6 variants, strict cycle via the memory clamp).
 *
 * Voice rules (plan §6.1): witty never cruel; self-aware dog; knows the
 * rider's streak/city; NO emoji (locked by test); contractions avoided in
 * sassy copy — the deadpan "I am waiting" register IS the voice. Every
 * {placeholder} must be a key the renderer knows: riderName, streakCount,
 * milestoneDay, city, badgeLabel, lapsedDays, n (locked by test).
 *
 * Id stability: sassy v1–v3 and neutral n1 are the pre-2026-08 lines —
 * do not retext or renumber them; nudge_log history keys the rotation.
 */
import type { LocaleCatalog } from './pedalVoiceTypes';

export const EN_CATALOG: LocaleCatalog = {
  post_ride_celebration: {
    sassy: [
      { id: 'v1', title: 'Ride saved', body: 'Streak day {streakCount}. Nicely done, {riderName}.' },
      { id: 'v2', title: 'Look at you', body: '{streakCount} days in a row. I am not crying, you are crying.' },
      { id: 'v3', title: 'Pedal is thrilled', body: '{streakCount} days. I am updating my LinkedIn to say I know you.' },
      { id: 'v4', title: 'New personal lore', body: 'Day {streakCount}. One day this becomes the story you tell at parties.' },
      { id: 'v5', title: 'Officially showing off', body: '{streakCount} days in a row. Save some glory for the rest of us, {riderName}.' },
      { id: 'v6', title: 'Pedal saw everything', body: "That ride? Chef's kiss. Day {streakCount} in the books." },
      { id: 'v7', title: 'Report from the couch', body: 'I did nothing today and you did {streakCount} days in a row. We are not the same.' },
      { id: 'v8', title: 'Legs: legendary', body: 'Day {streakCount} done. Your bike would high-five you if it could.' },
      { id: 'v9', title: 'Another one', body: '{streakCount} days. At this point the city should name a bike lane after you.' },
      { id: 'v10', title: 'Scientists baffled', body: '{streakCount} straight days of riding. Experts call it "being {riderName}".' },
      { id: 'v11', title: 'Quiet flex', body: 'Ride saved, day {streakCount}. You did not even make it look hard.' },
      { id: 'v12', title: 'Good dog approved', body: '{streakCount} days in a row. I would wag my tail, but I am a notification.' },
    ],
    neutral: [
      { id: 'n1', title: 'Ride saved', body: 'Streak day {streakCount}. Nicely done, {riderName}.' },
      { id: 'n2', title: 'Ride complete', body: 'Day {streakCount} of your streak is in the books.' },
      { id: 'n3', title: 'Streak day {streakCount}', body: 'Another ride saved. Keep it going, {riderName}.' },
      { id: 'n4', title: 'Ride saved', body: 'That is {streakCount} days in a row. Well ridden.' },
      { id: 'n5', title: 'Nice riding', body: 'Your ride is saved. Streak: {streakCount} days.' },
      { id: 'n6', title: 'Day {streakCount} complete', body: 'Ride recorded. See you on the next one, {riderName}.' },
    ],
  },

  post_hazard_thanks: {
    sassy: [
      { id: 'v1', title: 'Hazard reported', body: 'Thanks, {riderName}. Other riders nearby will see this.' },
      { id: 'v2', title: 'Public service announcement', body: 'Pedal logged it. The next rider through {city} owes you a beer.' },
      { id: 'v3', title: 'Saved a tire today', body: 'Your report is live. Pedal salutes you with one paw.' },
      { id: 'v4', title: 'Neighborhood watch', body: 'One report from you, one smoother ride for everyone in {city}.' },
      { id: 'v5', title: 'Hero behavior', body: 'You saw it, you reported it. {city} does not deserve you, {riderName}.' },
      { id: 'v6', title: 'The streets thank you', body: 'Somewhere in {city}, a rim you will never meet just survived.' },
      { id: 'v7', title: 'Pedal took notes', body: 'Filed, stamped, live on the map. Bureaucracy has never been this fast.' },
      { id: 'v8', title: 'Karma deposit received', body: 'Your report is live. The universe owes you one smooth ride.' },
      { id: 'v9', title: 'Eyes on the road', body: '{city} has a lot of riders. Today you were the one paying attention.' },
      { id: 'v10', title: 'Snitching on potholes', body: 'The only gossip Pedal approves of. Report is live, {riderName}.' },
      { id: 'v11', title: 'Community MVP', body: 'Report live. Riders around {city} just got a little safer.' },
      { id: 'v12', title: 'Paw of approval', body: 'Logged it. If I had thumbs I would give you two.' },
    ],
    neutral: [
      { id: 'n1', title: 'Hazard reported', body: 'Thanks, {riderName}. Other riders nearby will see this.' },
      { id: 'n2', title: 'Report received', body: 'Your hazard report is now visible to riders in {city}.' },
      { id: 'n3', title: 'Report live', body: 'Thanks for flagging it. Nearby riders can now avoid it.' },
      { id: 'n4', title: 'Hazard logged', body: 'Your report helps riders around {city} stay safer.' },
      { id: 'n5', title: 'Thanks, {riderName}', body: 'The hazard is on the map for everyone nearby.' },
      { id: 'n6', title: 'Report saved', body: 'Other cyclists will see your warning on their route.' },
    ],
  },

  streak_at_risk_mild: {
    sassy: [
      { id: 'v1', title: 'Streak reminder', body: 'Your {streakCount}-day streak needs a ride today, {riderName}.' },
      { id: 'v2', title: 'Hey {riderName}', body: 'Short ride, big deal. {streakCount} days riding. Do not let me ruin the spreadsheet.' },
      { id: 'v3', title: 'Small reminder', body: '{streakCount} days. {city} is right there. Just saying.' },
      { id: 'v4', title: 'Gentle nudge', body: 'Ten minutes on the bike keeps the {streakCount}-day streak alive. I timed it.' },
      { id: 'v5', title: 'No drama yet', body: '{streakCount} days is a nice number. Today decides if it keeps growing.' },
      { id: 'v6', title: 'Pedal, softly', body: 'The streak is fine. The streak is calm. The streak would love a short ride.' },
      { id: 'v7', title: 'Tiny ride, big math', body: 'One lap around the block and {streakCount} becomes {streakCount}+1. Easy.' },
      { id: 'v8', title: 'Casual observation', body: 'Your bike has been very quiet today, {riderName}. Suspiciously quiet.' },
      { id: 'v9', title: 'Friendly poke', body: '{city} still has daylight and you still have a {streakCount}-day streak. Coincidence?' },
      { id: 'v10', title: 'Just a whisper', body: 'A little spin today and we never have to talk about this again.' },
      { id: 'v11', title: 'For the record', body: 'The first {streakCount} days were the hard part. Today is just maintenance.' },
      { id: 'v12', title: 'Low-pressure alert', body: 'This is the chill reminder. You do not want to meet the dramatic one.' },
    ],
    neutral: [
      { id: 'n1', title: 'Streak reminder', body: 'Your {streakCount}-day streak needs a ride today, {riderName}.' },
      { id: 'n2', title: 'Streak check-in', body: 'A ride today keeps your {streakCount}-day streak going.' },
      { id: 'n3', title: 'No ride yet today', body: 'Your streak is at {streakCount} days. There is still time.' },
      { id: 'n4', title: 'Keep it going', body: 'A short ride today extends your {streakCount}-day streak.' },
      { id: 'n5', title: 'Today counts', body: 'Any ride today keeps your streak alive, {riderName}.' },
      { id: 'n6', title: 'Streak reminder', body: '{streakCount} days so far. A quick ride today continues it.' },
    ],
  },

  streak_at_risk_dramatic: {
    sassy: [
      { id: 'v1', title: 'Streak ending soon', body: '{streakCount}-day streak ending soon. Time to ride, {riderName}.' },
      { id: 'v2', title: '{riderName}', body: '{streakCount} days. {city} is dry. I am sitting by the window. I am waiting.' },
      { id: 'v3', title: 'Pedal is concerned', body: '{streakCount} days riding. Today is the only thing between you and zero.' },
      { id: 'v4', title: 'This is the dramatic one', body: '{streakCount} days on the line. I rehearsed a speech. Do not make me use it.' },
      { id: 'v5', title: 'Code red, sort of', body: 'The streak counter has no feelings. I have plenty. {streakCount} days, {riderName}.' },
      { id: 'v6', title: 'Pedal paces the room', body: 'Hours left. {streakCount} days at stake. I am stress-chewing a shoe.' },
      { id: 'v7', title: 'Deep breath', body: '{streakCount} days did not happen by accident. Neither should today.' },
      { id: 'v8', title: 'The window is closing', body: 'Not my window. The metaphorical one. {streakCount} days, {riderName}. Go.' },
      { id: 'v9', title: 'Emergency meeting', body: 'Attendees: me, your bike, the {streakCount}-day streak. Agenda: where are you?' },
      { id: 'v10', title: 'Zero is a bad look', body: '{streakCount} days versus starting over. I know which story I want to tell.' },
      { id: 'v11', title: 'Last call', body: '{city} is still rideable. The streak clock, however, is judging us both.' },
      { id: 'v12', title: 'I believe in you, loudly', body: '{streakCount} days strong. One ride keeps the legend intact, {riderName}.' },
    ],
    neutral: [
      { id: 'n1', title: 'Streak ending soon', body: '{streakCount}-day streak ending soon. Time to ride, {riderName}.' },
      { id: 'n2', title: 'Streak at risk', body: 'Without a ride today, your {streakCount}-day streak resets.' },
      { id: 'n3', title: 'Time is short', body: 'Your {streakCount}-day streak needs a ride before the day ends.' },
      { id: 'n4', title: 'Last reminder today', body: 'Ride today to keep your {streakCount}-day streak, {riderName}.' },
      { id: 'n5', title: 'Streak on the line', body: '{streakCount} days at stake. A short ride is enough.' },
      { id: 'n6', title: 'Streak ends today', body: 'Your {streakCount}-day streak ends without a ride today.' },
    ],
  },

  daily_ride_reminder: {
    sassy: [
      { id: 'v1', title: 'Ride window open', body: 'Your usual ride hour, {riderName}. Conditions look good in {city}.' },
      { id: 'v2', title: 'It is time', body: '{city} is calling. The bike is ready. So is Pedal.' },
      { id: 'v3', title: 'Quick check-in', body: 'Same time as yesterday, {riderName}? Pedal kept your spot warm.' },
      { id: 'v4', title: 'Right on schedule', body: 'This is when you usually ride. I know things. I am a very organized dog.' },
      { id: 'v5', title: 'Your slot is open', body: '{city} traffic report: your favorite riding hour just started.' },
      { id: 'v6', title: 'Ding', body: 'That was the sound of your usual ride time arriving. I do not make the rules.' },
      { id: 'v7', title: "Habit o'clock", body: 'You, a bike, {city}, this exact hour. It has worked before.' },
      { id: 'v8', title: 'The routine calls', body: 'Same hour as always, {riderName}. Your legs know the way by now.' },
      { id: 'v9', title: 'Pedal checked the calendar', body: 'I have one entry and it is you, riding, right about now.' },
      { id: 'v10', title: 'Window of opportunity', body: 'This hour has your name on it. {city} agrees.' },
      { id: 'v11', title: 'Streets are ready', body: 'Perfect hour for your usual loop. I checked. Twice.' },
      { id: 'v12', title: 'As per tradition', body: 'Your ride hour, {riderName}. Skipping it is legal but emotionally devastating.' },
    ],
    neutral: [
      { id: 'n1', title: 'Ride window open', body: 'Your usual ride hour, {riderName}. Conditions look good in {city}.' },
      { id: 'n2', title: 'Ride reminder', body: 'This is around the time you usually ride.' },
      { id: 'n3', title: 'Your usual hour', body: 'Conditions in {city} look fine for a ride now.' },
      { id: 'n4', title: 'Time for a ride?', body: 'Your typical ride window just opened, {riderName}.' },
      { id: 'n5', title: 'Reminder', body: 'A good moment for your regular ride in {city}.' },
      { id: 'n6', title: 'Ride window', body: 'You often ride around now. Today could be the same.' },
    ],
  },

  milestone_celebration: {
    sassy: [
      { id: 'v1', title: '{milestoneDay}-day streak', body: 'Milestone unlocked, {riderName}. {milestoneDay} days in a row.' },
      { id: 'v2', title: '{milestoneDay}. {milestoneDay}!', body: '{riderName}, you are officially a habit. I am getting a tattoo of you.' },
      { id: 'v3', title: 'Pedal pop quiz', body: 'What is {milestoneDay} days of riding? A movement. Welcome to it, {riderName}.' },
      { id: 'v4', title: 'History made', body: '{milestoneDay} days. Somewhere a statistician just gasped.' },
      { id: 'v5', title: 'Trophy time', body: '{milestoneDay} straight days. I am carrying you around the block. Mentally.' },
      { id: 'v6', title: 'Certified icon', body: '{milestoneDay} days in a row, {riderName}. The bike lane whispers your name now.' },
      { id: 'v7', title: 'Breaking news', body: 'Local rider hits {milestoneDay} days. Dog reportedly very proud.' },
      { id: 'v8', title: 'This is a big one', body: '{milestoneDay} days. I barked at a pigeon in your honor.' },
      { id: 'v9', title: 'Frame this', body: 'Day {milestoneDay}, {riderName}. Most people never meet this number. You live here.' },
      { id: 'v10', title: 'Milestone unlocked', body: '{milestoneDay} consecutive days. Your consistency is showing off again.' },
      { id: 'v11', title: 'The number speaks', body: '{milestoneDay}. I do not need to add anything. But still: wow, {riderName}.' },
      { id: 'v12', title: 'Dynasty behavior', body: '{milestoneDay} days and counting. The weather checks the forecast for you now.' },
    ],
    neutral: [
      { id: 'n1', title: '{milestoneDay}-day streak', body: 'Milestone unlocked, {riderName}. {milestoneDay} days in a row.' },
      { id: 'n2', title: 'Milestone reached', body: '{milestoneDay} consecutive days of riding. Congratulations.' },
      { id: 'n3', title: '{milestoneDay} days', body: 'A new milestone for your streak. Well done, {riderName}.' },
      { id: 'n4', title: 'New milestone', body: 'You have ridden {milestoneDay} days in a row.' },
      { id: 'n5', title: 'Congratulations', body: 'Your streak just reached {milestoneDay} days.' },
      { id: 'n6', title: 'Milestone unlocked', body: '{milestoneDay} days of consistent riding. Impressive work.' },
    ],
  },

  badge_proximity: {
    sassy: [
      { id: 'v1', title: 'One ride away', body: 'One more ride unlocks {badgeLabel}, {riderName}.' },
      { id: 'v2', title: 'You are this close', body: '{badgeLabel} is one ride away. Pedal already wrote the speech.' },
      { id: 'v3', title: 'Almost there', body: 'Your next ride finishes {badgeLabel}. No pressure though.' },
      { id: 'v4', title: 'So close it hurts', body: '{badgeLabel} is one ride away. I have been staring at the door.' },
      { id: 'v5', title: 'One more, {riderName}', body: '{badgeLabel} is basically yours. The badge is practicing your name.' },
      { id: 'v6', title: 'Do not leave it hanging', body: 'One ride between you and {badgeLabel}. That is the whole gap.' },
      { id: 'v7', title: 'Pedal checked the math', body: 'One (1) ride. That is the full price of {badgeLabel}.' },
      { id: 'v8', title: 'The shelf is ready', body: 'I dusted a spot for {badgeLabel}. Do not make me put a plant there.' },
      { id: 'v9', title: 'Cliffhanger', body: 'You, one ride short of {badgeLabel}. Worst place to pause a story, {riderName}.' },
      { id: 'v10', title: "Almost badge o'clock", body: '{badgeLabel} unlocks on your next ride. I already did celebration zoomies.' },
      { id: 'v11', title: 'Inches away', body: '{badgeLabel}: one ride left. Even the badge is getting nervous.' },
      { id: 'v12', title: 'Finish the quest', body: 'One ride and {badgeLabel} joins the trophy case. Side effects include smugness.' },
    ],
    neutral: [
      { id: 'n1', title: 'One ride away', body: 'One more ride unlocks {badgeLabel}, {riderName}.' },
      { id: 'n2', title: 'Badge nearby', body: 'Your next ride earns {badgeLabel}.' },
      { id: 'n3', title: 'Almost earned', body: '{badgeLabel} unlocks after one more ride.' },
      { id: 'n4', title: 'One ride left', body: 'Complete one more ride to earn {badgeLabel}, {riderName}.' },
      { id: 'n5', title: 'Close to a badge', body: 'One more ride and {badgeLabel} is yours.' },
      { id: 'n6', title: 'Progress update', body: 'You are one ride away from {badgeLabel}.' },
    ],
  },

  lapsed_reengagement: {
    sassy: [
      { id: 'v1', title: 'Pedal misses you', body: '{lapsedDays} days. Your bike is where you left it, {riderName}.' },
      { id: 'v2', title: 'Welfare check', body: 'I checked. The bike is still there. {city} is still there. Just saying.' },
      { id: 'v3', title: 'No pressure', body: 'Whenever you are ready, {riderName}. Pedal is patient.' },
      { id: 'v4', title: 'Still here', body: '{lapsedDays} days without a ride. I have not moved. Dogs are like that.' },
      { id: 'v5', title: 'The bike asked about you', body: 'It did not say much. It is a bike. But the vibe was longing.' },
      { id: 'v6', title: 'Missing: one rider', body: 'Last seen {lapsedDays} days ago. Reward: fresh air and mild smugness.' },
      { id: 'v7', title: 'Gentle haunting', body: 'I will keep appearing until you ride, {riderName}. I have nothing but time.' },
      { id: 'v8', title: '{city} update', body: 'The streets are still there. I counted. All of them, waiting.' },
      { id: 'v9', title: 'No guilt, just facts', body: '{lapsedDays} days. The first ride back is always better than you expect.' },
      { id: 'v10', title: 'Your saddle called', body: 'It says the couch is a phase. It is willing to wait. Mostly.' },
      { id: 'v11', title: 'Re-entry is easy', body: 'One short ride and the {lapsedDays} days never happened.' },
      { id: 'v12', title: "Pedal's diary", body: 'Day {lapsedDays}: still no ride. The human is missed. Sincerely, the dog.' },
    ],
    neutral: [
      { id: 'n1', title: 'Pedal misses you', body: '{lapsedDays} days. Your bike is where you left it, {riderName}.' },
      { id: 'n2', title: 'It has been a while', body: '{lapsedDays} days since your last ride. A short one counts.' },
      { id: 'n3', title: 'Ready when you are', body: 'Your bike and {city} are ready for your next ride.' },
      { id: 'n4', title: 'Come back anytime', body: 'No rush, {riderName}. A short ride is a good restart.' },
      { id: 'n5', title: 'Quick reminder', body: 'It has been {lapsedDays} days. Even ten minutes is a ride.' },
      { id: 'n6', title: 'Your next ride', body: 'Whenever you are ready, the map is waiting.' },
    ],
  },

  community_signal: {
    sassy: [
      { id: 'v1', title: 'Neighborhood update', body: '{city} riders are active. Your ranking moved.' },
      { id: 'v2', title: 'Heads up', body: 'Someone in {city} just hit a milestone. The neighborhood is moving.' },
      { id: 'v3', title: 'Local news', body: 'Activity is up in {city} this week. Pedal recommends joining in.' },
      { id: 'v4', title: 'Drama in {city}', body: 'The leaderboard shuffled and your name moved. I am not saying which way. Ride.' },
      { id: 'v5', title: 'The neighbors are busy', body: '{city} riders have been logging serious kilometers. Your move.' },
      { id: 'v6', title: 'Leaderboard gossip', body: 'People in {city} are climbing. You know what beats gossip? A ride.' },
      { id: 'v7', title: 'Friendly rivalry alert', body: 'Someone in {city} is riding like it is a competition. Technically it is.' },
      { id: 'v8', title: 'Word on the street', body: '{city} riders are stacking rides this week. The street talks. I listen.' },
      { id: 'v9', title: 'Your rank noticed', body: 'Positions are shifting in {city}. One ride does wonders for morale.' },
      { id: 'v10', title: 'Neighborhood on the move', body: '{city} is pedaling hard this week. Do not let them have all the fun.' },
      { id: 'v11', title: 'Standings update', body: 'The {city} leaderboard is heating up. Your spot could use a defense ride.' },
      { id: 'v12', title: 'Competitive spirit activated', body: 'Riders in {city} are making moves. I may have growled. Supportively.' },
    ],
    neutral: [
      { id: 'n1', title: 'Neighborhood update', body: '{city} riders are active. Your ranking moved.' },
      { id: 'n2', title: 'Leaderboard update', body: 'Rankings in {city} have shifted this week.' },
      { id: 'n3', title: 'Community update', body: 'Riders in {city} have been active lately.' },
      { id: 'n4', title: 'Your ranking moved', body: 'Check the {city} leaderboard to see where you stand.' },
      { id: 'n5', title: 'Neighborhood activity', body: 'Cycling is picking up in {city} this week.' },
      { id: 'n6', title: 'Standings changed', body: 'Recent rides in {city} moved the leaderboard.' },
    ],
  },

  streak_lost_apology: {
    sassy: [
      { id: 'v1', title: 'Fresh start', body: 'Your streak reset. Ready for three days, {riderName}? Then we see.' },
      { id: 'v2', title: '{riderName}', body: 'About yesterday. Look. It happens. Want to try 3 days, no pressure? I keep it chill.' },
      { id: 'v3', title: 'Pedal regroup', body: 'Streak reset. Three rides, three days, soft restart. Pedal has your back.' },
      { id: 'v4', title: 'We do not talk about yesterday', body: 'New day, new count. I already forgot the old number. Dogs are lucky like that.' },
      { id: 'v5', title: 'Plot twist, not an ending', body: 'Every great streak has a season two, {riderName}. This is the trailer.' },
      { id: 'v6', title: 'Zero is just a number', body: 'An ugly one. But temporary. One ride fixes the aesthetics.' },
      { id: 'v7', title: 'Official Pedal statement', body: 'The streak reset. My loyalty did not. Shall we?' },
      { id: 'v8', title: 'Clean slate', body: 'A fresh streak has that new-bike smell. Day one is waiting, {riderName}.' },
      { id: 'v9', title: 'For what it is worth', body: 'Streaks reset. Riders remain. You built the last one. You can build this one.' },
      { id: 'v10', title: 'Rebuild montage', body: 'Every comeback needs a first ride. I will hum the training music.' },
      { id: 'v11', title: 'No lectures here', body: 'The counter hit zero. Your legs did not. Whenever you want, {riderName}.' },
      { id: 'v12', title: 'Day zero club', body: 'Everyone visits. Nobody stays long. One ride and you are out.' },
    ],
    neutral: [
      { id: 'n1', title: 'Fresh start', body: 'Your streak reset. Ready for three days, {riderName}? Then we see.' },
      { id: 'n2', title: 'Streak reset', body: 'A new streak starts with your next ride.' },
      { id: 'n3', title: 'Starting over', body: 'The old streak ended. Today can start a new one.' },
      { id: 'n4', title: 'New streak available', body: 'One ride begins the next chain, {riderName}.' },
      { id: 'n5', title: 'Resets happen', body: 'Streaks come and go. Your next ride starts a fresh one.' },
      { id: 'n6', title: 'Ready when you are', body: 'A new streak is one ride away.' },
    ],
  },
};
