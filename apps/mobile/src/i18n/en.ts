export const en = {
  // ── Common ──
  common: {
    appName: 'Defensive Pedal',
    cancel: 'Cancel',
    save: 'Save',
    done: 'Done',
    back: 'Back',
    close: 'Close',
    loading: 'Loading...',
    error: 'Error',
    retry: 'Retry',
    guest: 'Guest',
    signedIn: 'Signed in',
  },

  // ── Tabs ──
  tabs: {
    map: 'Map',
    history: 'History',
    community: 'Community',
    profile: 'Profile',
  },

  // ── Route Planning ──
  planning: {
    searchDestination: 'Where are you going?',
    addStop: 'Add stop',
    previewRoute: 'Preview route',
    safe: 'Safe',
    fast: 'Fast',
    savedRoutes: 'Saved routes',
    reportHazard: 'Report hazard',
    centerLocation: 'Center on current location',
  },

  // ── Route Preview ──
  preview: {
    startNavigation: 'Start navigation',
    switchToSafe: 'Switch to safe route',
    saveRoute: 'Save route',
    riskDistribution: 'Risk distribution',
    elevationProfile: 'Elevation profile',
    routeComparison: 'Route comparison',
  },

  // ── Navigation ──
  nav: {
    arrived: 'You have arrived at your destination.',
    inMeters: 'In {{distance}} meters, {{instruction}}',
    minutesRemaining_one: 'About 1 minute remaining.',
    minutesRemaining_other: 'About {{count}} minutes remaining.',
    endRide: 'End ride',
    recenter: 'Recenter',
    offRoute: 'You are off route',
    rerouting: 'Rerouting...',
  },

  // ── Feedback ──
  feedback: {
    title: 'How was your ride?',
    subtitle: 'Your feedback helps us improve routes',
    submit: 'Submit feedback',
    skip: 'Skip',
  },

  // ── Profile ──
  profile: {
    title: 'Profile',
    eyebrow: 'Defensive Pedal',
    subtitle: 'Your account and settings',
    tapToSignIn: 'Tap to sign in',
    signOut: 'Sign Out',
    setUsername: 'Set username',
    changeUsername: 'Change username',
    minChars: 'Min 3 characters',
    usernameTaken: 'Username taken',
    language: 'Language',

    // Sections
    aboutYou: 'About you',
    bikeType: 'Type of bike',
    cyclingFrequency: 'How often do you cycle?',
    routingPreferences: 'Routing preferences',
    avoidUnpaved: 'Avoid unpaved roads',
    compareRoutes: 'Compare safe vs fast route',
    showBikeLanes: 'Show bike lanes on map',
    pointsOfInterest: 'Points of Interest',
    notifications: 'Notifications',
    dailyWeather: 'Daily Weather Brief',
    hazardAlerts: 'Hazard Alerts',
    community: 'Community',
    quietHours: 'Quiet Hours',
    privacy: 'Privacy',
    shareTrips: 'Share trips publicly',
    guardianTier: 'Guardian tier',
    rebuildRequired: 'Rebuild required',
    rebuildMessage: 'Photo picker needs a native rebuild.',
    photoUploadFailed: 'Photo upload failed',
  },

  // ── History ──
  history: {
    title: 'History',
    subtitle: 'Your rides and impact',
    noTrips: 'No trips yet',
    totalRides: 'Total rides',
    totalDistance: 'Total distance',
    totalDuration: 'Total duration',
    co2Saved: 'CO2 saved',
    eurSaved: 'EUR saved',
    currentStreak: 'Current streak',
    longestStreak: 'Longest streak',
    exportGpx: 'Export GPX',
  },

  // ── Community ──
  communityScreen: {
    title: 'Community',
    subtitle: 'Nearby cyclists',
    feed: 'Feed',
    noActivity: 'No activity nearby',
    like: 'Like',
    love: 'Love',
    comment: 'Comment',
    follow: 'Follow',
    unfollow: 'Unfollow',
    shareRide: 'Share ride',
  },

  // ── Hazard Reporting ──
  hazard: {
    title: 'Report hazard',
    parkedCar: 'Parked car',
    blockedLane: 'Blocked lane',
    pothole: 'Pothole',
    construction: 'Construction',
    aggroTraffic: 'Aggro traffic',
    other: 'Other',
    reported: 'Reported! Other cyclists will be warned.',
    stillThere: 'Still there?',
    confirm: 'Confirm',
    deny: 'Gone',
  },

  // ── Weather ──
  weather: {
    feelsLike: 'Feels like',
    wind: 'Wind',
    aqi: 'AQI',
    precipitation: 'Precipitation',
  },

  // ── Onboarding ──
  onboarding: {
    welcome: 'Welcome to Defensive Pedal',
    safetyScore: 'Your area safety score',
    setCyclingGoal: 'Set your cycling goal',
    tryFirstRoute: 'Try your first route',
    createAccount: 'Create account',
    skip: 'Skip for now',
    getStarted: 'Get started',
  },

  // ── Impact ──
  impact: {
    title: 'Your Impact',
    co2Saved: 'CO2 saved',
    moneySaved: 'Money saved',
    hazardsReported: 'Hazards reported',
    equivalent: 'equivalent to',
  },

  // ── Streak ──
  streak: {
    dayStreak: '{{count}}-day streak',
    frozen: 'Frozen',
    keepItUp: 'Keep it up!',
  },
} as const;

/** Recursive type that mirrors the en structure but allows any string values. */
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

export type TranslationKeys = DeepStringify<typeof en>;
