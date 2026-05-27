/**
 * Static quiz question pool — SPAIN variant.
 *
 * Mirror of `quiz-questions.ts` (Romania) adapted for riders in Spain.
 *
 * What changed vs the Romanian source:
 * - Legal references: "Codul Rutier" → "Reglamento General de Circulación (RGC)";
 *   enforcement body is the DGT (Dirección General de Tráfico).
 * - Cities: Bucharest, Cluj, Timișoara, Sibiu, Brașov, Sighișoara, Iași →
 *   Madrid, Barcelona, Valencia, Sevilla, Bilbao, Zaragoza, Toledo, Córdoba,
 *   Granada, Santiago de Compostela.
 * - Road types: Romanian DN (drum național) → Spanish N-roads (carreteras
 *   nacionales) and autovías.
 * - EuroVelo routes through Spain: EV1 (Atlantic Coast / Camino del Norte),
 *   EV3 (Pilgrims Route — Santiago de Compostela), EV8 (Mediterranean Route).
 * - Stricter Spanish rules surfaced where they differ:
 *     • Helmet: mandatory for ALL outside urban areas, and for under-16 EVERYWHERE.
 *     • Phone: handheld AND hands-free both banned; no headphones/earbuds either.
 *     • Reflective gear: required at night / low visibility everywhere
 *       (not only outside built-up areas).
 *     • Sidewalk: forbidden unless signposted; under-14 may ride on sidewalks
 *       under adult supervision.
 *     • Overtaking: driver must leave ≥1.5 m AND drop speed by 20 km/h below
 *       the posted limit.
 *     • Alcohol: 0.5 g/L blood / 0.25 mg/L breath — same as motorists.
 * - Spain-specific hazards: summer heat / heatstroke, costa crosswinds (Tarifa,
 *   Levante), cobblestones in old quarters, autovía cycling restrictions.
 *
 * Same shape and category labels as the Romanian file so the API serving layer
 * (`fetchDailyQuiz` / `submitQuizAnswer` in `services/mobile-api/src/routes/v1.ts`)
 * can swap in this pool without code changes — only the import path differs.
 *
 * IDs are FRESH stable UUIDs. They do NOT collide with the Romanian pool.
 * If you ever switch a deployment from RO → ES, existing `user_quiz_history`
 * rows pointing at Romanian UUIDs simply stop matching — that's intended.
 */

export interface StaticQuizQuestion {
  readonly id: string;
  readonly questionText: string;
  readonly options: readonly string[];
  readonly correctIndex: number;
  readonly explanation: string;
  readonly category: string;
  readonly difficulty: number;
}

export const QUIZ_QUESTIONS_ES: readonly StaticQuizQuestion[] = [
  // ── Road Safety ──────────────────────────────────────────────────────────
  {
    id: 'a1f2e3d4-c5b6-4a7e-8d9c-0b1a2c3d4e5f',
    questionText: 'What is the legal minimum passing distance for cars overtaking cyclists in Spain?',
    options: ['0.5 meters', '1 meter', '1.5 meters', '3 meters'],
    correctIndex: 2,
    explanation: 'The Reglamento General de Circulación (Art. 35) requires drivers to leave at least 1.5 meters of lateral space when overtaking a cyclist. Drivers must also reduce their speed by 20 km/h below the posted limit while passing. Violations carry fines of €200 and 4 license points.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'b2e3d4c5-b6a7-4f8e-9d0c-1a2b3c4d5e6f',
    questionText: 'What should you do at a red light on your bicycle in Spain?',
    options: [
      'Stop and wait like any other vehicle',
      'Proceed carefully if no cars are coming',
      'Dismount and cross as a pedestrian',
      'Turn right to avoid waiting',
    ],
    correctIndex: 0,
    explanation: 'Under the Reglamento General de Circulación, cyclists are vehicle users and must obey traffic signals. Running a red light carries a fine of up to €200 and is one of the leading causes of cyclist–vehicle collisions at intersections.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'c3d4e5f6-a7b8-4c9d-8e0f-2b3c4d5e6f70',
    questionText: 'How far ahead should you look while cycling in traffic?',
    options: [
      'At your front wheel',
      'One car length ahead',
      'At least 3-4 seconds of travel distance ahead',
      'Only at the car directly in front',
    ],
    correctIndex: 2,
    explanation: 'Looking 3-4 seconds ahead gives you time to react to hazards, potholes, and traffic changes. Scanning further improves your safety significantly, especially on busy avenues in Madrid or Barcelona.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'd4e5f6a7-b8c9-4d0e-9f1a-3c4d5e6f7081',
    questionText: 'When cycling at night in Spain, what lights are legally required?',
    options: [
      'No lights required',
      'A white front light only',
      'A white front light and red rear light',
      'Flashing lights on the helmet',
    ],
    correctIndex: 2,
    explanation: 'Spanish law requires a white front light and a red rear light at night or in poor visibility. Reflectors on pedals and wheels are also mandatory, and a reflective vest or other reflective clothing must be worn at night or in low-light conditions, including in urban areas.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'e5f6a7b8-c9d0-4e1f-a02b-4d5e6f708192',
    questionText: 'What should you do when approaching a roundabout (rotonda) on a bicycle in Spain?',
    options: [
      'Speed up to get through quickly',
      'Yield to traffic already in the roundabout',
      'Always dismount and walk',
      'Ride on the sidewalk around it',
    ],
    correctIndex: 1,
    explanation: 'Cyclists must yield to traffic already in the rotonda, just like cars. Take the lane confidently rather than hugging the outside — Spanish drivers expect a vehicle taking the lane and giving way at entry, then exiting with a clear arm signal.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'f6a7b8c9-d0e1-4f2a-b13c-5e6f70819203',
    questionText: 'How should you signal a left turn on a bicycle?',
    options: [
      'Extend your left arm straight out',
      'Extend your right arm straight out',
      'Wave both arms',
      'No signal needed',
    ],
    correctIndex: 0,
    explanation: 'Extend your left arm straight out to signal a left turn. Signal well before the turn so drivers can anticipate your movement. Arm signals are required by the Reglamento General de Circulación.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'a7b8c9d0-e1f2-4a3b-c24d-6f7081920314',
    questionText: 'What is the door zone?',
    options: [
      'A bike parking area',
      'The space next to parked cars where doors can suddenly open',
      'A traffic-calmed zone',
      'A designated delivery area',
    ],
    correctIndex: 1,
    explanation: 'The door zone extends about 1.5 meters from parked cars. Dooring is one of the most common urban cycling accidents in Spanish cities, where on-street parking sits right next to the carriageway. Always ride outside this zone.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'b8c9d0e1-f2a3-4b4c-d35e-708192031425',
    questionText: 'What is the safest position for a cyclist on a road without bike lanes in Spain?',
    options: [
      'Far right edge of the road',
      'Center of the rightmost lane',
      'On the sidewalk',
      'Between parked cars',
    ],
    correctIndex: 1,
    explanation: 'Riding in the center of the lane makes you more visible and prevents dangerous close passes. The Reglamento General de Circulación explicitly allows cyclists to ride two abreast and to take the lane when the right edge is unsafe.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'c9d0e1f2-a3b4-4c5d-e46f-819203142536',
    questionText: 'What should you check before every ride?',
    options: [
      'Tire pressure, brakes, and chain',
      'Only the tire pressure',
      'Nothing if the bike looks fine',
      'Just the brakes',
    ],
    correctIndex: 0,
    explanation: 'The ABC check: Air (tire pressure), Brakes (both working), Chain (lubed and not loose). Takes 30 seconds and prevents most mechanical failures — particularly relevant in Spanish summer heat, which accelerates tire pressure changes.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'd0e1f2a3-b4c5-4d6e-f570-920314253647',
    questionText: 'Are cyclists in Spain allowed to ride on the sidewalk (acera)?',
    options: [
      'Yes, always',
      'No — sidewalk cycling is generally prohibited unless explicitly signposted, with limited exceptions for children',
      'Yes, if you ride at walking speed',
      'Only in parks',
    ],
    correctIndex: 1,
    explanation: 'Spanish law prohibits cycling on sidewalks and pedestrian-only areas unless they are specifically signposted as shared. Children under 14 may ride on sidewalks under adult supervision. Adults cycling on a regular acera risk a fine of €100–€200.',
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: 'e1f2a3b4-c5d6-4e7f-0681-a30425364758',
    questionText: 'What should you do if a dog chases you while cycling?',
    options: [
      'Speed up and outrun it',
      'Stop, dismount, and put the bike between you and the dog',
      'Kick at it while riding',
      'Throw food at it',
    ],
    correctIndex: 1,
    explanation: 'Stopping and using your bike as a barrier is the safest approach. Most dogs stop chasing once you stop moving. Speak calmly and avoid eye contact. This matters on rural roads in regions like Extremadura, Castilla-La Mancha and parts of Andalucía where loose farm dogs can be encountered.',
    category: 'road_safety',
    difficulty: 2,
  },

  // ── Risk Awareness ───────────────────────────────────────────────────────
  {
    id: 'f2a3b4c5-d6e7-4f8a-1792-b40536475869',
    questionText: 'Which type of road has the lowest cycling accident rate?',
    options: [
      'Multi-lane highways',
      'Residential streets with speed limits of 30 km/h or below',
      'Roads with painted bike lanes',
      'One-way streets',
    ],
    correctIndex: 1,
    explanation: 'Low-speed residential streets — including Spain’s "Zonas 30" and "Ciudad 30" rollouts in Madrid, Barcelona, Bilbao, Pontevedra and many others — have the lowest accident rates for cyclists. Speed is the strongest predictor of accident severity.',
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: 'a3b4c5d6-e7f8-4a9b-28a3-c5064758697a',
    questionText: 'Why are large vehicles (trucks, buses) especially dangerous for cyclists?',
    options: [
      'They are slower',
      'They have large blind spots and wide turning arcs',
      'They create too much wind',
      'They block the view of traffic lights',
    ],
    correctIndex: 1,
    explanation: 'Large vehicles have extensive blind spots on all sides and their rear wheels track inside the front wheels during turns, creating a deadly crush zone. Stay well behind a turning bus or truck — never alongside.',
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: 'b4c5d6e7-f8a9-4b0c-39b4-d6075869708b',
    questionText: 'Which surface is most slippery for cyclists when wet?',
    options: ['Asphalt', 'Concrete', 'Metal grates, manhole covers, and tram tracks', 'Brick'],
    correctIndex: 2,
    explanation: 'Metal surfaces become extremely slippery when wet. In Spanish cities with trams — Barcelona, Bilbao, Valencia, Zaragoza, Sevilla and Murcia — always cross tram tracks at a right angle and never ride along them.',
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'c5d6e7f8-a9b0-4c1d-4ac5-e708697081ac',
    questionText: 'How much does rain increase cycling accident risk?',
    options: [
      'No significant increase',
      'About 30% more risk',
      'About 70% more risk',
      'Double the risk',
    ],
    correctIndex: 2,
    explanation: 'Studies show wet roads increase cycling accident risk by approximately 70% due to reduced traction and longer braking distances. In Spain, the first rain after a long dry spell — common in summer — is especially treacherous because oil residue surfaces on the asphalt.',
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'd6e7f8a9-b0c1-4d2e-5bd6-f8197a8192bd',
    questionText: 'When is the most dangerous time of day for cycling?',
    options: [
      'Early morning (6-8 AM)',
      'Midday (12-2 PM)',
      'Evening rush hour (5-8 PM)',
      'Late night (10 PM-12 AM)',
    ],
    correctIndex: 2,
    explanation: 'Evening rush hour combines heavy traffic, tired drivers, changing light conditions, and sun glare — making it the highest-risk period for cyclists. In Spain, summer evening rides also overlap with the strong low-angle sunset light that blinds westbound drivers.',
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'e7f8a9b0-c1d2-4e3f-6ce7-08208b9203ce',
    questionText: 'What percentage of cycling fatalities involve head injuries?',
    options: ['About 20%', 'About 40%', 'About 60%', 'About 80%'],
    correctIndex: 2,
    explanation: 'Approximately 60% of cycling fatalities involve head injuries. Wearing a helmet reduces the risk of serious head injury by up to 70%. In Spain, helmets are legally required for ALL cyclists outside urban areas, and for under-16s everywhere.',
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'f8a9b0c1-d2e3-4f4a-7df8-19319ca314df',
    questionText: 'How does wind affect cycling safety in Spain?',
    options: [
      'Only headwinds are dangerous',
      'Strong crosswinds can push you into traffic or off the road',
      'Wind has no effect on safety',
      'Tailwinds are the most dangerous',
    ],
    correctIndex: 1,
    explanation: 'Crosswinds above 30 km/h can destabilize cyclists, especially on exposed coastal roads. Spain has several wind hotspots — Tarifa (Levante / Poniente winds), the Cantabrian coast, and Aragón’s Cierzo corridor — where gusts can be severe. Adjust your grip and lean into the wind.',
    category: 'risk_awareness',
    difficulty: 2,
  },

  // ── Infrastructure ───────────────────────────────────────────────────────
  {
    id: 'a9b0c1d2-e3f4-4a5b-8e09-2a42ad425ae0',
    questionText: 'What does a green bike box (ciclocaja) at an intersection mean?',
    options: [
      'Bikes must stop here',
      'An advanced stop area where cyclists wait ahead of cars at a red light',
      'A bike repair station',
      'A bike sharing dock',
    ],
    correctIndex: 1,
    explanation: 'A "ciclocaja" or bike box is a designated area at the head of a traffic lane that provides cyclists a safe and visible way to wait ahead of queuing traffic. Common in Spanish cities investing in carril bici networks, including Madrid, Barcelona and Sevilla.',
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'b0c1d2e3-f4a5-4b6c-9f1a-3b53be536bf1',
    questionText: 'What is the purpose of a bike lane buffer zone on a carril bici?',
    options: [
      'Extra space for parking',
      'A painted or physical area separating the bike lane from vehicle traffic',
      'A waiting area for pedestrians',
      'Space for street furniture',
    ],
    correctIndex: 1,
    explanation: 'Buffer zones provide additional separation between cyclists and motor vehicles, reducing the risk of sideswipe collisions and dooring incidents. Sevilla’s award-winning network and Barcelona’s newer carrils bici both rely heavily on buffer zones.',
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'c1d2e3f4-a5b6-4c7d-a02b-4c64cf647c02',
    questionText: 'How should you cross tram tracks on a bicycle?',
    options: [
      'Ride along them to follow the route',
      'Cross at a right angle (as close to 90° as possible)',
      'Speed up and cross at any angle',
      'Dismount and carry the bike across',
    ],
    correctIndex: 1,
    explanation: 'Tram tracks can trap a bicycle wheel if crossed at a shallow angle, causing an instant crash. Always cross at a right angle. This is critical in Spanish cities with active tram systems — Bilbao, Valencia, Barcelona, Zaragoza, Sevilla and Murcia — where tram lines share the road with cyclists.',
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'd2e3f4a5-b6c7-4d8e-b13c-5d75d0758d13',
    questionText: 'What is a contraflow bike lane (carril bici a contracorriente)?',
    options: [
      'A lane that goes against the regular traffic flow on a one-way street',
      'A lane with speed bumps',
      'A lane shared with buses',
      'A lane with traffic counters',
    ],
    correctIndex: 0,
    explanation: 'Contraflow bike lanes allow cyclists to ride in the opposite direction on one-way streets, providing shorter and more direct routes. Madrid and Barcelona have introduced many of these in their historic centres to enable safer cycling routes through narrow streets.',
    category: 'infrastructure',
    difficulty: 2,
  },
  {
    id: 'e3f4a5b6-c7d8-4e9f-c24d-6e86e1869e24',
    questionText: 'What is a protected intersection?',
    options: [
      'An intersection with traffic police',
      'A design that physically separates cyclists from turning vehicles using corner refuge islands',
      'An intersection with no traffic lights',
      'A pedestrian-only crossing',
    ],
    correctIndex: 1,
    explanation: 'Protected intersections use corner refuge islands, setback crossings, and forward queuing areas to keep cyclists safe from turning vehicles. Vitoria-Gasteiz, Sevilla and pilot sites in Barcelona have introduced them as part of their cycling infrastructure modernisation.',
    category: 'infrastructure',
    difficulty: 3,
  },

  // ── First Aid ────────────────────────────────────────────────────────────
  {
    id: 'f4a5b6c7-d8e9-4f0a-d35e-7f97f297af35',
    questionText: 'What should you do if you get a flat tire while riding?',
    options: [
      'Keep riding slowly to the nearest shop',
      'Stop safely, move off the road, then fix it',
      'Call for a ride immediately',
      'Leave the bike and walk',
    ],
    correctIndex: 1,
    explanation: 'Riding on a flat tire damages the rim and is unstable. Pull over safely off the road or into a wide shoulder, then either fix the tube or call for help.',
    category: 'first_aid',
    difficulty: 1,
  },
  {
    id: 'a5b6c7d8-e9f0-4a1b-e46f-80a8030bb046',
    questionText: 'What is the first thing you should do if you witness a cycling accident in Spain?',
    options: [
      'Move the injured person immediately',
      'Call 112 (emergency services)',
      'Try to fix their bike',
      'Leave the scene',
    ],
    correctIndex: 1,
    explanation: 'Call 112 — the EU-wide emergency number — immediately. Do not move the injured person unless they are in immediate danger (e.g., in traffic). Keep them warm and calm until the ambulance arrives. 112 in Spain reaches police, ambulance, Guardia Civil and fire services.',
    category: 'first_aid',
    difficulty: 1,
  },

  // ── Spanish Law ──────────────────────────────────────────────────────────
  {
    id: 'b6c7d8e9-f0a1-4b2c-f570-91b9141cc157',
    questionText: 'Are helmets mandatory for cyclists in Spain?',
    options: [
      'No, never required',
      'Mandatory only for cyclists under 16 years of age, everywhere they ride',
      'Mandatory for ALL cyclists outside urban areas, and for under-16s everywhere',
      'Mandatory for all cyclists at all times',
    ],
    correctIndex: 2,
    explanation: 'The Reglamento General de Circulación makes helmets compulsory for ALL cyclists on interurban roads (outside cities), and for ALL cyclists under 16 years old whether inside or outside urban areas. Exceptions exist for extreme heat or long uphill climbs, and the rule does not apply to competitive cycling events.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'c7d8e9f0-a1b2-4c3d-0681-a2ca252dd268',
    questionText: 'Is it legal to use your phone while cycling in Spain?',
    options: [
      'Yes, if you use one hand',
      'No — handheld phones, hands-free devices, headphones, and earbuds are all prohibited',
      'Only for navigation apps',
      'Only with a Bluetooth earpiece',
    ],
    correctIndex: 1,
    explanation: 'Spanish law is stricter than most: cyclists may not use a handheld phone, AND may not wear headphones or earbuds. Fines reach €200. Use a silent handlebar mount for navigation and pull over to take any call.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'd8e9f0a1-b2c3-4d4e-1792-b3db363ee379',
    questionText: 'Can you be fined for cycling under the influence of alcohol in Spain?',
    options: [
      'No, alcohol laws only apply to drivers',
      'Yes — cyclists are subject to the same alcohol limits as motorists (0.5 g/L blood, 0.25 mg/L breath)',
      'Only if you cause an accident',
      'Only on the carretera, not on the carril bici',
    ],
    correctIndex: 1,
    explanation: 'The Reglamento General de Circulación applies to cyclists. The legal limit is 0.5 g/L of alcohol in blood (0.25 mg/L breath) — the same as for car drivers. Exceeding it results in fines of €500–€1,000, and refusing the breathalyser can be treated as a criminal offence.',
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: 'e9f0a1b2-c3d4-4e5f-28a3-c4ec474ff48a',
    questionText: 'When must a cyclist wear a reflective vest in Spain?',
    options: [
      'Always while cycling',
      'At night or in low-visibility conditions — both inside and outside built-up areas',
      'Only on autovías',
      'Reflective vests are not required',
    ],
    correctIndex: 1,
    explanation: 'Updated Spanish rules require a reflective vest or other reflective garment for cyclists at night or in conditions of reduced visibility — fog, heavy rain, dusk — in urban as well as interurban settings. This is stricter than older rules that only covered rural night riding.',
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: 'f0a1b2c3-d4e5-4f6a-39b4-d5fd585005b9',
    questionText: 'What is the maximum legal assisted speed for an e-bike (EPAC pedelec) in Spain?',
    options: [
      'There is no speed limit',
      '25 km/h (motor assistance cuts off at this speed)',
      '45 km/h',
      '50 km/h, the same as cars in urban areas',
    ],
    correctIndex: 1,
    explanation: 'Standard pedal-powered bicycles have no fixed legal speed limit but must adapt to road, traffic, and visibility conditions. Pedal-assist e-bikes (EPACs) follow the EU pedelec rule: motor assistance cuts off at 25 km/h and the motor must not exceed 250 W. Faster e-bikes (S-pedelecs) require moped registration, insurance, and a license.',
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: 'a1b2c3d4-e5f6-4a7b-4ac5-e60e6961167a',
    questionText: 'May a child legally ride on the sidewalk in Spain?',
    options: [
      'No, never',
      'Yes, children under 14 may ride on sidewalks and pedestrian areas under adult supervision',
      'Only on Sundays',
      'Only in parks',
    ],
    correctIndex: 1,
    explanation: 'Spanish law allows children under 14 to ride on sidewalks and pedestrian areas, provided they are accompanied by a supervising adult and respect pedestrians (priority and walking pace). Adults must use the carriageway or carril bici.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'b2c3d4e5-f6a7-4b8c-5bd6-f71f7a72278b',
    questionText: 'As a cyclist in Spain, what must you do at a pedestrian crossing (paso de cebra)?',
    options: [
      'Ride across normally',
      'Dismount and walk the bike across',
      'Speed up to cross quickly',
      'Ride across but yield to pedestrians',
    ],
    correctIndex: 1,
    explanation: 'Spanish traffic rules require cyclists to dismount and walk their bicycle across a pedestrian crossing. Riding through a paso de cebra is treated as a vehicle ignoring pedestrian priority, and is a finable offence.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'c3d4e5f6-a7b8-4c9d-6ce7-08208b83389c',
    questionText: 'How should you signal that you are stopping on a bicycle?',
    options: [
      'Ring your bell repeatedly',
      'Raise either arm straight up',
      'Wave your hand behind you',
      'No signal is needed',
    ],
    correctIndex: 1,
    explanation: 'To signal stopping, raise one arm vertically above your head. This is the internationally recognized stop signal and is required by the Reglamento General de Circulación before slowing or stopping in traffic.',
    category: 'road_safety',
    difficulty: 1,
  },

  // ── Spanish Hazards ──────────────────────────────────────────────────────
  {
    id: 'd4e5f6a7-b8c9-4d0e-7df8-19319c9449ad',
    questionText: 'Why are cobblestone streets particularly dangerous for cyclists?',
    options: [
      'They are too bumpy for comfort',
      'Gaps between stones can trap thin tires and cause falls, especially when wet',
      'They are too slow to ride on',
      'Cars cannot see cyclists on cobblestones',
    ],
    correctIndex: 1,
    explanation: 'Cobblestone streets, common in Spanish old town centres like Toledo, Córdoba, Granada, Sevilla, Cáceres and Santiago de Compostela, have gaps that can catch narrow road bike tires. Reduce speed, use wider tires if possible, and avoid sharp braking on wet cobblestones — they are extremely slippery after rain.',
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: 'e5f6a7b8-c9d0-4e1f-8e09-2a42adaa50be',
    questionText: 'Can you cycle on a Spanish autovía or autopista?',
    options: [
      'Yes, in the right shoulder',
      'No — cycling is prohibited on most autovías and all autopistas',
      'Only on weekends',
      'Only with a special permit',
    ],
    correctIndex: 1,
    explanation: 'Bicycles are banned from autopistas (toll motorways) and from most autovías (free motorways). Some autovía stretches allow cyclists on the shoulder when no alternative route exists — look for the white circular sign with a red diagonal over a bicycle to confirm the prohibition. Cycling is allowed on N-roads (carreteras nacionales) unless specifically signposted otherwise.',
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: 'f6a7b8c9-d0e1-4f2a-9f1a-3b53beb561cf',
    questionText: 'What is the biggest hazard when cycling near parked cars in Spanish cities?',
    options: [
      'Cars parked on the bike lane',
      'Doors suddenly opening into your path (dooring)',
      'Exhaust fumes',
      'Blocked visibility at intersections',
    ],
    correctIndex: 1,
    explanation: 'Dooring — a parked car door opening into your path — is one of the most common urban cycling accidents. In Spanish cities where cars often park right next to the road, maintain at least 1 meter of distance from parked vehicles. Scan ahead for occupied driver seats and brake lights.',
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: 'a7b8c9d0-e1f2-4a3b-a02b-4c64cfc672da',
    questionText: 'During which season should Spanish cyclists be most cautious about heat-related risks?',
    options: [
      'Winter, because of frost',
      'Summer — heatstroke, dehydration, and afternoon UV peak between 12:00 and 17:00',
      'Autumn only',
      'Heat is never a major issue in Spain',
    ],
    correctIndex: 1,
    explanation: 'Spanish summers — especially inland in Andalucía, Extremadura, Castilla and Aragón — regularly exceed 38 °C. Avoid riding between 12:00 and 17:00 when possible, carry at least 750 ml of water per hour, watch for early heatstroke signs (dizziness, no sweating, confusion), and adjust your route to use shaded streets and tree-lined avenues.',
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'b8c9d0e1-f2a3-4b4c-b13c-5d75d0d783eb',
    questionText: 'What should you do when a bus pulls away from a stop while you are cycling alongside it?',
    options: [
      'Speed up to pass it before it merges',
      'Slow down and let the bus merge — assume the driver has not seen you',
      'Ride between the bus and the curb',
      'Honk or ring your bell loudly',
    ],
    correctIndex: 1,
    explanation: 'EMT buses in Madrid, TMB buses in Barcelona, and city buses elsewhere pull out from stops frequently. The driver may not see you in the mirror. Always assume you are invisible and let the bus merge first — you will catch up at the next stop.',
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: 'c9d0e1f2-a3b4-4c5d-c24d-6e86e1e894fc',
    questionText: 'What is the right-hook danger at intersections?',
    options: [
      'A car turning left across your path',
      'A car turning right across your path while you continue straight',
      'A pedestrian stepping in front of you',
      'A pothole on the right side of the road',
    ],
    correctIndex: 1,
    explanation: 'The right-hook happens when a car overtakes you and immediately turns right, cutting across your path. At intersections, make eye contact with drivers and be ready to brake. This is a leading cause of urban cycling accidents in Spain, particularly where carriles bici sit to the right of the traffic lane.',
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'd0e1f2a3-b4c5-4d6e-d35e-7f97f2f9a50d',
    questionText: 'How does air pollution affect cyclists?',
    options: [
      'It has no effect since you are outdoors',
      'Cyclists inhale more pollutants than car occupants due to deeper breathing',
      'It only affects runners, not cyclists',
      'Pollution is only a problem in industrial areas',
    ],
    correctIndex: 1,
    explanation: 'Cyclists breathe deeper and faster than car occupants, inhaling 2-5 times more pollutants. In cities like Madrid (Plaza Elíptica, Marqués de Vadillo) and Barcelona (Eixample) where NO2 and PM levels can spike, prefer routes through parks (Retiro, Casa de Campo, Ciutadella) or side streets, and avoid rush-hour traffic on major boulevards.',
    category: 'risk_awareness',
    difficulty: 2,
  },

  // ── Spanish Infrastructure ───────────────────────────────────────────────
  {
    id: 'e1f2a3b4-c5d6-4e7f-e46f-80a803aab61e',
    questionText: 'What should you do when a carril bici in Spain is blocked by a parked car?',
    options: [
      'Ride on the sidewalk to go around it',
      'Check traffic, signal, merge into the traffic lane, pass the obstacle, then return',
      'Stop and wait for the car to move',
      'Squeeze between the car and the curb',
    ],
    correctIndex: 1,
    explanation: 'Carril bici blockage by delivery vehicles or illegally parked cars is common in Spanish cities. Check over your shoulder, signal with your arm, merge safely into the traffic lane, pass the obstacle, and return to the carril bici. Never squeeze into a gap between a car and the curb — that’s the door zone.',
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'f2a3b4c5-d6e7-4f8a-f570-91b914bbc72f',
    questionText: 'What does a blue circular sign with a white bicycle (señal R-407a) mean in Spain?',
    options: [
      'No cycling allowed',
      'Mandatory bike path — cyclists must use it instead of the carriageway',
      'Shared path for cyclists and pedestrians',
      'Bicycle parking ahead',
    ],
    correctIndex: 1,
    explanation: 'The blue circular sign with a white bicycle (R-407a) indicates a mandatory bike path or via ciclista. When this sign is present, cyclists are legally required to use the marked path instead of the main carriageway. The sign showing both a bicycle and a pedestrian (R-407b) indicates a shared path.',
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'a3b4c5d6-e7f8-4a9b-0681-a2ca25ccd830',
    questionText: 'What is the EuroVelo network and why is it relevant to Spanish cyclists?',
    options: [
      'A bike-sharing programme in Madrid',
      'A network of long-distance cycling routes crossing Europe — EV1, EV3 and EV8 all pass through Spain',
      'An EU regulation on bicycle standards',
      'A cycling insurance programme',
    ],
    correctIndex: 1,
    explanation: 'EuroVelo is a network of 17 long-distance cycling routes. In Spain, EV1 (Atlantic Coast Route) follows the Camino del Norte from País Vasco to Galicia; EV3 (Pilgrims Route) terminates in Santiago de Compostela; and EV8 (Mediterranean Route) runs from Cádiz along the coast to Catalonia and into France.',
    category: 'infrastructure',
    difficulty: 3,
  },
  {
    id: 'b4c5d6e7-f8a9-4b0c-1792-b3db36dde941',
    questionText: 'How should you handle a railway crossing on a bicycle in Spain?',
    options: [
      'Speed up to cross quickly',
      'Cross tracks at a right angle, slow down, and check for trains in both directions',
      'Follow the car in front of you across',
      'Dismount only if barriers are down',
    ],
    correctIndex: 1,
    explanation: 'Spanish railway crossings (pasos a nivel) can be unguarded, especially on rural roads and on parts of the secondary FEVE / Renfe Cercanías network. Always slow down, look and listen for trains in both directions, and cross tracks at a right angle to avoid your wheel getting caught in the rail groove.',
    category: 'infrastructure',
    difficulty: 2,
  },
] as const;

/** Look up a question by its stable UUID. */
export function findQuizQuestionEs(id: string): StaticQuizQuestion | undefined {
  return QUIZ_QUESTIONS_ES.find((q) => q.id === id);
}
