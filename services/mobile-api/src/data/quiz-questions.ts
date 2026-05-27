/**
 * Static quiz question pool — Romania content.
 *
 * Multilingual model:
 *   - One row per question. `id`, `correctIndex`, `category`, `difficulty`
 *     are locale-independent.
 *   - `questionText`, `options`, `explanation` carry localized strings in
 *     all three supported UI locales (en, ro, es).
 *   - The COUNTRY (this file = RO) decides WHICH content (Romanian law,
 *     Romanian cities, Codul Rutier references). The LOCALE decides which
 *     LANGUAGE that content is presented in.
 *
 * This is why a Spanish-UI rider in Bucharest sees Romania-specific quiz
 * content (Codul Rutier, DN roads, București/Cluj/Iași) presented in
 * Spanish — that's the correct UX, not a bug.
 */

export type QuizLocale = 'en' | 'ro' | 'es';

export interface LocalizedText {
  readonly en: string;
  readonly ro: string;
  readonly es: string;
}

export interface LocalizedOptions {
  readonly en: readonly string[];
  readonly ro: readonly string[];
  readonly es: readonly string[];
}

export interface StaticQuizQuestion {
  readonly id: string;
  readonly questionText: LocalizedText;
  readonly options: LocalizedOptions;
  readonly correctIndex: number;
  readonly explanation: LocalizedText;
  readonly category: string;
  readonly difficulty: number;
}

export const QUIZ_QUESTIONS: readonly StaticQuizQuestion[] = [
  // ── Road Safety ──────────────────────────────────────────────────────────
  {
    id: 'b723794c-7ecb-4aaf-a4f0-32dcdc55161e',
    questionText: {
      en: 'What is the legal minimum passing distance for cars overtaking cyclists in Romania?',
      ro: 'Care este distanța minimă legală de depășire pe care un autovehicul trebuie să o lase față de un biciclist în România?',
      es: '¿Cuál es la distancia legal mínima que un coche debe dejar al adelantar a un ciclista en Rumanía?',
    },
    options: {
      en: ['0.5 meters', '1 meter', '1.5 meters', '3 meters'],
      ro: ['0,5 metri', '1 metru', '1,5 metri', '3 metri'],
      es: ['0,5 metros', '1 metro', '1,5 metros', '3 metros'],
    },
    correctIndex: 2,
    explanation: {
      en: 'Romanian law (Codul Rutier, Art. 120) requires drivers to leave at least 1.5 meters of lateral space when overtaking a cyclist. Violations are finable.',
      ro: 'Codul Rutier (Art. 120) obligă șoferii să lase cel puțin 1,5 metri lateral atunci când depășesc un biciclist. Nerespectarea se sancționează cu amendă.',
      es: 'El Código de Circulación rumano (Codul Rutier, Art. 120) exige al conductor dejar al menos 1,5 metros de espacio lateral al adelantar a un ciclista. Las infracciones se sancionan con multa.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '83f34e7d-bfb8-4566-957c-7a2255b7a11d',
    questionText: {
      en: 'What should you do at a red light on your bicycle?',
      ro: 'Ce trebuie să faci la semafor pe roșu, pe bicicletă?',
      es: '¿Qué debes hacer en un semáforo en rojo cuando vas en bici?',
    },
    options: {
      en: [
        'Stop and wait like any other vehicle',
        'Proceed carefully if no cars are coming',
        'Dismount and cross as a pedestrian',
        'Turn right to avoid waiting',
      ],
      ro: [
        'Te oprești și aștepți ca orice alt vehicul',
        'Treci cu grijă dacă nu vine nicio mașină',
        'Cobori și treci ca pieton',
        'Virezi dreapta ca să nu mai aștepți',
      ],
      es: [
        'Parar y esperar como cualquier otro vehículo',
        'Pasar con cuidado si no vienen coches',
        'Bajarte y cruzar como peatón',
        'Girar a la derecha para no esperar',
      ],
    },
    correctIndex: 0,
    explanation: {
      en: 'Cyclists must obey traffic signals. Running red lights is illegal and one of the leading causes of cyclist-vehicle collisions at intersections.',
      ro: 'Cicliștii trebuie să respecte semnalele luminoase. Trecerea pe roșu este ilegală și una dintre cauzele frecvente ale coliziunilor dintre cicliști și vehicule în intersecții.',
      es: 'Los ciclistas deben obedecer las señales luminosas. Saltarse un rojo es ilegal y una de las principales causas de colisiones entre ciclistas y vehículos en los cruces.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '57f93e1f-6294-42a7-8a71-6edbf959571e',
    questionText: {
      en: 'How far ahead should you look while cycling in traffic?',
      ro: 'La ce distanță trebuie să te uiți în față când pedalezi în trafic?',
      es: '¿A qué distancia debes mirar por delante mientras pedaleas en tráfico?',
    },
    options: {
      en: [
        'At your front wheel',
        'One car length ahead',
        'At least 3-4 seconds of travel distance ahead',
        'Only at the car directly in front',
      ],
      ro: [
        'La roata din față',
        'Cu o mașină în față',
        'La cel puțin 3-4 secunde distanță parcursă în față',
        'Doar la mașina chiar din față',
      ],
      es: [
        'A tu rueda delantera',
        'A un coche por delante',
        'Al menos 3-4 segundos de recorrido por delante',
        'Solo al coche que tienes justo delante',
      ],
    },
    correctIndex: 2,
    explanation: {
      en: 'Looking 3-4 seconds ahead gives you time to react to hazards, potholes, and traffic changes. Scanning further improves your safety significantly.',
      ro: 'Privirea la 3-4 secunde în față îți dă timp să reacționezi la pericole, gropi și schimbări de trafic. Scanarea pe distanță îmbunătățește semnificativ siguranța, în special pe bulevardele aglomerate.',
      es: 'Mirar 3-4 segundos por delante te da tiempo de reaccionar ante peligros, baches y cambios de tráfico. Ampliar la vista mejora mucho tu seguridad.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'cddeaaeb-03ef-428e-aa82-b40bdf12c52b',
    questionText: {
      en: 'When cycling at night in Romania, what lights are legally required?',
      ro: 'Pe timp de noapte în România, ce lumini sunt obligatorii pentru bicicletă?',
      es: 'Para pedalear de noche en Rumanía, ¿qué luces son obligatorias por ley?',
    },
    options: {
      en: [
        'No lights required',
        'A white front light only',
        'A white front light and red rear light',
        'Flashing lights on the helmet',
      ],
      ro: [
        'Nu sunt necesare lumini',
        'Doar lumină albă în față',
        'Lumină albă în față și lumină roșie în spate',
        'Lumini intermitente pe cască',
      ],
      es: [
        'Ninguna luz es obligatoria',
        'Solo una luz blanca delantera',
        'Luz blanca delantera y luz roja trasera',
        'Luces parpadeantes en el casco',
      ],
    },
    correctIndex: 2,
    explanation: {
      en: 'Romanian law requires a white front light and a red rear light when cycling at night or in poor visibility. Reflectors on pedals and wheels are also mandatory.',
      ro: 'Legea română impune lumină albă în față și lumină roșie în spate când mergi pe bicicletă noaptea sau în condiții de vizibilitate redusă. Sunt obligatorii și reflectorizante pe pedale și roți.',
      es: 'La normativa rumana exige luz blanca delantera y luz roja trasera al pedalear de noche o con poca visibilidad. También son obligatorios catadióptricos en pedales y ruedas.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '199d5d85-75e6-47d0-a40e-67ea9f6791fb',
    questionText: {
      en: 'What should you do when approaching a roundabout on a bicycle?',
      ro: 'La intrarea într-un sens giratoriu pe bicicletă, ce ar trebui să faci?',
      es: 'Al acercarte a una rotonda en bicicleta, ¿qué debes hacer?',
    },
    options: {
      en: [
        'Speed up to get through quickly',
        'Yield to traffic already in the roundabout',
        'Always dismount and walk',
        'Ride on the sidewalk around it',
      ],
      ro: [
        'Accelerezi ca să treci cât mai repede',
        'Cedezi trecerea celor deja aflați în sensul giratoriu',
        'Cobori întotdeauna și treci pe jos',
        'Folosești trotuarul în jurul lui',
      ],
      es: [
        'Acelerar para pasar rápido',
        'Ceder el paso a quien ya está en la rotonda',
        'Bajarte siempre y cruzar a pie',
        'Pasar por la acera',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Cyclists must yield to traffic already in the roundabout, just like cars. Take the lane confidently and signal your exits.',
      ro: 'Cicliștii trebuie să cedeze trecerea vehiculelor deja aflate în sensul giratoriu, la fel ca mașinile. Ocupă banda cu încredere și semnalizează ieșirea.',
      es: 'El ciclista debe ceder el paso a los vehículos que ya están en la rotonda, igual que un coche. Toma el carril con seguridad y señaliza la salida con el brazo.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'b0a4fa63-84ed-4404-b0ed-03a68c94e658',
    questionText: {
      en: 'How should you signal a left turn on a bicycle?',
      ro: 'Cum semnalizezi virajul la stânga pe bicicletă?',
      es: '¿Cómo se señaliza un giro a la izquierda en bici?',
    },
    options: {
      en: [
        'Extend your left arm straight out',
        'Extend your right arm straight out',
        'Wave both arms',
        'No signal needed',
      ],
      ro: [
        'Întinzi brațul stâng drept lateral',
        'Întinzi brațul drept drept lateral',
        'Fluturi ambele brațe',
        'Nu e nevoie de semnal',
      ],
      es: [
        'Extendiendo el brazo izquierdo recto',
        'Extendiendo el brazo derecho recto',
        'Agitando ambos brazos',
        'No hace falta señalizar',
      ],
    },
    correctIndex: 0,
    explanation: {
      en: 'Extend your left arm straight out to signal a left turn. Signal well before the turn so drivers can anticipate your movement.',
      ro: 'Întinde brațul stâng drept lateral pentru a semnaliza virajul la stânga. Semnalizează cu mult înainte de viraj ca șoferii să anticipeze mișcarea.',
      es: 'Extiende el brazo izquierdo recto para señalizar un giro a la izquierda. Hazlo con tiempo antes del giro para que los conductores puedan anticipar tu maniobra.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '696a7492-d551-4fcd-9e41-ef4b810b4598',
    questionText: {
      en: 'What is the door zone?',
      ro: 'Ce este „zona portierei”?',
      es: '¿Qué es la "zona de puerta"?',
    },
    options: {
      en: [
        'A bike parking area',
        'The space next to parked cars where doors can suddenly open',
        'A traffic-calmed zone',
        'A designated delivery area',
      ],
      ro: [
        'O zonă de parcare pentru biciclete',
        'Spațiul de lângă mașinile parcate unde portierele pot fi deschise brusc',
        'O zonă cu trafic redus',
        'O zonă pentru livrări',
      ],
      es: [
        'Una zona de aparcamiento para bicis',
        'El espacio junto a los coches aparcados donde una puerta puede abrirse de repente',
        'Una zona de tráfico calmado',
        'Una zona de carga y descarga',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'The door zone extends about 1.5 meters from parked cars. Dooring is one of the most common urban cycling accidents. Always ride outside this zone.',
      ro: 'Zona portierei se întinde pe aproximativ 1,5 metri de la mașinile parcate. Deschiderea unei portiere („dooring”) este unul dintre cele mai frecvente accidente ciclistice urbane. Mergi mereu în afara acestei zone.',
      es: 'La zona de puerta se extiende aproximadamente 1,5 metros desde los coches aparcados. El "dooring" es uno de los accidentes urbanos más comunes en bici. Circula siempre fuera de esta zona.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '33abb651-31ab-4a23-840d-437b41e53e37',
    questionText: {
      en: 'What is the safest position for a cyclist on a road without bike lanes?',
      ro: 'Pe o stradă fără pistă de biciclete, care este poziția cea mai sigură pentru ciclist?',
      es: 'En una carretera sin carril bici, ¿cuál es la posición más segura para el ciclista?',
    },
    options: {
      en: [
        'Far right edge of the road',
        'Center of the rightmost lane',
        'On the sidewalk',
        'Between parked cars',
      ],
      ro: [
        'Lângă marginea din dreapta a carosabilului',
        'Centrul benzii din dreapta',
        'Pe trotuar',
        'Între mașini parcate',
      ],
      es: [
        'El borde derecho de la calzada',
        'El centro del carril de la derecha',
        'En la acera',
        'Entre coches aparcados',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Riding in the center of the lane makes you more visible and prevents dangerous close passes. Romanian law allows cyclists to take the lane when there is no bike lane and riding on the edge would be unsafe.',
      ro: 'Mergând pe centrul benzii devii mai vizibil și eviți depășirile periculoase prea apropiate. Legea română permite ciclistului să ocupe banda când nu există pistă de biciclete și marginea drumului este nesigură.',
      es: 'Circular en el centro del carril te hace más visible y evita adelantamientos peligrosos. La ley rumana permite al ciclista ocupar el carril cuando no hay carril bici y el borde derecho no es seguro.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'e8dde6a5-4a5f-4362-aba2-93c9f5b7b681',
    questionText: {
      en: 'What should you check before every ride?',
      ro: 'Ce verifici înainte de fiecare cursă?',
      es: '¿Qué debes revisar antes de cada salida?',
    },
    options: {
      en: [
        'Tire pressure, brakes, and chain',
        'Only the tire pressure',
        'Nothing if the bike looks fine',
        'Just the brakes',
      ],
      ro: [
        'Presiunea în cauciucuri, frânele și lanțul',
        'Doar presiunea în cauciucuri',
        'Nimic dacă bicicleta arată bine',
        'Doar frânele',
      ],
      es: [
        'Presión de neumáticos, frenos y cadena',
        'Solo la presión de los neumáticos',
        'Nada, si la bici se ve bien',
        'Solo los frenos',
      ],
    },
    correctIndex: 0,
    explanation: {
      en: 'The ABC check: Air (tire pressure), Brakes (both working), Chain (lubed and not loose). Takes 30 seconds and prevents most mechanical failures.',
      ro: 'Verificarea ABC: Aer (presiune în cauciucuri), Brakes/Frâne (ambele funcționează), Cadrul/Lanț (uns și fără joc). Durează 30 de secunde și previne majoritatea defecțiunilor mecanice.',
      es: 'La revisión ABC: Aire (presión de neumáticos), Brakes/Frenos (que ambos funcionen), Cadena (lubricada y sin holgura). Te lleva 30 segundos y previene la mayoría de fallos mecánicos.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '58d61bc2-be17-4c55-abd9-aae8397b7876',
    questionText: {
      en: 'Are cyclists in Romania allowed to ride on the sidewalk?',
      ro: 'Au voie cicliștii din România să meargă pe trotuar?',
      es: '¿Pueden los ciclistas en Rumanía circular por la acera?',
    },
    options: {
      en: [
        'Yes, always',
        'Only when there is no bike lane and the road is dangerous',
        'Never, it is always illegal',
        'Only in parks',
      ],
      ro: [
        'Da, oricând',
        'Doar când nu există pistă de biciclete și drumul este periculos',
        'Niciodată, este mereu ilegal',
        'Doar în parcuri',
      ],
      es: [
        'Sí, siempre',
        'Solo cuando no hay carril bici y la calzada es peligrosa',
        'Nunca, siempre es ilegal',
        'Solo en parques',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Romanian law permits sidewalk cycling only when there is no bike lane and road conditions make cycling unsafe. Cyclists must yield to pedestrians and ride at walking speed on the sidewalk.',
      ro: 'Legea română permite circulația pe trotuar doar când nu există pistă de biciclete iar condițiile de drum fac pedalatul nesigur. Ciclistul trebuie să cedeze trecerea pietonilor și să meargă cu viteza pasului.',
      es: 'La ley rumana solo permite circular por la acera cuando no hay carril bici y las condiciones de la calzada hacen inseguro pedalear. El ciclista debe ceder el paso a los peatones y rodar a velocidad de paseo.',
    },
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: '72abe9f9-3526-48cf-a6f0-f5c68ee337dd',
    questionText: {
      en: 'What should you do if a dog chases you while cycling?',
      ro: 'Ce faci dacă te urmărește un câine în timp ce pedalezi?',
      es: '¿Qué hacer si un perro te persigue mientras pedaleas?',
    },
    options: {
      en: [
        'Speed up and outrun it',
        'Stop, dismount, and put the bike between you and the dog',
        'Kick at it while riding',
        'Throw food at it',
      ],
      ro: [
        'Accelerezi și încerci să-l lași în urmă',
        'Te oprești, cobori și pui bicicleta între tine și câine',
        'Lovești cu piciorul în timp ce mergi',
        'Îi arunci mâncare',
      ],
      es: [
        'Acelerar y dejarlo atrás',
        'Parar, desmontar y poner la bici entre tú y el perro',
        'Darle patadas mientras ruedas',
        'Tirarle comida',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Stopping and using your bike as a barrier is the safest approach. Most dogs stop chasing once you stop moving. Speak calmly and avoid eye contact. This is especially important in Romania where stray dogs can be encountered on rural and suburban roads.',
      ro: 'Cea mai sigură variantă este să te oprești și să folosești bicicleta ca barieră. Majoritatea câinilor încetează urmărirea când nu mai te miști. Vorbește calm și evită contactul vizual direct. Este important mai ales în România, unde poți întâlni câini fără stăpân pe drumuri rurale sau de la marginea orașelor.',
      es: 'Parar y usar la bici como barrera es lo más seguro. La mayoría de perros dejan de perseguir cuando dejas de moverte. Habla en tono calmado y evita el contacto visual. Importa especialmente en Rumanía, donde pueden encontrarse perros callejeros en carreteras rurales y de las afueras.',
    },
    category: 'road_safety',
    difficulty: 2,
  },

  // ── Risk Awareness ───────────────────────────────────────────────────────
  {
    id: '15e4ae40-7dcb-41bd-ac11-d1001a67938d',
    questionText: {
      en: 'Which type of road has the lowest cycling accident rate?',
      ro: 'Ce tip de drum are cea mai mică rată de accidente pentru cicliști?',
      es: '¿Qué tipo de vía tiene la menor tasa de accidentes en bici?',
    },
    options: {
      en: [
        'Multi-lane highways',
        'Residential streets with speed limits under 30 km/h',
        'Roads with painted bike lanes',
        'One-way streets',
      ],
      ro: [
        'Autostrăzi cu mai multe benzi',
        'Străzi rezidențiale cu limită sub 30 km/h',
        'Drumuri cu pistă de biciclete pictată',
        'Străzi cu sens unic',
      ],
      es: [
        'Autovías de varios carriles',
        'Calles residenciales con límite inferior a 30 km/h',
        'Calles con carril bici pintado',
        'Calles de un solo sentido',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Low-speed residential streets have the lowest accident rates for cyclists. Speed is the strongest predictor of accident severity.',
      ro: 'Străzile rezidențiale cu viteză redusă au cea mai mică rată de accidente pentru cicliști. Viteza este cel mai puternic factor de gravitate al unui accident.',
      es: 'Las calles residenciales con velocidad reducida tienen la menor tasa de accidentes para ciclistas. La velocidad es el mayor predictor de gravedad en un siniestro.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: 'bce4526d-8da9-4765-8d80-57e90c1cf94d',
    questionText: {
      en: 'Why are large vehicles (trucks, buses) especially dangerous for cyclists?',
      ro: 'De ce sunt vehiculele mari (camioane, autobuze) periculoase în mod special pentru cicliști?',
      es: '¿Por qué los vehículos grandes (camiones, autobuses) son especialmente peligrosos para los ciclistas?',
    },
    options: {
      en: [
        'They are slower',
        'They have large blind spots and wide turning arcs',
        'They create too much wind',
        'They block the view of traffic lights',
      ],
      ro: [
        'Sunt mai lente',
        'Au unghiuri moarte mari și arce largi de viraj',
        'Creează prea mult curent de aer',
        'Blochează vederea către semafor',
      ],
      es: [
        'Son más lentos',
        'Tienen grandes ángulos muertos y arcos de giro amplios',
        'Generan demasiado viento',
        'Tapan la vista del semáforo',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Large vehicles have extensive blind spots on all sides and their rear wheels track inside the front wheels during turns, creating a deadly crush zone.',
      ro: 'Vehiculele mari au unghiuri moarte importante pe toate laturile, iar roțile din spate trec pe interiorul celor din față la viraj, creând o zonă de strivire mortală.',
      es: 'Los vehículos grandes tienen ángulos muertos enormes en todos los costados y sus ruedas traseras trazan por dentro al girar, creando una zona de aplastamiento mortal.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: '73d92e43-0493-434a-bb9a-d6bb590ddb81',
    questionText: {
      en: 'Which surface is most slippery for cyclists when wet?',
      ro: 'Ce suprafață devine cea mai alunecoasă pentru cicliști când e udă?',
      es: '¿Qué superficie es más resbaladiza para los ciclistas cuando está mojada?',
    },
    options: {
      en: ['Asphalt', 'Concrete', 'Metal grates, manhole covers, and tram tracks', 'Brick'],
      ro: ['Asfalt', 'Beton', 'Grătare metalice, capace de canalizare și șine de tramvai', 'Pavaj de cărămidă'],
      es: ['Asfalto', 'Hormigón', 'Rejillas metálicas, tapas de alcantarilla y raíles del tranvía', 'Ladrillo'],
    },
    correctIndex: 2,
    explanation: {
      en: 'Metal surfaces become extremely slippery when wet. In Romanian cities like Bucharest, Cluj, and Timișoara, tram tracks are a major hazard — always cross them at a right angle and never ride along them.',
      ro: 'Suprafețele metalice devin extrem de alunecoase pe ploaie. În orașe românești ca București, Cluj sau Timișoara, șinele de tramvai sunt un pericol major — traversează-le mereu în unghi drept și nu pedala niciodată de-a lungul lor.',
      es: 'Las superficies metálicas se vuelven extremadamente resbaladizas con agua. En ciudades rumanas como Bucarest, Cluj o Timișoara, los raíles del tranvía son un peligro mayor — cruza siempre en ángulo recto y nunca circules sobre ellos.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: '809c615d-4378-4dab-a57f-338e35af8783',
    questionText: {
      en: 'How much does rain increase cycling accident risk?',
      ro: 'Cu cât crește ploaia riscul de accident pentru cicliști?',
      es: '¿Cuánto aumenta la lluvia el riesgo de accidente en bici?',
    },
    options: {
      en: [
        'No significant increase',
        'About 30% more risk',
        'About 70% more risk',
        'Double the risk',
      ],
      ro: [
        'Nicio creștere semnificativă',
        'Cu aproximativ 30%',
        'Cu aproximativ 70%',
        'Dublul riscului',
      ],
      es: [
        'No supone un aumento significativo',
        'Alrededor de un 30% más de riesgo',
        'Alrededor de un 70% más de riesgo',
        'El doble de riesgo',
      ],
    },
    correctIndex: 2,
    explanation: {
      en: 'Studies show wet roads increase cycling accident risk by approximately 70% due to reduced traction and longer braking distances.',
      ro: 'Studiile arată că drumul ud crește riscul de accident al ciclistului cu aproximativ 70% din cauza aderenței reduse și a distanțelor de frânare mai lungi.',
      es: 'Los estudios muestran que la calzada mojada incrementa el riesgo de accidente ciclista en torno a un 70% por la menor adherencia y mayor distancia de frenado.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: '664c94fc-8adb-48c9-86e1-3e9d69c2b032',
    questionText: {
      en: 'When is the most dangerous time of day for cycling?',
      ro: 'Care e cel mai periculos moment al zilei pentru pedalat?',
      es: '¿Qué momento del día es el más peligroso para pedalear?',
    },
    options: {
      en: [
        'Early morning (6-8 AM)',
        'Midday (12-2 PM)',
        'Evening rush hour (5-7 PM)',
        'Late night (10 PM-12 AM)',
      ],
      ro: [
        'Devreme dimineața (6-8)',
        'La amiază (12-14)',
        'Orele de vârf de seară (17-19)',
        'Noaptea târziu (22-00)',
      ],
      es: [
        'Primera hora (6-8 h)',
        'Mediodía (12-14 h)',
        'Hora punta de tarde (17-19 h)',
        'Noche cerrada (22-00 h)',
      ],
    },
    correctIndex: 2,
    explanation: {
      en: 'Evening rush hour combines heavy traffic, tired drivers, changing light conditions, and sun glare — making it the highest-risk period for cyclists.',
      ro: 'Orele de vârf de seară combină trafic dens, șoferi obosiți, schimbări de lumină și soare orbitor — devenind perioada cu cel mai mare risc pentru cicliști.',
      es: 'La hora punta de tarde combina tráfico denso, conductores cansados, cambios de luz y deslumbramiento solar — la franja con más riesgo para ciclistas.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: '9c4fae32-6324-4651-850d-da81c7590fff',
    questionText: {
      en: 'What percentage of cycling fatalities involve head injuries?',
      ro: 'Ce procent dintre decesele ciclistice implică traumatisme craniene?',
      es: '¿Qué porcentaje de los fallecimientos ciclistas implican lesiones craneales?',
    },
    options: {
      en: ['About 20%', 'About 40%', 'About 60%', 'About 80%'],
      ro: ['Aproximativ 20%', 'Aproximativ 40%', 'Aproximativ 60%', 'Aproximativ 80%'],
      es: ['En torno al 20%', 'En torno al 40%', 'En torno al 60%', 'En torno al 80%'],
    },
    correctIndex: 2,
    explanation: {
      en: 'Approximately 60% of cycling fatalities involve head injuries. Wearing a helmet reduces the risk of serious head injury by up to 70%.',
      ro: 'Aproximativ 60% dintre decesele ciclistice implică traumatisme craniene. Casca reduce riscul de leziune craniană gravă cu până la 70%.',
      es: 'Aproximadamente el 60% de los fallecimientos ciclistas implican lesiones craneales. Llevar casco reduce el riesgo de lesión craneal grave hasta un 70%.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'a65bbb23-87b0-46c2-aad3-57277eeeb24b',
    questionText: {
      en: 'How does wind affect cycling safety?',
      ro: 'Cum afectează vântul siguranța la pedalat?',
      es: '¿Cómo afecta el viento a la seguridad en bici?',
    },
    options: {
      en: [
        'Only headwinds are dangerous',
        'Strong crosswinds can push you into traffic or off the road',
        'Wind has no effect on safety',
        'Tailwinds are the most dangerous',
      ],
      ro: [
        'Doar vântul din față e periculos',
        'Vântul lateral puternic te poate împinge în trafic sau în afara drumului',
        'Vântul nu are efect asupra siguranței',
        'Vântul din spate este cel mai periculos',
      ],
      es: [
        'Solo el viento de cara es peligroso',
        'Las rachas laterales fuertes pueden empujarte hacia el tráfico o fuera de la calzada',
        'El viento no afecta a la seguridad',
        'El viento de cola es el más peligroso',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Crosswinds above 30 km/h can destabilize cyclists, especially on exposed roads, bridges, and when passing gaps between buildings. Adjust your grip and lean.',
      ro: 'Rafalele laterale de peste 30 km/h pot destabiliza ciclistul, mai ales pe drumuri expuse, poduri sau în culoarele dintre clădiri. Ajustează priza pe ghidon și înclină-te ușor împotriva vântului.',
      es: 'El viento lateral por encima de 30 km/h desestabiliza al ciclista, sobre todo en carreteras expuestas, puentes y huecos entre edificios. Ajusta el agarre del manillar e inclínate ligeramente hacia el viento.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },

  // ── Infrastructure ───────────────────────────────────────────────────────
  {
    id: '4a2ea5ad-ad7a-4cfd-8f5f-e0924ee6ccb2',
    questionText: {
      en: 'What does a green bike box at an intersection mean?',
      ro: 'Ce înseamnă o „cutie verde” pentru biciclete într-o intersecție?',
      es: '¿Qué significa una "cicloboca" verde en un cruce?',
    },
    options: {
      en: [
        'Bikes must stop here',
        'An advanced stop area where cyclists wait ahead of cars',
        'A bike repair station',
        'A bike sharing dock',
      ],
      ro: [
        'Cicliștii trebuie să se oprească aici',
        'O zonă de oprire avansată unde cicliștii așteaptă în fața mașinilor',
        'O stație de reparație pentru biciclete',
        'O stație de bike-sharing',
      ],
      es: [
        'Las bicis deben pararse aquí',
        'Un área de detención avanzada donde los ciclistas esperan delante de los coches',
        'Una estación de reparación de bicis',
        'Un punto de bicis públicas',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'A bike box is a designated area at the head of a traffic lane at an intersection that provides cyclists a safe and visible way to get ahead of queuing traffic.',
      ro: 'O „cutie pentru biciclete” este o zonă marcată la capul benzii într-o intersecție, care permite ciclistului să aștepte vizibil în fața mașinilor oprite la semafor.',
      es: 'Una cicloboca es una zona señalizada al inicio de un carril en un cruce que permite a los ciclistas esperar de forma segura y visible por delante de la cola de tráfico.',
    },
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'de7ba508-b890-4de3-b1f6-27f7cb21d7d0',
    questionText: {
      en: 'What is the purpose of a bike lane buffer zone?',
      ro: 'La ce folosește zona-tampon a unei piste de biciclete?',
      es: '¿Para qué sirve la zona de protección (buffer) de un carril bici?',
    },
    options: {
      en: [
        'Extra space for parking',
        'A painted area separating the bike lane from vehicle traffic',
        'A waiting area for pedestrians',
        'Space for street furniture',
      ],
      ro: [
        'Spațiu suplimentar pentru parcare',
        'O bandă pictată care separă pista de banda de circulație',
        'O zonă de așteptare pentru pietoni',
        'Spațiu pentru mobilier stradal',
      ],
      es: [
        'Espacio extra para aparcar',
        'Una franja pintada que separa el carril bici del tráfico motorizado',
        'Zona de espera para peatones',
        'Espacio para mobiliario urbano',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Buffer zones provide additional separation between cyclists and motor vehicles, reducing the risk of sideswipe collisions and dooring incidents.',
      ro: 'Zonele-tampon oferă separare suplimentară între cicliști și vehiculele motorizate, reducând riscul de coliziuni laterale și de dooring.',
      es: 'Las zonas de protección añaden separación entre ciclistas y vehículos, reduciendo el riesgo de colisión por roce lateral y de dooring.',
    },
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: '8f4b5f0a-4ff9-4403-898a-344aa6c1eb04',
    questionText: {
      en: 'How should you cross tram tracks on a bicycle?',
      ro: 'Cum traversezi șinele de tramvai cu bicicleta?',
      es: '¿Cómo se cruzan las vías del tranvía en bici?',
    },
    options: {
      en: [
        'Ride along them to follow the route',
        'Cross at a right angle (as close to 90° as possible)',
        'Speed up and cross at any angle',
        'Dismount and carry the bike across',
      ],
      ro: [
        'Pedalezi de-a lungul lor pentru a urma traseul',
        'Le traversezi în unghi drept (cât mai aproape de 90°)',
        'Accelerezi și treci la orice unghi',
        'Cobori și treci pe jos cu bicicleta',
      ],
      es: [
        'Circulando a lo largo para seguir el trazado',
        'Cruzándolas en ángulo recto (lo más cerca posible de 90°)',
        'Acelerando y cruzando en cualquier ángulo',
        'Bajándose y cruzando a pie con la bici en la mano',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Tram tracks can trap a bicycle wheel if crossed at a shallow angle, causing an instant crash. Always cross at a right angle. This is critical in cities like Bucharest, Cluj, Iași, and Timișoara where tram lines share the road with cyclists.',
      ro: 'Șinele de tramvai pot prinde roata bicicletei dacă le traversezi sub un unghi mic, provocând o căzătură instantanee. Traversează mereu în unghi drept. Critic în orașe precum București, Cluj, Iași și Timișoara, unde liniile de tramvai împart carosabilul cu cicliștii.',
      es: 'Los raíles del tranvía pueden atrapar la rueda de la bici si los cruzas en ángulo bajo, provocando una caída inmediata. Cruza siempre en ángulo recto. Es crítico en ciudades rumanas como Bucarest, Cluj, Iași y Timișoara, donde el tranvía comparte calzada con los ciclistas.',
    },
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'a0e78e57-f7c9-4e9e-806c-9f488beb37d0',
    questionText: {
      en: 'What is a contraflow bike lane?',
      ro: 'Ce este o pistă de biciclete în contrasens?',
      es: '¿Qué es un carril bici a contracorriente?',
    },
    options: {
      en: [
        'A lane that goes against the regular traffic flow on a one-way street',
        'A lane with speed bumps',
        'A lane shared with buses',
        'A lane with traffic counters',
      ],
      ro: [
        'O bandă care merge împotriva sensului normal de circulație pe o stradă cu sens unic',
        'O bandă cu limitatoare de viteză',
        'O bandă comună cu autobuzele',
        'O bandă cu contoare de trafic',
      ],
      es: [
        'Un carril que va contra el sentido normal del tráfico en una calle de sentido único',
        'Un carril con bandas reductoras',
        'Un carril compartido con autobuses',
        'Un carril con contadores de tráfico',
      ],
    },
    correctIndex: 0,
    explanation: {
      en: 'Contraflow bike lanes allow cyclists to ride in the opposite direction on one-way streets, providing shorter and more direct routes.',
      ro: 'Pistele în contrasens permit ciclistului să circule în sens opus pe o stradă cu sens unic, oferind trasee mai scurte și directe.',
      es: 'Los carriles bici a contracorriente permiten a los ciclistas circular en sentido opuesto en calles de sentido único, ofreciendo rutas más cortas y directas.',
    },
    category: 'infrastructure',
    difficulty: 2,
  },
  {
    id: 'd876f7a8-26e9-46b6-b416-1beca36fbd30',
    questionText: {
      en: 'What is a protected intersection?',
      ro: 'Ce este o intersecție protejată?',
      es: '¿Qué es un cruce protegido?',
    },
    options: {
      en: [
        'An intersection with traffic police',
        'A design that physically separates cyclists from turning vehicles',
        'An intersection with no traffic lights',
        'A pedestrian-only crossing',
      ],
      ro: [
        'O intersecție cu agent de circulație',
        'Un design care separă fizic cicliștii de vehiculele care virează',
        'O intersecție fără semafor',
        'O trecere doar pentru pietoni',
      ],
      es: [
        'Un cruce con presencia policial',
        'Un diseño que separa físicamente a ciclistas y vehículos que giran',
        'Un cruce sin semáforos',
        'Un paso peatonal',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Protected intersections use corner refuge islands, setback crossings, and forward queuing areas to keep cyclists safe from turning vehicles.',
      ro: 'Intersecțiile protejate folosesc insule de refugiu în colț, treceri retrase și zone de așteptare avansate pentru a-i feri pe cicliști de vehiculele care virează.',
      es: 'Los cruces protegidos usan isletas en las esquinas, pasos retranqueados y zonas de espera avanzadas para mantener a los ciclistas a salvo de los vehículos que giran.',
    },
    category: 'infrastructure',
    difficulty: 3,
  },

  // ── First Aid ────────────────────────────────────────────────────────────
  {
    id: 'c920df12-dbe8-468a-8075-a2900b78deb5',
    questionText: {
      en: 'What should you do if you get a flat tire while riding?',
      ro: 'Ce faci dacă ți se sparge cauciucul în timpul cursei?',
      es: '¿Qué debes hacer si pinchas mientras pedaleas?',
    },
    options: {
      en: [
        'Keep riding slowly to the nearest shop',
        'Stop safely, move off the road, then fix it',
        'Call for a ride immediately',
        'Leave the bike and walk',
      ],
      ro: [
        'Continui încet până la cel mai apropiat magazin',
        'Te oprești în siguranță, ieși de pe carosabil și apoi repari',
        'Suni imediat după o mașină să te ridice',
        'Lași bicicleta și mergi pe jos',
      ],
      es: [
        'Seguir despacio hasta la tienda más cercana',
        'Parar con seguridad, salir de la calzada y entonces reparar',
        'Llamar a alguien que te recoja al momento',
        'Dejar la bici y volver andando',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Riding on a flat tire damages the rim and is unstable. Pull over safely, then either fix the tube or call for help.',
      ro: 'Pedalatul cu o cameră spartă strică janta și e instabil. Trage pe dreapta în siguranță, apoi repară camera sau cere ajutor.',
      es: 'Rodar con un pinchazo daña la llanta y es inestable. Sal de la calzada con seguridad y, ya allí, repara la cámara o pide ayuda.',
    },
    category: 'first_aid',
    difficulty: 1,
  },
  {
    id: '84b7a30f-420a-4818-ab6b-573756d813bb',
    questionText: {
      en: 'What is the first thing you should do if you witness a cycling accident?',
      ro: 'Care este primul lucru pe care îl faci dacă ești martor la un accident ciclistic?',
      es: 'Si presencias un accidente ciclista, ¿qué es lo primero que debes hacer?',
    },
    options: {
      en: [
        'Move the injured person immediately',
        'Call 112 (emergency services)',
        'Try to fix their bike',
        'Leave the scene',
      ],
      ro: [
        'Muți imediat persoana rănită',
        'Suni la 112 (servicii de urgență)',
        'Încerci să-i repari bicicleta',
        'Pleci de la locul accidentului',
      ],
      es: [
        'Mover a la persona herida inmediatamente',
        'Llamar al 112 (emergencias)',
        'Intentar arreglarle la bici',
        'Marcharte del lugar',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Call 112 immediately. Do not move the injured person unless they are in immediate danger (e.g., in traffic). Keep them warm and calm until the ambulance arrives.',
      ro: 'Sună imediat la 112. Nu muta persoana rănită decât dacă este în pericol imediat (de exemplu, pe carosabil). Ține-o caldă și calmă până la sosirea ambulanței.',
      es: 'Llama al 112 de inmediato. No muevas a la persona herida salvo que haya peligro inmediato (por ejemplo, dentro de la calzada). Mantenla abrigada y tranquila hasta que llegue la ambulancia.',
    },
    category: 'first_aid',
    difficulty: 1,
  },

  // ── Romanian Law ──────────────────────────────────────────────────────────
  {
    id: 'f1a23b4c-5d6e-4f78-9a0b-1c2d3e4f5a6b',
    questionText: {
      en: 'Are helmets mandatory for cyclists in Romania?',
      ro: 'Este casca obligatorie pentru cicliști în România?',
      es: '¿Es obligatorio el casco para los ciclistas en Rumanía?',
    },
    options: {
      en: [
        'Yes, for all cyclists',
        'No, but strongly recommended',
        'Only on national roads',
        'Only when riding at night',
      ],
      ro: [
        'Da, pentru toți cicliștii',
        'Nu, dar este puternic recomandată',
        'Doar pe drumurile naționale',
        'Doar la mersul pe timp de noapte',
      ],
      es: [
        'Sí, para todos los ciclistas',
        'No, pero está muy recomendado',
        'Solo en carreteras nacionales',
        'Solo al pedalear de noche',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Romanian law does not mandate helmets for adult cyclists, but wearing one reduces the risk of serious head injury by up to 70%. Children under 16 should always wear a helmet.',
      ro: 'Legea română nu impune casca pentru cicliștii adulți, însă purtarea ei reduce riscul de leziuni craniene grave cu până la 70%. Copiii sub 16 ani ar trebui să poarte mereu cască.',
      es: 'La ley rumana no obliga al casco para ciclistas adultos, pero llevarlo reduce el riesgo de lesión craneal grave hasta un 70%. Los menores de 16 años deberían llevarlo siempre.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'a2b34c5d-6e7f-4890-ab12-cd34ef56ab78',
    questionText: {
      en: 'Is it legal to cycle while using your phone in Romania?',
      ro: 'Este legal să folosești telefonul în mână în timp ce pedalezi în România?',
      es: '¿Es legal usar el móvil mientras pedaleas en Rumanía?',
    },
    options: {
      en: [
        'Yes, if you use one hand',
        'No, it is prohibited by the Codul Rutier',
        'Only for navigation apps',
        'Only with a Bluetooth earpiece',
      ],
      ro: [
        'Da, dacă îl ții cu o singură mână',
        'Nu, este interzis de Codul Rutier',
        'Doar pentru aplicații de navigație',
        'Doar cu o cască Bluetooth',
      ],
      es: [
        'Sí, si lo sostienes con una mano',
        'No, lo prohíbe el Codul Rutier rumano',
        'Solo para apps de navegación',
        'Solo con un manos libres por Bluetooth',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Romanian traffic law prohibits using a handheld phone while cycling. Use a handlebar mount for navigation and pull over to make calls.',
      ro: 'Codul Rutier român interzice folosirea telefonului ținut în mână în timpul pedalării. Folosește un suport pe ghidon pentru navigație și oprește-te pentru apeluri.',
      es: 'La normativa rumana prohíbe usar el móvil en mano mientras pedaleas. Utiliza un soporte de manillar para la navegación y detente para hacer llamadas.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'b3c45d6e-7f80-4912-bc23-de45fa67bc89',
    questionText: {
      en: 'Can you be fined for cycling under the influence of alcohol in Romania?',
      ro: 'Poți fi amendat pentru pedalat sub influența alcoolului în România?',
      es: '¿Pueden multarte por pedalear bajo los efectos del alcohol en Rumanía?',
    },
    options: {
      en: [
        'No, alcohol laws only apply to drivers',
        'Yes, cyclists are subject to the same alcohol limits as drivers',
        'Only if you cause an accident',
        'Only on public roads, not on bike paths',
      ],
      ro: [
        'Nu, regulile despre alcool se aplică doar șoferilor',
        'Da, cicliștii sunt supuși acelorași limite de alcool ca șoferii',
        'Doar dacă provoci un accident',
        'Doar pe drumurile publice, nu pe piste',
      ],
      es: [
        'No, las normas de alcohol solo aplican a conductores',
        'Sí, los ciclistas tienen los mismos límites que los conductores',
        'Solo si causas un accidente',
        'Solo en vías públicas, no en carriles bici',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Romanian law treats cyclists as traffic participants. Cycling with a blood alcohol level above the legal limit is an offence and can result in fines or criminal charges.',
      ro: 'Codul Rutier tratează ciclistul ca participant la trafic. Pedalatul cu o alcoolemie peste limita legală este o contravenție și poate atrage amendă sau acuzații penale.',
      es: 'La normativa rumana considera al ciclista usuario del tráfico. Pedalear con una alcoholemia por encima del límite legal es infracción y puede conllevar multas o cargos penales.',
    },
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: 'c4d56e7f-8091-4a23-cd34-ef56ab78cd90',
    questionText: {
      en: 'When must a cyclist wear a reflective vest in Romania?',
      ro: 'Când trebuie ciclistul să poarte vestă reflectorizantă în România?',
      es: '¿Cuándo debe llevar chaleco reflectante un ciclista en Rumanía?',
    },
    options: {
      en: [
        'Always while cycling',
        'When cycling outside built-up areas at night or in poor visibility',
        'Only on national roads',
        'Reflective vests are not required',
      ],
      ro: [
        'Mereu, când pedalează',
        'Când circulă în afara localității, noaptea sau în condiții de vizibilitate redusă',
        'Doar pe drumurile naționale',
        'Vesta reflectorizantă nu este obligatorie',
      ],
      es: [
        'Siempre mientras pedalea',
        'Al circular fuera de zona urbana, de noche o con poca visibilidad',
        'Solo en carreteras nacionales',
        'El chaleco reflectante no es obligatorio',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Romanian law requires cyclists to wear a reflective vest when riding outside cities and towns (extraurban) at night or in conditions of reduced visibility such as fog, rain, or dusk.',
      ro: 'Legea română impune vesta reflectorizantă pentru cicliștii care circulă în afara localităților (extraurban) pe timp de noapte sau în condiții de vizibilitate redusă — ceață, ploaie, amurg.',
      es: 'La normativa rumana exige chaleco reflectante al ciclista que circula fuera de las poblaciones de noche o con visibilidad reducida — niebla, lluvia o anochecer.',
    },
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: 'd5e67f80-9123-4b34-de45-fa67bc89de01',
    questionText: {
      en: 'What is the maximum legal speed for a standard bicycle on Romanian roads?',
      ro: 'Care este viteza maximă legală a unei biciclete standard pe drumurile din România?',
      es: '¿Cuál es la velocidad máxima legal para una bicicleta estándar en carreteras rumanas?',
    },
    options: {
      en: [
        'There is no speed limit for bicycles',
        '25 km/h',
        '30 km/h',
        '50 km/h, the same as cars in urban areas',
      ],
      ro: [
        'Nu există o limită de viteză pentru biciclete',
        '25 km/h',
        '30 km/h',
        '50 km/h, ca pentru mașini în zona urbană',
      ],
      es: [
        'No hay límite de velocidad para bicicletas',
        '25 km/h',
        '30 km/h',
        '50 km/h, lo mismo que un coche en zona urbana',
      ],
    },
    correctIndex: 0,
    explanation: {
      en: 'Romanian law does not set a specific speed limit for pedal-powered bicycles. However, cyclists must adapt their speed to road conditions, traffic, and visibility. E-bikes with motor assist are limited to 25 km/h.',
      ro: 'Legea română nu stabilește o limită fixă de viteză pentru bicicletele pedalate. Ciclistul trebuie însă să își adapteze viteza la drum, trafic și vizibilitate. Bicicletele electrice cu pedalare asistată au limita de asistență la 25 km/h.',
      es: 'La ley rumana no fija un límite de velocidad específico para bicicletas convencionales. El ciclista debe adaptar la velocidad al estado del firme, al tráfico y a la visibilidad. Las e-bikes con asistencia están limitadas a 25 km/h.',
    },
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: 'e6f78091-2345-4c45-ef56-ab78cd90ef12',
    questionText: {
      en: 'At what age can a child legally cycle on public roads in Romania?',
      ro: 'De la ce vârstă poate un copil să meargă legal pe bicicletă pe drumurile publice din România?',
      es: '¿A qué edad puede un menor circular legalmente en bici por vías públicas en Rumanía?',
    },
    options: {
      en: [
        'Any age, with parental supervision',
        'From 10 years old',
        'From 14 years old',
        'From 16 years old',
      ],
      ro: [
        'La orice vârstă, cu supravegherea părintelui',
        'De la 10 ani',
        'De la 14 ani',
        'De la 16 ani',
      ],
      es: [
        'A cualquier edad, con supervisión parental',
        'A partir de los 10 años',
        'A partir de los 14 años',
        'A partir de los 16 años',
      ],
    },
    correctIndex: 2,
    explanation: {
      en: 'Romanian law requires cyclists to be at least 14 years old to ride on public roads. Children under 14 may cycle on sidewalks, parks, and dedicated paths under adult supervision.',
      ro: 'Legea română cere ca ciclistul să aibă cel puțin 14 ani pentru a circula pe drumurile publice. Copiii sub 14 ani pot pedala pe trotuare, în parcuri și pe piste dedicate sub supravegherea unui adult.',
      es: 'La ley rumana exige al ciclista tener al menos 14 años para circular por vías públicas. Los menores de 14 pueden pedalear por aceras, parques y vías ciclistas bajo supervisión de un adulto.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'f7089123-4567-4d56-fa67-bc89de01fa23',
    questionText: {
      en: 'As a cyclist in Romania, what must you do at a pedestrian crossing?',
      ro: 'Ca biciclist în România, ce trebuie să faci la o trecere de pietoni?',
      es: 'Como ciclista en Rumanía, ¿qué debes hacer en un paso de peatones?',
    },
    options: {
      en: [
        'Ride across normally',
        'Dismount and walk the bike across',
        'Speed up to cross quickly',
        'Ride across but yield to pedestrians',
      ],
      ro: [
        'Treci normal pedalând',
        'Cobori și treci pe jos cu bicicleta',
        'Accelerezi ca să treci cât mai repede',
        'Treci pedalând, dar cedezi trecerea pietonilor',
      ],
      es: [
        'Cruzar pedaleando con normalidad',
        'Bajar de la bici y cruzar andando',
        'Acelerar para cruzar rápido',
        'Cruzar pedaleando pero cediendo el paso a los peatones',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Romanian traffic law requires cyclists to dismount and walk their bicycle across pedestrian crossings. Riding through a crosswalk is a finable offence.',
      ro: 'Codul Rutier impune ciclistului să coboare și să treacă pe jos cu bicicleta la trecerea pentru pietoni. Traversarea pedalând este sancționabilă.',
      es: 'La normativa rumana exige al ciclista bajar de la bicicleta y cruzar a pie en el paso de peatones. Cruzar pedaleando es una infracción sancionable.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '08912345-6789-4e67-ab78-cd90ef12ab34',
    questionText: {
      en: 'How should you signal that you are stopping on a bicycle?',
      ro: 'Cum semnalizezi că te oprești pe bicicletă?',
      es: '¿Cómo se señaliza que vas a detenerte en bici?',
    },
    options: {
      en: [
        'Ring your bell repeatedly',
        'Raise either arm straight up',
        'Wave your hand behind you',
        'No signal is needed',
      ],
      ro: [
        'Suni clopoțelul de mai multe ori',
        'Ridici un braț vertical deasupra capului',
        'Faci semn cu mâna în spate',
        'Nu e nevoie de semnal',
      ],
      es: [
        'Tocar el timbre varias veces',
        'Levantar un brazo verticalmente sobre la cabeza',
        'Mover la mano por detrás',
        'No hace falta señalizar',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'To signal stopping, raise one arm vertically above your head. This is the internationally recognized stop signal and is required by Romanian traffic rules before slowing down or stopping.',
      ro: 'Pentru a semnaliza oprirea, ridică un braț vertical deasupra capului. Este semnalul de stop recunoscut internațional și este cerut de regulile rutiere române înainte de a încetini sau opri în trafic.',
      es: 'Para señalizar la detención, levanta un brazo verticalmente sobre la cabeza. Es la señal de parada reconocida internacionalmente y la normativa rumana la exige antes de reducir o detenerse.',
    },
    category: 'road_safety',
    difficulty: 1,
  },

  // ── Romanian Hazards ─────────────────────────────────────────────────────
  {
    id: '19234567-89ab-4f78-bc89-de01fa23bc45',
    questionText: {
      en: 'Why are cobblestone streets particularly dangerous for cyclists?',
      ro: 'De ce sunt deosebit de periculoase străzile pavate cu piatră cubică pentru cicliști?',
      es: '¿Por qué los adoquines son especialmente peligrosos para los ciclistas?',
    },
    options: {
      en: [
        'They are too bumpy for comfort',
        'Gaps between stones can trap thin tires and cause falls, especially when wet',
        'They are too slow to ride on',
        'Cars cannot see cyclists on cobblestones',
      ],
      ro: [
        'Sunt prea incomode',
        'Spațiile dintre pietre pot prinde cauciucuri subțiri și provoacă căzături, mai ales pe umed',
        'Sunt prea lente',
        'Mașinile nu văd cicliștii pe pavaj',
      ],
      es: [
        'Son demasiado incómodos',
        'Las juntas entre piedras pueden atrapar neumáticos finos y provocar caídas, sobre todo mojados',
        'Son demasiado lentos',
        'Los coches no ven a los ciclistas sobre adoquín',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Cobblestone streets, common in Romanian old town centres like Sibiu, Brașov, and Sighișoara, have gaps that can catch narrow road bike tires. Reduce speed, use wider tires if possible, and avoid braking sharply on wet cobblestones.',
      ro: 'Străzile pavate cu piatră cubică, frecvente în centrele istorice românești precum Sibiu, Brașov sau Sighișoara, au rosturi care pot prinde cauciucuri subțiri de șosea. Redu viteza, folosește cauciucuri mai late dacă poți și evită frânările bruște pe pavaj ud.',
      es: 'Las calles adoquinadas, frecuentes en cascos históricos rumanos como Sibiu, Brașov o Sighișoara, tienen juntas que pueden atrapar neumáticos finos de bici de carretera. Reduce la velocidad, usa cubiertas más anchas si es posible y evita frenar de golpe sobre adoquines mojados.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: '2a345678-9abc-4089-cd90-ef12ab34cd56',
    questionText: {
      en: 'What is the main danger of cycling on a Romanian national road (DN)?',
      ro: 'Care este principalul pericol al pedalării pe un drum național (DN) românesc?',
      es: '¿Cuál es el principal peligro de pedalear por una carretera nacional rumana (DN)?',
    },
    options: {
      en: [
        'The road surface is poor',
        'High-speed traffic with no shoulder or bike lane, and heavy trucks',
        'There are too many roundabouts',
        'You need a special permit',
      ],
      ro: [
        'Suprafața drumului este proastă',
        'Trafic cu viteză mare, fără acostament sau pistă de biciclete, și camioane grele frecvente',
        'Sunt prea multe sensuri giratorii',
        'Ai nevoie de un permis special',
      ],
      es: [
        'El firme está en mal estado',
        'Tráfico a alta velocidad sin arcén ni carril bici, con camiones pesados',
        'Hay demasiadas rotondas',
        'Necesitas un permiso especial',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Romanian national roads (DN) are legal for cyclists but extremely dangerous due to high-speed traffic (90+ km/h), narrow or nonexistent shoulders, and frequent heavy trucks. Use alternative routes whenever possible.',
      ro: 'Drumurile naționale (DN) sunt legale pentru cicliști, dar extrem de periculoase din cauza traficului cu viteză mare (90+ km/h), a acostamentului îngust sau inexistent și a camioanelor grele frecvente. Caută rute alternative ori de câte ori e posibil.',
      es: 'Las carreteras nacionales rumanas (DN) están permitidas a ciclistas pero son extremadamente peligrosas por el tráfico a alta velocidad (90+ km/h), arcenes estrechos o inexistentes y la presencia frecuente de camiones pesados. Busca rutas alternativas siempre que sea posible.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: '3b456789-abcd-4190-de01-fa23bc45de67',
    questionText: {
      en: 'What is the biggest hazard when cycling near parked cars in Romanian cities?',
      ro: 'Care e cel mai mare pericol când pedalezi lângă mașini parcate în orașele românești?',
      es: '¿Cuál es el mayor peligro al pedalear cerca de coches aparcados en ciudades rumanas?',
    },
    options: {
      en: [
        'Cars parked on the bike lane',
        'Doors suddenly opening into your path (dooring)',
        'Exhaust fumes',
        'Blocked visibility at intersections',
      ],
      ro: [
        'Mașini parcate pe pista de biciclete',
        'Portiere deschise brusc în traseul tău (dooring)',
        'Gaze de eșapament',
        'Vizibilitate redusă în intersecții',
      ],
      es: [
        'Coches aparcados sobre el carril bici',
        'Puertas que se abren de golpe en tu trayectoria (dooring)',
        'Los humos de escape',
        'La visibilidad reducida en cruces',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Dooring — a parked car door opening into your path — is one of the most common urban cycling accidents. In Romanian cities where cars often park right next to the road, maintain at least 1 meter of distance from parked vehicles.',
      ro: 'Dooring-ul — deschiderea bruscă a unei portiere în traseul tău — este unul dintre cele mai frecvente accidente urbane. În orașele românești unde mașinile parchează adesea lipit de carosabil, păstrează cel puțin 1 metru distanță față de vehiculele staționate.',
      es: 'El "dooring" — una puerta abierta de golpe en tu trayectoria — es uno de los accidentes urbanos más comunes. En ciudades rumanas donde a menudo se aparca pegado a la calzada, mantén al menos 1 metro de distancia respecto a los vehículos estacionados.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: '4c567890-bcde-4201-ef12-ab34cd56ef78',
    questionText: {
      en: 'During which season should Romanian cyclists be most cautious about road surfaces?',
      ro: 'În ce anotimp trebuie cicliștii români să fie cei mai precauți cu suprafața drumului?',
      es: '¿En qué estación deben los ciclistas rumanos ser más cautos con el firme?',
    },
    options: {
      en: [
        'Summer, because of heat',
        'Autumn and early spring, because of wet leaves, ice patches, and frost',
        'Winter only',
        'Road surfaces are equally safe all year',
      ],
      ro: [
        'Vara, din cauza căldurii',
        'Toamna și primăvara devreme, din cauza frunzelor ude, a peticelor de gheață și a brumei',
        'Doar iarna',
        'Suprafețele sunt la fel de sigure tot anul',
      ],
      es: [
        'Verano, por el calor',
        'Otoño y principios de primavera, por hojas mojadas, placas de hielo y escarcha',
        'Solo invierno',
        'El firme es igual de seguro todo el año',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Autumn brings wet leaves that hide potholes and reduce grip. Early spring brings freeze-thaw cycles that create new potholes and black ice in the morning. Both seasons require extra vigilance on Romanian roads.',
      ro: 'Toamna aduce frunze ude care acoperă gropi și reduc aderența. Primăvara devreme aduce cicluri de îngheț-dezgheț care creează gropi noi și polei dimineața. Ambele perioade cer atenție sporită pe drumurile românești.',
      es: 'El otoño deja hojas mojadas que ocultan baches y reducen la adherencia. La primavera temprana trae ciclos de hielo-deshielo que crean nuevos baches y placas de hielo negro por la mañana. Ambas épocas requieren extra vigilancia en las carreteras rumanas.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: '5d678901-cdef-4312-fa23-bc45de67fa89',
    questionText: {
      en: 'What should you do when a bus pulls away from a stop while you are cycling alongside it?',
      ro: 'Ce faci când un autobuz pornește dintr-o stație în timp ce pedalezi pe lângă el?',
      es: 'Si un autobús se incorpora desde una parada mientras pedaleas a su lado, ¿qué debes hacer?',
    },
    options: {
      en: [
        'Speed up to pass it before it merges',
        'Slow down and let the bus merge — assume the driver has not seen you',
        'Ride between the bus and the curb',
        'Honk or ring your bell loudly',
      ],
      ro: [
        'Accelerezi ca să-l depășești înainte să se reintegreze în trafic',
        'Încetinești și-l lași să se reintegreze — presupui că șoferul nu te-a văzut',
        'Pedalezi între autobuz și bordură',
        'Claxonezi sau suni clopoțelul tare',
      ],
      es: [
        'Acelerar para pasarlo antes de que se incorpore',
        'Reducir y dejar que el autobús se incorpore — asume que el conductor no te ha visto',
        'Pasar entre el autobús y el bordillo',
        'Tocar el timbre con fuerza',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Buses in Romanian cities pull out from stops frequently. The driver may not see you in the mirror. Always assume you are invisible and let the bus merge first — you will catch up at the next stop.',
      ro: 'Autobuzele din orașele românești pleacă frecvent din stații. Șoferul poate să nu te vadă în oglindă. Presupune mereu că ești invizibil și lasă autobuzul să se reintegreze primul — îl prinzi din urmă la următoarea stație.',
      es: 'Los autobuses urbanos rumanos se incorporan constantemente desde paradas. Es posible que el conductor no te vea por el espejo. Asume siempre que eres invisible y deja que el autobús se incorpore primero — lo alcanzarás en la siguiente parada.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: '6e789012-defa-4423-ab34-cd56ef78ab90',
    questionText: {
      en: 'What is the right-hook danger at intersections?',
      ro: 'Ce este pericolul „right-hook” într-o intersecție?',
      es: '¿Qué es el peligro del "giro a la derecha" (right-hook) en un cruce?',
    },
    options: {
      en: [
        'A car turning left across your path',
        'A car turning right across your path while you continue straight',
        'A pedestrian stepping in front of you',
        'A pothole on the right side of the road',
      ],
      ro: [
        'O mașină care virează la stânga prin traseul tău',
        'O mașină care virează la dreapta tăindu-ți drumul în timp ce continui drept',
        'Un pieton care apare în fața ta',
        'O groapă pe partea dreaptă a drumului',
      ],
      es: [
        'Un coche que gira a la izquierda cruzándose en tu trayectoria',
        'Un coche que gira a la derecha cruzando tu trayectoria mientras tú sigues recto',
        'Un peatón que se cruza por delante',
        'Un bache en el lado derecho de la calzada',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'The right-hook happens when a car overtakes you and immediately turns right, cutting across your path. At intersections, make eye contact with drivers and be ready to brake. This is a leading cause of urban cycling accidents in Romania.',
      ro: '„Right-hook” se întâmplă când o mașină te depășește și virează imediat la dreapta, tăindu-ți drumul. În intersecții, caută contactul vizual cu șoferii și fii pregătit să frânezi. Este o cauză frecventă a accidentelor urbane ciclistice în România.',
      es: 'El "right-hook" ocurre cuando un coche te adelanta y gira inmediatamente a la derecha, cruzándose en tu trayectoria. En los cruces, busca el contacto visual con los conductores y prepárate para frenar. Es una causa habitual de accidentes ciclistas urbanos en Rumanía.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: '7f890123-efab-4534-bc45-de67fa89bc01',
    questionText: {
      en: 'How does air pollution affect cyclists?',
      ro: 'Cum afectează poluarea aerului cicliștii?',
      es: '¿Cómo afecta la contaminación del aire a los ciclistas?',
    },
    options: {
      en: [
        'It has no effect since you are outdoors',
        'Cyclists inhale more pollutants than car occupants due to deeper breathing',
        'It only affects runners, not cyclists',
        'Pollution is only a problem in industrial areas',
      ],
      ro: [
        'Nu are efect, ești în aer liber',
        'Cicliștii inhalează mai mulți poluanți decât ocupanții mașinilor pentru că respiră mai adânc',
        'Afectează doar alergătorii, nu cicliștii',
        'Poluarea este o problemă doar în zonele industriale',
      ],
      es: [
        'No afecta porque vas al aire libre',
        'Los ciclistas inhalan más contaminantes que los ocupantes de un coche por respirar más profundo',
        'Solo afecta a corredores, no a ciclistas',
        'La contaminación solo es problema en zonas industriales',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Cyclists breathe deeper and faster than car occupants, inhaling 2-5 times more pollutants. In cities like Bucharest where AQI can spike, prefer routes through parks or side streets and avoid rush-hour traffic on major boulevards.',
      ro: 'Cicliștii respiră mai adânc și mai rapid decât ocupanții mașinilor și inhalează de 2-5 ori mai mulți poluanți. În orașe precum București, unde valorile AQI pot crește brusc, preferă rute prin parcuri sau străzi laterale și evită orele de vârf pe bulevardele mari.',
      es: 'Los ciclistas respiran más profundo y más rápido que los ocupantes de un coche e inhalan entre 2 y 5 veces más contaminantes. En ciudades como Bucarest, donde los niveles de AQI pueden dispararse, prioriza rutas por parques o calles secundarias y evita las grandes avenidas en hora punta.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },

  // ── Romanian Infrastructure ──────────────────────────────────────────────
  {
    id: '80901234-fabe-4645-cd56-ef78ab90cd12',
    questionText: {
      en: 'What should you do when a bike lane in Romania is blocked by a parked car?',
      ro: 'Ce faci când o pistă de biciclete este blocată de o mașină parcată în România?',
      es: 'Si un carril bici en Rumanía está bloqueado por un coche aparcado, ¿qué debes hacer?',
    },
    options: {
      en: [
        'Ride on the sidewalk to go around it',
        'Check traffic, signal, merge into the traffic lane, pass the obstacle, then return',
        'Stop and wait for the car to move',
        'Squeeze between the car and the curb',
      ],
      ro: [
        'Treci pe trotuar ca s-o ocolești',
        'Verifici traficul, semnalizezi, intri în banda de circulație, depășești obstacolul și revii',
        'Te oprești și aștepți să plece mașina',
        'Treci între mașină și bordură',
      ],
      es: [
        'Subirte a la acera para esquivarlo',
        'Mirar el tráfico, señalizar, incorporarte al carril de circulación, adelantar el obstáculo y volver al carril bici',
        'Pararte y esperar a que el coche se mueva',
        'Pasar entre el coche y el bordillo',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Blocked bike lanes are common in Romanian cities. Check over your shoulder, signal with your arm, merge safely into the traffic lane, pass the obstacle, and return to the bike lane. Never squeeze into a gap between a car and the curb.',
      ro: 'Pistele blocate sunt frecvente în orașele românești. Privește peste umăr, semnalizează cu brațul, intră în siguranță în banda de circulație, depășește obstacolul și revino pe pistă. Nu te strecura niciodată între mașină și bordură.',
      es: 'Los carriles bici bloqueados son habituales en ciudades rumanas. Mira por encima del hombro, señaliza con el brazo, incorpórate al carril de circulación con seguridad, adelanta el obstáculo y vuelve al carril bici. Nunca pases por el hueco entre el coche y el bordillo.',
    },
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: '91012345-abcf-4756-de67-fa89bc01de23',
    questionText: {
      en: 'What does a blue circular sign with a white bicycle mean in Romania?',
      ro: 'Ce semnifică un indicator circular albastru cu o bicicletă albă în România?',
      es: '¿Qué significa una señal circular azul con una bicicleta blanca en Rumanía?',
    },
    options: {
      en: [
        'No cycling allowed',
        'Mandatory bike path — cyclists must use it',
        'Shared path for cyclists and pedestrians',
        'Bicycle parking ahead',
      ],
      ro: [
        'Pedalarea este interzisă',
        'Pistă de biciclete obligatorie — ciclistul trebuie să o folosească',
        'Pistă comună pentru cicliști și pietoni',
        'Parcare de biciclete în față',
      ],
      es: [
        'Prohibido circular en bici',
        'Vía ciclista obligatoria — el ciclista debe usarla',
        'Vía compartida para ciclistas y peatones',
        'Aparcamiento de bicis más adelante',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'A blue circular sign with a white bicycle indicates a mandatory bike path. When this sign is present, cyclists are legally required to use the marked path instead of the main carriageway.',
      ro: 'Un indicator circular albastru cu o bicicletă albă indică pistă obligatorie pentru biciclete. Când acest indicator este prezent, ciclistul este obligat prin lege să folosească pista marcată în loc de carosabilul principal.',
      es: 'Una señal circular azul con una bicicleta blanca indica una vía ciclista obligatoria. Cuando aparece, el ciclista está legalmente obligado a usarla en lugar de la calzada principal.',
    },
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'a2123456-bcda-4867-ef78-ab90cd12ef34',
    questionText: {
      en: 'What is the EuroVelo network and why is it relevant to Romanian cyclists?',
      ro: 'Ce este rețeaua EuroVelo și de ce e relevantă pentru cicliștii români?',
      es: '¿Qué es la red EuroVelo y por qué es relevante para los ciclistas rumanos?',
    },
    options: {
      en: [
        'A bike-sharing programme in Bucharest',
        'A network of long-distance cycling routes crossing Europe, including several through Romania',
        'An EU regulation on bicycle standards',
        'A cycling insurance programme',
      ],
      ro: [
        'Un program de bike-sharing în București',
        'O rețea de trasee ciclistice de lungă distanță prin Europa, inclusiv mai multe prin România',
        'O reglementare UE privind standardele bicicletelor',
        'Un program de asigurări pentru cicliști',
      ],
      es: [
        'Un programa de bicis compartidas en Bucarest',
        'Una red de rutas ciclistas de larga distancia por Europa, incluidas varias por Rumanía',
        'Una normativa UE sobre estándares de bicicleta',
        'Un programa de seguros ciclistas',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'EuroVelo is a network of 17 long-distance cycling routes. Routes EV6 (Danube), EV13 (Iron Curtain Trail), and EV11 pass through Romania, offering marked touring routes along the Danube, through Transylvania, and along the Black Sea coast.',
      ro: 'EuroVelo este o rețea de 17 trasee ciclistice de lungă distanță. Rutele EV6 (Dunărea), EV13 (Cortina de Fier) și EV11 trec prin România, oferind trasee marcate de-a lungul Dunării, prin Transilvania și pe litoralul Mării Negre.',
      es: 'EuroVelo es una red de 17 rutas ciclistas de larga distancia. Las rutas EV6 (Danubio), EV13 (Cortina de Hierro) y EV11 pasan por Rumanía y ofrecen recorridos señalizados a lo largo del Danubio, por Transilvania y por la costa del mar Negro.',
    },
    category: 'infrastructure',
    difficulty: 3,
  },
  {
    id: 'b3234567-cdeb-4978-fa89-bc01de23fa45',
    questionText: {
      en: 'How should you handle a railway crossing on a bicycle?',
      ro: 'Cum traversezi o trecere de cale ferată cu bicicleta?',
      es: '¿Cómo debes afrontar un paso a nivel en bici?',
    },
    options: {
      en: [
        'Speed up to cross quickly',
        'Cross tracks at a right angle, slow down, and check for trains in both directions',
        'Follow the car in front of you across',
        'Dismount only if barriers are down',
      ],
      ro: [
        'Accelerezi ca să treci cât mai repede',
        'Traversezi șinele în unghi drept, încetinești și verifici trenurile în ambele direcții',
        'Urmezi mașina din față',
        'Cobori doar dacă barierele sunt lăsate',
      ],
      es: [
        'Acelerar para cruzar cuanto antes',
        'Cruzar las vías en ángulo recto, reduciendo la velocidad y comprobando trenes en ambos sentidos',
        'Seguir al coche de delante',
        'Bajarse solo si las barreras están bajadas',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Romanian railway crossings can be unguarded, especially on rural roads. Always slow down, look and listen for trains in both directions, and cross tracks at a right angle to avoid your wheel getting caught in the rail groove.',
      ro: 'Trecerile de cale ferată din România pot fi nepăzite, mai ales pe drumurile rurale. Încetinește mereu, privește și ascultă trenurile din ambele direcții și traversează șinele în unghi drept pentru ca roata să nu se prindă în canalul șinei.',
      es: 'Los pasos a nivel rumanos pueden estar sin barreras, sobre todo en carreteras rurales. Reduce siempre la velocidad, mira y escucha a ambos lados, y cruza las vías en ángulo recto para que la rueda no quede atrapada en la ranura del raíl.',
    },
    category: 'infrastructure',
    difficulty: 2,
  },
] as const;

/** Look up a question by its stable UUID. */
export function findQuizQuestion(id: string): StaticQuizQuestion | undefined {
  return QUIZ_QUESTIONS.find((q) => q.id === id);
}
