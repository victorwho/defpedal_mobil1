import type { FaqSections } from './faqTypes';

export const faqEn: FaqSections = [
  {
    id: 'safety',
    title: 'Safety & Routing',
    items: [
      {
        id: 'what-is-defensive-pedal',
        question: 'What is Defensive Pedal?',
        answer:
          'Defensive Pedal is a cycling navigation app that prioritises rider safety. It calculates routes that avoid dangerous roads, busy intersections, and hazardous segments based on real-world risk data.',
      },
      {
        id: 'pre-ride-check',
        question: 'What should I check before every ride?',
        answer:
          'A 60-second check before you roll out.\n\nBike (ABC):\n• Air — squeeze both tyres, pump if soft\n• Brakes — squeeze each lever, the wheel should stop firmly\n• Chain — spin the cranks, check it isn’t dry or rusty; quick-releases and bolts tight\n\nYou:\n• Helmet on, strap clipped\n• Front white light + rear red light on (always, even in daytime)\n• Bell works\n• Phone charged, mounted or securely pocketed\n• Visible clothing or reflectives if dusk or night\n\nRoute:\n• Destination set in Defensive Pedal and Safe route selected\n• Glance at the risk distribution and elevation — know what’s coming\n• Check the weather widget for rain, wind, or poor air quality\n• Note any hazards reported on your route\n\nMind:\n• Hydrated, not riding hungry or exhausted\n• Voice guidance on so your eyes stay on the road\n• Plan your first turn before you push off\n\nIf anything fails the check, fix it before you ride — not at the first red light.',
      },
      {
        id: 'safe-vs-fast',
        question: 'How does "Safe" routing differ from "Fast"?',
        answer:
          'Safe mode uses our custom OSRM server with a safety-weighted profile that avoids high-risk road segments. Fast mode uses standard Mapbox cycling directions optimised for shortest travel time.',
      },
      {
        id: 'why-not-shortest',
        question: "Why doesn't my route take the shortest way?",
        answer:
          "Because the shortest way is often the busiest. Defensive Pedal weighs safety against distance and prefers calm, protected streets. You can see the trade on the route card — usually it's a couple of minutes for a much calmer ride.",
      },
      {
        id: 'risk-score-source',
        question: 'Where does the Risk Score come from?',
        answer:
          'From the street itself: speed limits, lanes, bike infrastructure and how well it separates you from cars, modeled traffic volumes, surface quality, lighting, and dozens of other signals — sourced from OpenStreetMap, elevation data and traffic modeling. Lower is safer. Street-by-street scores cover all 31 supported European countries.',
      },
      {
        id: 'wrong-street-color',
        question: 'Why is this street the wrong color?',
        answer:
          'Our map data comes from OpenStreetMap and is refreshed regularly, but streets change — new bike lanes, roadworks, retagged roads. If a score looks wrong, tell us via the suggestion button on the planning screen, and always trust what you see over what the map says.',
      },
      {
        id: 'green-not-guaranteed',
        question: 'Is a green street guaranteed to be safe?',
        answer:
          "No score can promise that. Green means the street's design and traffic conditions are favorable — it can't see today's weather, a delivery van in the bike lane, or an individual driver. The Risk Score is decision support, not a guarantee. Ride defensively; it's in our name.",
      },
      {
        id: 'supported-countries',
        question: 'Which countries are supported?',
        answer:
          'Safe routing and street-by-street risk colors are available across 31 European countries (the EU, EEA and Switzerland). Fast routing works worldwide via Mapbox.',
      },
      {
        id: 'avoid-unpaved',
        question: 'What does "Avoid unpaved" do?',
        answer:
          'When active, the routing engine penalises gravel, dirt, and unpaved roads so your route stays on paved surfaces wherever possible.',
      },
      {
        id: 'report-hazard',
        question: 'How do I report a hazard?',
        answer:
          'During active navigation, tap the hazard report button on the HUD. You can report potholes, aggressive dogs, flooding, and other obstacles. Reports are shared with other riders. You can also long-press the map from the route planning screen to report hazards before you ride.',
      },
      {
        id: 'offline-use',
        question: 'Can I use the app offline?',
        answer:
          'Offline map tiles can be downloaded from the Offline Maps screen in Settings. Route calculation still requires an internet connection.',
      },
      {
        id: 'voice-guidance',
        question: 'How does voice guidance work?',
        answer:
          'When enabled, the app reads turn-by-turn instructions aloud during navigation. You can toggle it from the route planning screen or the navigation HUD.',
      },
    ],
  },
  {
    id: 'impact',
    title: 'Your Impact',
    items: [
      {
        id: 'microlives',
        question: 'What are Microlives?',
        answer:
          'Microlives are a science-based measure of life expectancy. 1 Microlife = 30 minutes of adult life expectancy. Every ride you take earns Microlives based on distance cycled, bike type, and air quality. The formula: 0.4 × distance (km) × vehicle modifier × AQI modifier. Regular bikes earn more than e-bikes because of the higher physical effort.',
      },
      {
        id: 'community-seconds',
        question: 'How are community seconds calculated?',
        answer:
          'Every kilometre you cycle instead of driving prevents air pollution that would shorten the lives of people around you. We calculate this as 4.5 seconds of community life expectancy donated per km. These are aggregated city-wide to show collective impact.',
      },
      {
        id: 'lifetime-impact',
        question: 'Where can I see my lifetime impact?',
        answer:
          'The Impact Dashboard (History tab → Your Impact) shows your cumulative totals from every ride: CO2 saved, money saved, Microlives earned, and community seconds donated. These numbers only go up — every ride adds to them.',
      },
      {
        id: 'co2-calculation',
        question: 'How is CO2 saved calculated?',
        answer:
          'We calculate CO2 savings by comparing your actual GPS cycling distance against the emissions a car would produce for the same trip. The formula uses the EU average of 120 g CO2/km. For example, a 10 km ride saves approximately 1.2 kg of CO2.',
      },
      {
        id: 'ride-equivalents',
        question: 'What are the equivalents shown after a ride?',
        answer:
          'After each ride, the impact summary shows your CO2 savings expressed as real-world equivalents — such as trees saved, phone charges, or kilometres of driving avoided. These help make abstract numbers tangible and motivating.',
      },
    ],
  },
  {
    id: 'progression',
    title: 'Progression & Rewards',
    items: [
      {
        id: 'xp-system',
        question: 'How does the XP system work?',
        answer:
          'You earn Experience Points (XP) every time you complete a ride, earn a badge, or maintain a streak day. Ride XP scales with distance and includes multipliers for adverse weather and hazard reporting. XP accumulates towards your rider tier.',
      },
      {
        id: 'rider-tiers',
        question: 'What are rider tiers?',
        answer:
          'There are 10 rider tiers from Kickstand (beginner) to Legend. Each tier requires more XP to reach. Your current tier is shown on your profile card and community feed posts. Reaching a new tier triggers a celebration overlay.',
      },
      {
        id: 'badges',
        question: 'How do I earn badges?',
        answer:
          'Badges are awarded automatically for reaching milestones across 8 categories: distance, streaks, hazard reporting, community engagement, weather riding, time of day, exploration, and special achievements. Visit the Trophy Case in your profile to see the full catalog of 140+ badges and your progress.',
      },
      {
        id: 'streaks',
        question: 'How do streaks work?',
        answer:
          'Your streak counts consecutive days of qualifying activity. The day resets at 4:00 AM local time. If you miss a day, your streak resets to zero — unless you have a streak freeze available. Your longest streak is tracked separately.',
      },
      {
        id: 'streak-qualifying-actions',
        question: 'What counts as a qualifying action for my streak?',
        answer:
          'Five actions count toward your daily streak: completing a ride, reporting a hazard, confirming or denying an existing hazard, answering the daily safety quiz, and sharing a ride to the community feed. You only need one per day to keep the streak alive.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy & Data',
    items: [
      {
        id: 'location-data',
        question: 'What happens to my location data?',
        answer:
          'GPS breadcrumbs from your trips are uploaded to our servers so you can replay rides in your trip history, see your impact stats, and share routes to the community feed. Hazard reports include the exact coordinate where you tapped, plus your username so other riders can see who flagged it. If you share a trip to the feed, your username, route summary and full polyline are visible to other users.\n\nYou can delete your account at any time from Profile → Account → Delete account, which removes all of this data permanently.',
      },
      {
        id: 'delete-account',
        question: 'How do I delete my account?',
        answer:
          "Open Profile, scroll to the Account section, and tap Delete account. You'll be asked to type DELETE to confirm. On confirmation, we permanently remove your trips, GPS history, hazard reports, comments, likes, badges, XP and profile from our servers. Community-visible content you posted (such as a hazard you flagged or a comment you wrote) is anonymised — the post stays so the community signal is preserved, but your name and account are gone.",
      },
      {
        id: 'analytics',
        question: 'Do you collect crash reports or product analytics?',
        answer:
          'Both are on by default. Crash reports keep the app stable — they carry stack traces and device info, never your location and no personal data. Product analytics is anonymous, aggregated usage data with no GPS tracks, and it tells us which features are worth building on. Both are disclosed on the first onboarding screen, and both are yours to switch off: Profile → Privacy & analytics, anytime. Turning a switch off stops new events for that channel immediately, and once you have made a choice we never override it. We never sell your data.',
      },
    ],
  },
];
