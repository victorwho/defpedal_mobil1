/**
 * Static quiz question pool.
 *
 * Questions are served from this file rather than a database table so that:
 * - Content is version-controlled and reviewable in diffs
 * - Any fresh environment gets the full pool without manual seeding
 * - No DB query needed for the question catalogue (only for user history)
 *
 * IDs are stable UUIDs so existing `user_quiz_history` rows remain valid.
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

export const QUIZ_QUESTIONS: readonly StaticQuizQuestion[] = [
  // ── Road Safety ──────────────────────────────────────────────────────────
  {
    id: 'b723794c-7ecb-4aaf-a4f0-32dcdc55161e',
    questionText: 'What is the recommended minimum passing distance for cars overtaking cyclists?',
    options: ['0.5 meters', '1 meter', '1.5 meters', '3 meters'],
    correctIndex: 2,
    explanation: 'Most safety guidelines recommend at least 1.5 meters (5 feet) of passing distance. Many countries have made this a legal requirement.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '83f34e7d-bfb8-4566-957c-7a2255b7a11d',
    questionText: 'What should you do at a red light on your bicycle?',
    options: [
      'Stop and wait like any other vehicle',
      'Proceed carefully if no cars are coming',
      'Dismount and cross as a pedestrian',
      'Turn right to avoid waiting',
    ],
    correctIndex: 0,
    explanation: 'Cyclists must obey traffic signals. Running red lights is illegal and one of the leading causes of cyclist-vehicle collisions at intersections.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '57f93e1f-6294-42a7-8a71-6edbf959571e',
    questionText: 'How far ahead should you look while cycling in traffic?',
    options: [
      'At your front wheel',
      'One car length ahead',
      'At least 3-4 seconds of travel distance ahead',
      'Only at the car directly in front',
    ],
    correctIndex: 2,
    explanation: 'Looking 3-4 seconds ahead gives you time to react to hazards, potholes, and traffic changes. Scanning further improves your safety significantly.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'cddeaaeb-03ef-428e-aa82-b40bdf12c52b',
    questionText: 'When cycling at night, what lights are legally required in most countries?',
    options: [
      'No lights required',
      'A white front light only',
      'A white front light and red rear light',
      'Flashing lights on the helmet',
    ],
    correctIndex: 2,
    explanation: 'Most jurisdictions require a steady or flashing white front light and a red rear light. Reflectors on pedals and wheels are also commonly required.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '199d5d85-75e6-47d0-a40e-67ea9f6791fb',
    questionText: 'What should you do when approaching a roundabout on a bicycle?',
    options: [
      'Speed up to get through quickly',
      'Yield to traffic already in the roundabout',
      'Always dismount and walk',
      'Ride on the sidewalk around it',
    ],
    correctIndex: 1,
    explanation: 'Cyclists must yield to traffic already in the roundabout, just like cars. Take the lane confidently and signal your exits.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'b0a4fa63-84ed-4404-b0ed-03a68c94e658',
    questionText: 'How should you signal a left turn on a bicycle?',
    options: [
      'Extend your left arm straight out',
      'Extend your right arm straight out',
      'Wave both arms',
      'No signal needed',
    ],
    correctIndex: 0,
    explanation: 'Extend your left arm straight out to signal a left turn. Signal well before the turn so drivers can anticipate your movement.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '696a7492-d551-4fcd-9e41-ef4b810b4598',
    questionText: 'What is the door zone?',
    options: [
      'A bike parking area',
      'The space next to parked cars where doors can suddenly open',
      'A traffic-calmed zone',
      'A designated delivery area',
    ],
    correctIndex: 1,
    explanation: 'The door zone extends about 1.5 meters from parked cars. Dooring is one of the most common urban cycling accidents. Always ride outside this zone.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '33abb651-31ab-4a23-840d-437b41e53e37',
    questionText: 'What is the safest position for a cyclist on a road without bike lanes?',
    options: [
      'Far right edge of the road',
      'Center of the rightmost lane',
      'On the sidewalk',
      'Between parked cars',
    ],
    correctIndex: 1,
    explanation: 'Riding in the center of the lane (taking the lane) makes you more visible and prevents dangerous close passes. It is legal in most jurisdictions.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'e8dde6a5-4a5f-4362-aba2-93c9f5b7b681',
    questionText: 'What should you check before every ride?',
    options: [
      'Tire pressure, brakes, and chain',
      'Only the tire pressure',
      'Nothing if the bike looks fine',
      'Just the brakes',
    ],
    correctIndex: 0,
    explanation: 'The ABC check: Air (tire pressure), Brakes (both working), Chain (lubed and not loose). Takes 30 seconds and prevents most mechanical failures.',
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '58d61bc2-be17-4c55-abd9-aae8397b7876',
    questionText: 'What is the Idaho Stop law?',
    options: [
      'Cyclists must always stop at stop signs',
      'Cyclists can treat stop signs as yield signs',
      'Cyclists cannot ride on highways',
      'Cyclists must walk through intersections',
    ],
    correctIndex: 1,
    explanation: 'The Idaho Stop allows cyclists to treat stop signs as yield signs and red lights as stop signs. It is named after Idaho, which first adopted it in 1982.',
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: '72abe9f9-3526-48cf-a6f0-f5c68ee337dd',
    questionText: 'What should you do if a dog chases you while cycling?',
    options: [
      'Speed up and outrun it',
      'Stop, dismount, and put the bike between you and the dog',
      'Kick at it while riding',
      'Throw food at it',
    ],
    correctIndex: 1,
    explanation: 'Stopping and using your bike as a barrier is the safest approach. Most dogs stop chasing once you stop moving. Speak calmly and avoid eye contact.',
    category: 'road_safety',
    difficulty: 2,
  },

  // ── Risk Awareness ───────────────────────────────────────────────────────
  {
    id: '15e4ae40-7dcb-41bd-ac11-d1001a67938d',
    questionText: 'Which type of road has the lowest cycling accident rate?',
    options: [
      'Multi-lane highways',
      'Residential streets with speed limits under 30 km/h',
      'Roads with painted bike lanes',
      'One-way streets',
    ],
    correctIndex: 1,
    explanation: 'Low-speed residential streets have the lowest accident rates for cyclists. Speed is the strongest predictor of accident severity.',
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: 'bce4526d-8da9-4765-8d80-57e90c1cf94d',
    questionText: 'Why are large vehicles (trucks, buses) especially dangerous for cyclists?',
    options: [
      'They are slower',
      'They have large blind spots and wide turning arcs',
      'They create too much wind',
      'They block the view of traffic lights',
    ],
    correctIndex: 1,
    explanation: 'Large vehicles have extensive blind spots on all sides and their rear wheels track inside the front wheels during turns, creating a deadly crush zone.',
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: '73d92e43-0493-434a-bb9a-d6bb590ddb81',
    questionText: 'Which surface is most slippery for cyclists when wet?',
    options: ['Asphalt', 'Concrete', 'Metal grates and manhole covers', 'Brick'],
    correctIndex: 2,
    explanation: 'Metal surfaces (grates, manhole covers, rail tracks) become extremely slippery when wet. Cross them at a right angle and avoid braking on them.',
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: '809c615d-4378-4dab-a57f-338e35af8783',
    questionText: 'How much does rain increase cycling accident risk?',
    options: [
      'No significant increase',
      'About 30% more risk',
      'About 70% more risk',
      'Double the risk',
    ],
    correctIndex: 2,
    explanation: 'Studies show wet roads increase cycling accident risk by approximately 70% due to reduced traction and longer braking distances.',
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: '664c94fc-8adb-48c9-86e1-3e9d69c2b032',
    questionText: 'When is the most dangerous time of day for cycling?',
    options: [
      'Early morning (6-8 AM)',
      'Midday (12-2 PM)',
      'Evening rush hour (5-7 PM)',
      'Late night (10 PM-12 AM)',
    ],
    correctIndex: 2,
    explanation: 'Evening rush hour combines heavy traffic, tired drivers, changing light conditions, and sun glare \u2014 making it the highest-risk period for cyclists.',
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: '9c4fae32-6324-4651-850d-da81c7590fff',
    questionText: 'What percentage of cycling fatalities involve head injuries?',
    options: ['About 20%', 'About 40%', 'About 60%', 'About 80%'],
    correctIndex: 2,
    explanation: 'Approximately 60% of cycling fatalities involve head injuries. Wearing a helmet reduces the risk of serious head injury by up to 70%.',
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'a65bbb23-87b0-46c2-aad3-57277eeeb24b',
    questionText: 'How does wind affect cycling safety?',
    options: [
      'Only headwinds are dangerous',
      'Strong crosswinds can push you into traffic or off the road',
      'Wind has no effect on safety',
      'Tailwinds are the most dangerous',
    ],
    correctIndex: 1,
    explanation: 'Crosswinds above 30 km/h can destabilize cyclists, especially on exposed roads, bridges, and when passing gaps between buildings. Adjust your grip and lean.',
    category: 'risk_awareness',
    difficulty: 2,
  },

  // ── Infrastructure ───────────────────────────────────────────────────────
  {
    id: '4a2ea5ad-ad7a-4cfd-8f5f-e0924ee6ccb2',
    questionText: 'What does a green bike box at an intersection mean?',
    options: [
      'Bikes must stop here',
      'An advanced stop area where cyclists wait ahead of cars',
      'A bike repair station',
      'A bike sharing dock',
    ],
    correctIndex: 1,
    explanation: 'A bike box is a designated area at the head of a traffic lane at an intersection that provides cyclists a safe and visible way to get ahead of queuing traffic.',
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'de7ba508-b890-4de3-b1f6-27f7cb21d7d0',
    questionText: 'What is the purpose of a bike lane buffer zone?',
    options: [
      'Extra space for parking',
      'A painted area separating the bike lane from vehicle traffic',
      'A waiting area for pedestrians',
      'Space for street furniture',
    ],
    correctIndex: 1,
    explanation: 'Buffer zones provide additional separation between cyclists and motor vehicles, reducing the risk of sideswipe collisions and dooring incidents.',
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: '8f4b5f0a-4ff9-4403-898a-344aa6c1eb04',
    questionText: 'What does a sharrow marking on the road mean?',
    options: [
      'Bikes only lane',
      'Shared lane \u2014 bikes and cars share the road',
      'No cycling allowed',
      'Pedestrian crossing ahead',
    ],
    correctIndex: 1,
    explanation: 'A sharrow (shared lane marking) indicates that cyclists and motorists share the lane. It reminds drivers to expect cyclists.',
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'a0e78e57-f7c9-4e9e-806c-9f488beb37d0',
    questionText: 'What is a contraflow bike lane?',
    options: [
      'A lane that goes against the regular traffic flow on a one-way street',
      'A lane with speed bumps',
      'A lane shared with buses',
      'A lane with traffic counters',
    ],
    correctIndex: 0,
    explanation: 'Contraflow bike lanes allow cyclists to ride in the opposite direction on one-way streets, providing shorter and more direct routes.',
    category: 'infrastructure',
    difficulty: 2,
  },
  {
    id: 'd876f7a8-26e9-46b6-b416-1beca36fbd30',
    questionText: 'What is a protected intersection?',
    options: [
      'An intersection with traffic police',
      'A design that physically separates cyclists from turning vehicles',
      'An intersection with no traffic lights',
      'A pedestrian-only crossing',
    ],
    correctIndex: 1,
    explanation: 'Protected intersections use corner refuge islands, setback crossings, and forward queuing areas to keep cyclists safe from turning vehicles.',
    category: 'infrastructure',
    difficulty: 3,
  },

  // ── First Aid ────────────────────────────────────────────────────────────
  {
    id: 'c920df12-dbe8-468a-8075-a2900b78deb5',
    questionText: 'What should you do if you get a flat tire while riding?',
    options: [
      'Keep riding slowly to the nearest shop',
      'Stop safely, move off the road, then fix it',
      'Call for a ride immediately',
      'Leave the bike and walk',
    ],
    correctIndex: 1,
    explanation: 'Riding on a flat tire damages the rim and is unstable. Pull over safely, then either fix the tube or call for help.',
    category: 'first_aid',
    difficulty: 1,
  },
  {
    id: '84b7a30f-420a-4818-ab6b-573756d813bb',
    questionText: 'What is the first thing you should do if you witness a cycling accident?',
    options: [
      'Move the injured person immediately',
      'Call emergency services (112/911)',
      'Try to fix their bike',
      'Leave the scene',
    ],
    correctIndex: 1,
    explanation: 'Call emergency services first. Do not move the injured person unless they are in immediate danger (e.g., in traffic). Keep them warm and calm.',
    category: 'first_aid',
    difficulty: 1,
  },
] as const;

/** Look up a question by its stable UUID. */
export function findQuizQuestion(id: string): StaticQuizQuestion | undefined {
  return QUIZ_QUESTIONS.find((q) => q.id === id);
}
