import type { TranslationKeys } from './en';

export const ro: TranslationKeys = {
  // ── Common ──
  common: {
    appName: 'Defensive Pedal',
    cancel: 'Anulează',
    save: 'Salvează',
    done: 'Gata',
    back: 'Înapoi',
    close: 'Închide',
    loading: 'Se încarcă...',
    error: 'Eroare',
    retry: 'Reîncearcă',
    guest: 'Vizitator',
    signedIn: 'Conectat',
  },

  // ── Tabs ──
  tabs: {
    map: 'Hartă',
    history: 'Istoric',
    community: 'Comunitate',
    profile: 'Profil',
  },

  // ── Route Planning ──
  planning: {
    searchDestination: 'Unde mergi?',
    addStop: 'Adaugă oprire',
    previewRoute: 'Previzualizare traseu',
    safe: 'Sigur',
    fast: 'Rapid',
    savedRoutes: 'Trasee salvate',
    reportHazard: 'Raportează pericol',
    centerLocation: 'Centrează pe locația curentă',
  },

  // ── Route Preview ──
  preview: {
    startNavigation: 'Începe navigarea',
    switchToSafe: 'Schimbă pe traseu sigur',
    saveRoute: 'Salvează traseu',
    riskDistribution: 'Distribuția riscului',
    elevationProfile: 'Profil altitudine',
    routeComparison: 'Comparație trasee',
  },

  // ── Navigation ──
  nav: {
    arrived: 'Ați ajuns la destinație.',
    inMeters: 'Peste {{distance}} metri, {{instruction}}',
    minutesRemaining_one: 'Aproximativ 1 minut rămas.',
    minutesRemaining_other: 'Aproximativ {{count}} minute rămase.',
    endRide: 'Termină cursa',
    recenter: 'Recentrează',
    offRoute: 'Ești în afara traseului',
    rerouting: 'Se recalculează...',
  },

  // ── Feedback ──
  feedback: {
    title: 'Cum a fost cursa?',
    subtitle: 'Feedback-ul tău ne ajută să îmbunătățim traseele',
    submit: 'Trimite feedback',
    skip: 'Sari peste',
  },

  // ── Profile ──
  profile: {
    title: 'Profil',
    eyebrow: 'Defensive Pedal',
    subtitle: 'Contul și setările tale',
    tapToSignIn: 'Apasă pentru a te conecta',
    signOut: 'Deconectare',
    setUsername: 'Setează nume utilizator',
    changeUsername: 'Schimbă nume utilizator',
    minChars: 'Minim 3 caractere',
    usernameTaken: 'Nume utilizator deja folosit',
    language: 'Limbă',

    // Sections
    aboutYou: 'Despre tine',
    bikeType: 'Tipul bicicletei',
    cyclingFrequency: 'Cât de des pedalezi?',
    routingPreferences: 'Preferințe de traseu',
    avoidUnpaved: 'Evită drumurile neasfaltate',
    compareRoutes: 'Compară traseu sigur vs rapid',
    showBikeLanes: 'Arată pistele de biciclete pe hartă',
    pointsOfInterest: 'Puncte de interes',
    notifications: 'Notificări',
    dailyWeather: 'Meteo zilnic',
    hazardAlerts: 'Alerte pericole',
    community: 'Comunitate',
    quietHours: 'Ore de liniște',
    privacy: 'Confidențialitate',
    shareTrips: 'Distribuie cursele public',
    guardianTier: 'Nivel gardian',
    rebuildRequired: 'Rebuild necesar',
    rebuildMessage: 'Selectorul de fotografii necesită rebuild nativ.',
    photoUploadFailed: 'Încărcarea fotografiei a eșuat',
  },

  // ── History ──
  history: {
    title: 'Istoric',
    subtitle: 'Cursele și impactul tău',
    noTrips: 'Nicio cursă încă',
    totalRides: 'Total curse',
    totalDistance: 'Distanță totală',
    totalDuration: 'Durată totală',
    co2Saved: 'CO2 economisit',
    eurSaved: 'EUR economisiți',
    currentStreak: 'Serie curentă',
    longestStreak: 'Cea mai lungă serie',
    exportGpx: 'Exportă GPX',
  },

  // ── Community ──
  communityScreen: {
    title: 'Comunitate',
    subtitle: 'Cicliști din apropiere',
    feed: 'Flux',
    noActivity: 'Nicio activitate în apropiere',
    like: 'Apreciază',
    love: 'Adoră',
    comment: 'Comentariu',
    follow: 'Urmărește',
    unfollow: 'Nu mai urmări',
    shareRide: 'Distribuie cursa',
  },

  // ── Hazard Reporting ──
  hazard: {
    title: 'Raportează pericol',
    parkedCar: 'Mașină parcată',
    blockedLane: 'Bandă blocată',
    pothole: 'Groapă',
    construction: 'Construcție',
    aggroTraffic: 'Trafic agresiv',
    other: 'Altele',
    reported: 'Raportat! Alți cicliști vor fi avertizați.',
    stillThere: 'Încă acolo?',
    confirm: 'Confirmă',
    deny: 'Dispărut',
  },

  // ── Weather ──
  weather: {
    feelsLike: 'Se simte ca',
    wind: 'Vânt',
    aqi: 'Calitate aer',
    precipitation: 'Precipitații',
  },

  // ── Onboarding ──
  onboarding: {
    welcome: 'Bine ai venit la Defensive Pedal',
    safetyScore: 'Scorul de siguranță al zonei tale',
    setCyclingGoal: 'Setează-ți obiectivul de ciclism',
    tryFirstRoute: 'Încearcă primul tău traseu',
    createAccount: 'Creează cont',
    skip: 'Sari deocamdată',
    getStarted: 'Începe',
  },

  // ── Impact ──
  impact: {
    title: 'Impactul tău',
    co2Saved: 'CO2 economisit',
    moneySaved: 'Bani economisiți',
    hazardsReported: 'Pericole raportate',
    equivalent: 'echivalent cu',
  },

  // ── Streak ──
  streak: {
    dayStreak: 'Serie de {{count}} zile',
    frozen: 'Înghețat',
    keepItUp: 'Continuă tot așa!',
  },
} as const;
