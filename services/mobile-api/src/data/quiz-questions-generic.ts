/**
 * Static quiz question pool — GENERIC (country-agnostic) content.
 *
 * Served to riders OUTSIDE Romania and Spain (global availability gate,
 * 2026-07-12): we only maintain country-law content for RO and ES, and
 * showing Romanian law to a rider in Germany fails the "relevant and true
 * for where the user rides" bar. This pool contains ONLY questions whose
 * statement, correct answer, and explanation are generally true — physics,
 * visibility, vehicle blind spots, maintenance, hazard behavior, EU-wide
 * constants (112, the EPAC 25 km/h rule, Vienna-Convention signage) — with
 * every country-specific legal claim (helmet/vest mandates, alcohol limits,
 * minimum ages, sidewalk rules, fines) deliberately excluded.
 *
 * Provenance: curated from the RO pool (plus one EU-rule question adapted
 * from the ES pool) with fresh UUIDs; country-specific clauses were stripped
 * from the explanations in all three locales. Expanded 2026-08-13 with 16
 * net-new questions written directly for this pool. When editing, keep the
 * rule: if a sentence is only true in SOME countries, it does not belong here.
 *
 * Pool SIZE is load-bearing: the daily-quiz endpoint excludes questions the
 * rider answered in the last 30 days and 404s once nothing is left, so a pool
 * at or below ~30 hard-locks a daily player. Grow this pool, never shrink it.
 *
 * Same multilingual model as the other pools: `id`, `correctIndex`,
 * `category`, `difficulty` are locale-independent; `questionText`,
 * `options`, `explanation` carry en / ro / es strings.
 */

import type { StaticQuizQuestion } from './quiz-questions';

export const QUIZ_QUESTIONS_GENERIC: readonly StaticQuizQuestion[] = [
  {
    id: '4fac8b44-d1db-41d6-ba35-899e146c1370',
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
    id: 'f2de9eca-b515-4ec0-8c9f-2ce022bb70be',
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
    id: 'fb28a270-af01-4ff0-93cd-77a357a4b167',
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
    id: '42cbce5e-e60b-478f-992f-4545f9965686',
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
    id: 'e51e058d-fc2e-44e2-bb71-6b3196fb04b2',
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
    id: '3f011446-7110-4b22-927e-16770f94b47f',
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
    id: '6f266a5b-21e5-4aa8-9787-c9f7e43764e5',
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
    id: 'b2df9abb-2fb4-43dc-b3ad-5a4cd22d7872',
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
    id: '1f7c6f87-1e14-46fa-9fa4-d5a406e4038d',
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
    id: 'a716be79-7025-4376-81fb-f2fb694ef5e4',
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
    id: '66e1b412-d2a0-49ed-bf4e-e880a7e860cd',
    questionText: {
      en: 'What percentage of cycling fatalities involve head injuries?',
      ro: 'Ce procent dintre decesele ciclistice implică traumatisme craniene?',
      es: '¿Qué porcentaje de los fallecimientos ciclistas implican lesiones craneales?',
    },
    options: {
      en: [
        'About 20%',
        'About 40%',
        'About 60%',
        'About 80%',
      ],
      ro: [
        'Aproximativ 20%',
        'Aproximativ 40%',
        'Aproximativ 60%',
        'Aproximativ 80%',
      ],
      es: [
        'En torno al 20%',
        'En torno al 40%',
        'En torno al 60%',
        'En torno al 80%',
      ],
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
    id: '5e1bdafd-f2f9-44f5-a1e4-466508269a73',
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
  {
    id: 'aff932e3-e12d-4497-9a29-c39d93b547c4',
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
    id: '84efd38a-e09a-4a2d-a832-dd5f9153285a',
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
    id: '5b443ed9-7485-4505-a06d-019acb1b84aa',
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
    id: '41e82c4b-bfe1-49ef-aa4c-0a810d031df5',
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
  {
    id: '6f47d706-a859-41fa-abf5-0c69106c5063',
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
    id: '98a85bcc-3256-464a-a005-d3f54369709e',
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
  {
    id: '4756dabc-1c5c-4010-a78f-50b5fbbd2edf',
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
      en: 'Riding in the center of the lane makes you more visible and prevents dangerous close passes. In most European countries, cyclists may take the lane when there is no bike lane and riding on the edge would be unsafe.',
      ro: 'Mergând pe centrul benzii devii mai vizibil și eviți depășirile periculoase prea apropiate. În majoritatea țărilor europene, ciclistul poate ocupa banda când nu există pistă de biciclete și marginea drumului este nesigură.',
      es: 'Circular en el centro del carril te hace más visible y evita adelantamientos peligrosos. En la mayoría de los países europeos, el ciclista puede ocupar el carril cuando no hay carril bici y el borde derecho no es seguro.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '11554bbe-7bf2-4af8-9fb9-1b6d46e58bc5',
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
      en: 'Stopping and using your bike as a barrier is the safest approach. Most dogs stop chasing once you stop moving. Speak calmly and avoid eye contact.',
      ro: 'Cea mai sigură variantă este să te oprești și să folosești bicicleta ca barieră. Majoritatea câinilor încetează urmărirea când nu mai te miști. Vorbește calm și evită contactul vizual direct.',
      es: 'Parar y usar la bici como barrera es lo más seguro. La mayoría de perros dejan de perseguir cuando dejas de moverte. Habla en tono calmado y evita el contacto visual.',
    },
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: '5a779313-d5ce-411e-b313-646b74e8332b',
    questionText: {
      en: 'Which surface is most slippery for cyclists when wet?',
      ro: 'Ce suprafață devine cea mai alunecoasă pentru cicliști când e udă?',
      es: '¿Qué superficie es más resbaladiza para los ciclistas cuando está mojada?',
    },
    options: {
      en: [
        'Asphalt',
        'Concrete',
        'Metal grates, manhole covers, and tram tracks',
        'Brick',
      ],
      ro: [
        'Asfalt',
        'Beton',
        'Grătare metalice, capace de canalizare și șine de tramvai',
        'Pavaj de cărămidă',
      ],
      es: [
        'Asfalto',
        'Hormigón',
        'Rejillas metálicas, tapas de alcantarilla y raíles del tranvía',
        'Ladrillo',
      ],
    },
    correctIndex: 2,
    explanation: {
      en: 'Metal surfaces become extremely slippery when wet. Tram tracks are a major hazard — always cross them at a right angle and never ride along them.',
      ro: 'Suprafețele metalice devin extrem de alunecoase pe ploaie. Șinele de tramvai sunt un pericol major — traversează-le mereu în unghi drept și nu pedala niciodată de-a lungul lor.',
      es: 'Las superficies metálicas se vuelven extremadamente resbaladizas con agua. Los raíles del tranvía son un peligro mayor — cruza siempre en ángulo recto y nunca circules sobre ellos.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: '71ab7a8c-0b8a-4dea-8318-fc89f3eba463',
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
      en: 'Tram tracks can trap a bicycle wheel if crossed at a shallow angle, causing an instant crash. Always cross at a right angle, especially in cities where tram lines share the road with cyclists.',
      ro: 'Șinele de tramvai pot prinde roata bicicletei dacă le traversezi sub un unghi mic, provocând o căzătură instantanee. Traversează mereu în unghi drept, mai ales în orașele unde liniile de tramvai împart carosabilul cu cicliștii.',
      es: 'Los raíles del tranvía pueden atrapar la rueda de la bici si los cruzas en ángulo bajo, provocando una caída inmediata. Cruza siempre en ángulo recto, sobre todo en ciudades donde el tranvía comparte calzada con los ciclistas.',
    },
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'bf66aa0b-0686-418a-b749-e86a4e72eef9',
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
      en: 'Cobblestone streets, common in old town centres, have gaps that can catch narrow road bike tires. Reduce speed, use wider tires if possible, and avoid braking sharply on wet cobblestones.',
      ro: 'Străzile pavate cu piatră cubică, frecvente în centrele istorice, au rosturi care pot prinde cauciucuri subțiri de șosea. Redu viteza, folosește cauciucuri mai late dacă poți și evită frânările bruște pe pavaj ud.',
      es: 'Las calles adoquinadas, frecuentes en los cascos históricos, tienen juntas que pueden atrapar neumáticos finos de bici de carretera. Reduce la velocidad, usa cubiertas más anchas si es posible y evita frenar de golpe sobre adoquines mojados.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: '931caf55-e82c-4da8-aa22-b897460c16f0',
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
      en: 'City buses pull out from stops frequently. The driver may not see you in the mirror. Always assume you are invisible and let the bus merge first — you will catch up at the next stop.',
      ro: 'Autobuzele urbane pleacă frecvent din stații. Șoferul poate să nu te vadă în oglindă. Presupune mereu că ești invizibil și lasă autobuzul să se reintegreze primul — îl prinzi din urmă la următoarea stație.',
      es: 'Los autobuses urbanos se incorporan constantemente desde paradas. Es posible que el conductor no te vea por el espejo. Asume siempre que eres invisible y deja que el autobús se incorpore primero — lo alcanzarás en la siguiente parada.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: '131df4c0-322a-4644-bcd6-bc33bec03164',
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
      en: 'The right-hook happens when a car overtakes you and immediately turns right, cutting across your path. At intersections, make eye contact with drivers and be ready to brake. It is one of the leading causes of urban cycling accidents.',
      ro: '„Right-hook” se întâmplă când o mașină te depășește și virează imediat la dreapta, tăindu-ți drumul. În intersecții, caută contactul vizual cu șoferii și fii pregătit să frânezi. Este una dintre cele mai frecvente cauze ale accidentelor urbane ciclistice.',
      es: 'El "right-hook" ocurre cuando un coche te adelanta y gira inmediatamente a la derecha, cruzándose en tu trayectoria. En los cruces, busca el contacto visual con los conductores y prepárate para frenar. Es una de las causas más habituales de accidentes ciclistas urbanos.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: '2f89dcfc-3aff-4c23-b9b5-e47fd3bf01d7',
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
      en: 'Cyclists breathe deeper and faster than car occupants, inhaling 2-5 times more pollutants. On days when air quality is poor, prefer routes through parks or side streets and avoid rush-hour traffic on major boulevards.',
      ro: 'Cicliștii respiră mai adânc și mai rapid decât ocupanții mașinilor și inhalează de 2-5 ori mai mulți poluanți. În zilele cu aer poluat, preferă rute prin parcuri sau străzi laterale și evită orele de vârf pe bulevardele mari.',
      es: 'Los ciclistas respiran más profundo y más rápido que los ocupantes de un coche e inhalan entre 2 y 5 veces más contaminantes. Los días con mala calidad del aire, prioriza rutas por parques o calles secundarias y evita las grandes avenidas en hora punta.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'a22a4dbb-572e-408c-8e02-21f611e308ae',
    questionText: {
      en: 'What should you do when a bike lane is blocked by a parked car?',
      ro: 'Ce faci când o pistă de biciclete este blocată de o mașină parcată?',
      es: 'Si un carril bici está bloqueado por un coche aparcado, ¿qué debes hacer?',
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
      en: 'Blocked bike lanes are common in many cities. Check over your shoulder, signal with your arm, merge safely into the traffic lane, pass the obstacle, and return to the bike lane. Never squeeze into a gap between a car and the curb.',
      ro: 'Pistele blocate sunt frecvente în multe orașe. Privește peste umăr, semnalizează cu brațul, intră în siguranță în banda de circulație, depășește obstacolul și revino pe pistă. Nu te strecura niciodată între mașină și bordură.',
      es: 'Los carriles bici bloqueados son habituales en muchas ciudades. Mira por encima del hombro, señaliza con el brazo, incorpórate al carril de circulación con seguridad, adelanta el obstáculo y vuelve al carril bici. Nunca pases por el hueco entre el coche y el bordillo.',
    },
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: '1c2c1580-0fca-4901-bb3f-dd3332121933',
    questionText: {
      en: 'What does a blue circular sign with a white bicycle mean in most European countries?',
      ro: 'Ce semnifică un indicator circular albastru cu o bicicletă albă în majoritatea țărilor europene?',
      es: '¿Qué significa una señal circular azul con una bicicleta blanca en la mayoría de los países europeos?',
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
      en: 'Under the Vienna Convention signage used across most of Europe, a blue circular sign with a white bicycle indicates a mandatory bike path. When this sign is present, cyclists are generally required to use the marked path instead of the main carriageway.',
      ro: 'Conform semnalizării din Convenția de la Viena, folosită în cea mai mare parte a Europei, un indicator circular albastru cu o bicicletă albă indică pistă obligatorie pentru biciclete. Când acest indicator este prezent, ciclistul este în general obligat să folosească pista marcată în loc de carosabilul principal.',
      es: 'Según la señalización de la Convención de Viena, usada en la mayor parte de Europa, una señal circular azul con una bicicleta blanca indica una vía ciclista obligatoria. Cuando aparece, el ciclista está generalmente obligado a usarla en lugar de la calzada principal.',
    },
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: '50c6c18a-5a2a-4d7e-879b-d04f43a0b50c',
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
      en: 'Railway crossings can be unguarded, especially on rural roads. Always slow down, look and listen for trains in both directions, and cross tracks at a right angle to avoid your wheel getting caught in the rail groove.',
      ro: 'Trecerile de cale ferată pot fi nepăzite, mai ales pe drumurile rurale. Încetinește mereu, privește și ascultă trenurile din ambele direcții și traversează șinele în unghi drept pentru ca roata să nu se prindă în canalul șinei.',
      es: 'Los pasos a nivel pueden estar sin barreras, sobre todo en carreteras rurales. Reduce siempre la velocidad, mira y escucha a ambos lados, y cruza las vías en ángulo recto para que la rueda no quede atrapada en la ranura del raíl.',
    },
    category: 'infrastructure',
    difficulty: 2,
  },
  {
    id: 'f22e9a78-99a8-47f2-9a46-2246b71de385',
    questionText: {
      en: 'What is the maximum legal assisted speed for an e-bike (EPAC pedelec) under EU rules?',
      ro: 'Care este viteza maximă legală cu asistență pentru o e-bike (EPAC / pedelec) conform regulilor UE?',
      es: '¿Cuál es la velocidad máxima legal con asistencia para una bici eléctrica (EPAC / pedelec) según las normas de la UE?',
    },
    options: {
      en: [
        'There is no speed limit',
        '25 km/h (motor assistance cuts off at this speed)',
        '45 km/h',
        '50 km/h, the same as cars in urban areas',
      ],
      ro: [
        'Nu există limită de viteză',
        '25 km/h (asistența motorului se oprește la această viteză)',
        '45 km/h',
        '50 km/h, ca pentru mașini în zonă urbană',
      ],
      es: [
        'No hay límite de velocidad',
        '25 km/h (la asistencia del motor se corta a esa velocidad)',
        '45 km/h',
        '50 km/h, lo mismo que un coche en zona urbana',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Standard pedal-powered bicycles have no fixed legal speed limit but must adapt to road, traffic, and visibility conditions. Pedal-assist e-bikes (EPACs) follow the EU pedelec rule: motor assistance cuts off at 25 km/h and the motor must not exceed 250 W. Faster e-bikes (S-pedelecs) require moped registration, insurance, and a license.',
      ro: 'Bicicletele convenționale nu au limită fixă de viteză, dar trebuie să se adapteze drumului, traficului și vizibilității. E-bike-urile cu asistență la pedalare (EPAC) urmează regula UE pedelec: asistența se oprește la 25 km/h, iar motorul nu poate depăși 250 W. E-bike-urile mai rapide (S-pedelec) necesită înmatriculare ca moped, asigurare și permis.',
      es: 'La bicicleta convencional no tiene un límite de velocidad fijo, pero debe adaptarse a la vía, tráfico y visibilidad. Las e-bikes con asistencia al pedaleo (EPAC) siguen la norma europea pedelec: la asistencia se corta a 25 km/h y el motor no puede superar los 250 W. Las e-bikes más rápidas (S-pedelecs) requieren matrícula, seguro y permiso de ciclomotor.',
    },
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: '37da8301-14e1-4c2d-9821-22e52d7b6269',
    questionText: {
      en: 'A car overtakes you much too closely. What is the safest immediate reaction?',
      ro: 'O mașină te depășește mult prea aproape. Care este cea mai sigură reacție imediată?',
      es: 'Un coche te adelanta demasiado cerca. ¿Cuál es la reacción inmediata más segura?',
    },
    options: {
      en: [
        'Swerve towards the kerb to open up more space',
        'Hold your line, keep pedalling smoothly, and let the car clear you',
        'Brake hard so the car gets past faster',
        "Match the car's speed to stay alongside it",
      ],
      ro: [
        'Tragi brusc spre bordură ca să faci mai mult spațiu',
        'Îți menții traiectoria, pedalezi constant și lași mașina să te depășească',
        'Frânezi puternic ca mașina să treacă mai repede',
        'Ții pasul cu mașina ca să rămâi lângă ea',
      ],
      es: [
        'Desviarte hacia el bordillo para dejar más espacio',
        'Mantener tu trayectoria, seguir pedaleando de forma constante y dejar que el coche termine el adelantamiento',
        'Frenar con fuerza para que el coche pase antes',
        'Igualar la velocidad del coche para quedarte a su lado',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'A sudden swerve or hard brake is what turns a close pass into a crash — you lose stability and become unpredictable to whoever is behind. Hold a straight, steady line until the vehicle has fully passed, then return to your normal riding position.',
      ro: 'O smucitură de ghidon sau o frânare bruscă transformă o depășire prea apropiată într-un accident — pierzi stabilitatea și devii imprevizibil pentru cel din spate. Ține o linie dreaptă și constantă până când vehiculul te-a depășit complet, apoi revino la poziția normală de mers.',
      es: 'Un volantazo o un frenazo es lo que convierte un adelantamiento cercano en una caída — pierdes estabilidad y te vuelves imprevisible para quien viene detrás. Mantén una línea recta y estable hasta que el vehículo te haya rebasado por completo y después vuelve a tu posición habitual.',
    },
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: '3aa4dc79-4c83-4611-bf69-04ff026cf12a',
    questionText: {
      en: 'What makes you most visible to drivers when riding after dark?',
      ro: 'Ce te face cel mai vizibil pentru șoferi când pedalezi pe întuneric?',
      es: '¿Qué te hace más visible para los conductores al pedalear de noche?',
    },
    options: {
      en: [
        'A white front light, a red rear light, and reflective material on your moving parts',
        'Light-coloured clothing on its own',
        'A single flashing light on your helmet',
        'Riding closer to the middle of the road',
      ],
      ro: [
        'Un far alb în față, o lumină roșie în spate și material reflectorizant pe părțile aflate în mișcare',
        'Doar haine de culoare deschisă',
        'O singură lumină intermitentă pe cască',
        'Mersul mai aproape de mijlocul drumului',
      ],
      es: [
        'Una luz blanca delante, una luz roja detrás y material reflectante en las partes que se mueven',
        'Solo ropa de color claro',
        'Una única luz intermitente en el casco',
        'Circular más cerca del centro de la calzada',
      ],
    },
    correctIndex: 0,
    explanation: {
      en: 'Lights make you detectable; reflective material on ankles, pedals or shoes makes you recognisable as a cyclist, because the eye picks out moving reflections first. Clothing colour alone is nearly invisible in a headlight beam.',
      ro: 'Luminile te fac detectabil, iar reflectorizantele de pe glezne, pedale sau pantofi te fac recognoscibil drept biciclist, pentru că ochiul sesizează primul reflexiile în mișcare. Culoarea hainelor, singură, este aproape invizibilă în fasciculul farurilor.',
      es: 'Las luces te hacen detectable; el material reflectante en tobillos, pedales o zapatillas te hace reconocible como ciclista, porque el ojo detecta antes los reflejos en movimiento. El color de la ropa por sí solo resulta casi invisible bajo los faros.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: '779efede-d3ef-42c0-ae2c-09b72ec89886',
    questionText: {
      en: 'How should you brake on a wet road?',
      ro: 'Cum trebuie să frânezi pe carosabil ud?',
      es: '¿Cómo debes frenar sobre calzada mojada?',
    },
    options: {
      en: [
        'Use the front brake only, as hard as you can',
        'Start braking earlier and apply both brakes progressively',
        'Use the rear brake only and skid to a stop',
        'Brake at the same point as in the dry, but harder',
      ],
      ro: [
        'Folosești doar frâna din față, cât de tare poți',
        'Începi să frânezi mai devreme și acționezi progresiv ambele frâne',
        'Folosești doar frâna din spate și derapezi până la oprire',
        'Frânezi din același punct ca pe uscat, dar mai puternic',
      ],
      es: [
        'Usar solo el freno delantero, con toda la fuerza posible',
        'Empezar a frenar antes y accionar ambos frenos de forma progresiva',
        'Usar solo el freno trasero y derrapar hasta parar',
        'Frenar en el mismo punto que en seco, pero más fuerte',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Wet rims and tyres need noticeably more distance to stop, and grabbing either brake can lock a wheel. Begin braking earlier than you would in the dry and squeeze both levers progressively, keeping the bike upright and straight.',
      ro: 'Jantele și cauciucurile ude au nevoie de o distanță vizibil mai mare până la oprire, iar o strângere bruscă a oricărei frâne poate bloca roata. Începe să frânezi mai devreme decât pe uscat și strânge progresiv ambele manete, menținând bicicleta dreaptă și verticală.',
      es: 'Con las llantas y los neumáticos mojados la distancia de frenado crece de forma notable, y un tirón brusco de cualquiera de los frenos puede bloquear la rueda. Empieza a frenar antes que en seco y aprieta las dos manetas de forma progresiva, con la bici recta y vertical.',
    },
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: 'cbf7f814-06e0-4551-81db-f41453eb5fe3',
    questionText: {
      en: 'You need to turn left across several lanes of fast traffic. What is the safer alternative to merging left?',
      ro: 'Trebuie să virezi la stânga peste mai multe benzi cu trafic rapid. Care este alternativa mai sigură la încadrarea spre stânga?',
      es: 'Tienes que girar a la izquierda cruzando varios carriles de tráfico rápido. ¿Cuál es la alternativa más segura a incorporarte a la izquierda?',
    },
    options: {
      en: [
        'Dismount and run across between the cars',
        'A two-stage turn: ride straight through, stop at the far corner, then set off in the new direction',
        'Turn from the right-hand edge without looking back',
        'Wait on the centre line until every lane is empty',
      ],
      ro: [
        'Cobori și treci în fugă printre mașini',
        'Un viraj în doi timpi: treci drept prin intersecție, te oprești în colțul opus, apoi pleci în noua direcție',
        'Virezi de pe marginea din dreapta, fără să privești în spate',
        'Aștepți pe axul drumului până se golesc toate benzile',
      ],
      es: [
        'Bajarte y cruzar corriendo entre los coches',
        'Un giro en dos tiempos: cruzar recto, parar en la esquina opuesta y salir después en la nueva dirección',
        'Girar desde el borde derecho sin mirar atrás',
        'Esperar sobre la línea central hasta que todos los carriles estén vacíos',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'A two-stage turn keeps you out of fast-moving lanes: ride straight through the junction, stop and reposition in the far corner facing your new direction, then set off with that flow of traffic. It costs a few seconds and removes the most exposed manoeuvre in urban cycling.',
      ro: 'Virajul în doi timpi te ține în afara benzilor cu trafic rapid: treci drept prin intersecție, te oprești și te repoziționezi în colțul opus, orientat pe noua direcție, apoi pleci odată cu acel flux de trafic. Costă câteva secunde și elimină cea mai expusă manevră din ciclismul urban.',
      es: 'El giro en dos tiempos te mantiene fuera de los carriles rápidos: cruzas recto el cruce, paras y te recolocas en la esquina opuesta mirando hacia tu nueva dirección y sales con ese flujo de tráfico. Cuesta unos segundos y elimina la maniobra más expuesta del ciclismo urbano.',
    },
    category: 'road_safety',
    difficulty: 3,
  },
  {
    id: '0fbbd5c1-032d-4bd6-b8bc-3451691e70fb',
    questionText: {
      en: 'A long truck is stopped at a junction with its right indicator on. Where should you be?',
      ro: 'Un camion lung este oprit într-o intersecție cu semnalizatorul dreapta pornit. Unde ar trebui să fii?',
      es: 'Un camión largo está parado en un cruce con el intermitente derecho puesto. ¿Dónde deberías situarte?',
    },
    options: {
      en: [
        'Alongside its right side, in the gap next to the kerb',
        'Behind it, where you can see its mirrors, until the turn is finished',
        'Directly in front of the cab as it starts to move',
        'Overtaking on its left while it is turning',
      ],
      ro: [
        'Pe partea lui dreaptă, în spațiul de lângă bordură',
        'În spatele lui, de unde îi vezi oglinzile, până termină virajul',
        'Chiar în fața cabinei, în momentul în care pornește',
        'Îl depășești pe stânga în timp ce virează',
      ],
      es: [
        'A su derecha, en el hueco junto al bordillo',
        'Detrás de él, donde puedas ver sus espejos, hasta que termine el giro',
        'Justo delante de la cabina en el momento en que arranca',
        'Adelantándolo por la izquierda mientras gira',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'The gap between a turning truck and the kerb closes as the trailer cuts the corner, and that space sits in the worst blind spot the driver has. Stay behind the vehicle where you can see its mirrors — if you cannot see the mirrors, the driver cannot see you — and wait for the turn to finish.',
      ro: 'Spațiul dintre un camion care virează și bordură se închide pe măsură ce semiremorca taie colțul, iar acolo se află cel mai prost unghi mort al șoferului. Rămâi în spatele vehiculului, de unde îi vezi oglinzile — dacă tu nu vezi oglinzile, nici șoferul nu te vede — și așteaptă să termine virajul.',
      es: 'El hueco entre un camión que gira y el bordillo se cierra según el remolque recorta la curva, y ese espacio queda en el peor ángulo muerto del conductor. Quédate detrás del vehículo, donde puedas ver sus espejos — si tú no ves los espejos, el conductor no te ve a ti — y espera a que complete el giro.',
    },
    category: 'road_safety',
    difficulty: 3,
  },
  {
    id: '2a61bde7-f734-4223-8ed5-abf393969587',
    questionText: {
      en: 'How should a cycling helmet sit on your head?',
      ro: 'Cum trebuie să stea casca de ciclism pe cap?',
      es: '¿Cómo debe asentarse el casco en la cabeza?',
    },
    options: {
      en: [
        'Level, about two fingers above the eyebrows, with the straps forming a V under each ear',
        'Tilted back so it does not block your view',
        'Loose, so it can move if you fall',
        'Low over the eyes with the chin strap unfastened',
      ],
      ro: [
        'Drept, la aproximativ două degete deasupra sprâncenelor, cu chingile formând un V sub fiecare ureche',
        'Înclinată spre spate, ca să nu îți acopere vederea',
        'Lejer, ca să se poată mișca la o cădere',
        'Trasă peste ochi, cu cureaua de bărbie desfăcută',
      ],
      es: [
        'Nivelado, unos dos dedos por encima de las cejas, con las cintas formando una V bajo cada oreja',
        'Inclinado hacia atrás para que no te tape la vista',
        'Holgado, para que pueda moverse en una caída',
        'Calado sobre los ojos y con la cinta de la barbilla suelta',
      ],
    },
    correctIndex: 0,
    explanation: {
      en: 'A helmet only protects the part of your head it covers. Sit it level, two finger-widths above the eyebrows, adjust the side straps into a V just under the ears, and tighten the chin strap so only one finger fits underneath. A helmet tilted back leaves your forehead exposed in exactly the impact that matters most.',
      ro: 'Casca protejează doar zona pe care o acoperă. Așaz-o drept, la două lățimi de deget deasupra sprâncenelor, reglează chingile laterale într-un V chiar sub urechi și strânge cureaua de bărbie astfel încât să încapă un singur deget sub ea. O cască împinsă pe spate îți lasă fruntea descoperită exact la impactul care contează cel mai mult.',
      es: 'El casco solo protege la zona que cubre. Colócalo nivelado, a dos dedos por encima de las cejas, ajusta las cintas laterales en forma de V justo bajo las orejas y aprieta la correa de la barbilla hasta que solo quepa un dedo. Un casco echado hacia atrás deja la frente al descubierto justo en el impacto que más importa.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'a8f4edc1-a172-4510-bb14-22f254d121c6',
    questionText: {
      en: 'What is the safest way to carry a heavy load on a bicycle?',
      ro: 'Care este cel mai sigur mod de a transporta o greutate mare pe bicicletă?',
      es: '¿Cuál es la forma más segura de llevar carga pesada en bici?',
    },
    options: {
      en: [
        'Hanging from the handlebars',
        'Low and centred, in panniers over the wheels or in a rack basket',
        'In one hand while you steer with the other',
        'On your back in a loose rucksack that shifts as you ride',
      ],
      ro: [
        'Atârnată de ghidon',
        'Jos și centrat, în coșuri laterale deasupra roților sau într-un coș pe portbagaj',
        'Într-o mână, în timp ce conduci cu cealaltă',
        'În spate, într-un rucsac care se mișcă liber în timpul mersului',
      ],
      es: [
        'Colgada del manillar',
        'Baja y centrada, en alforjas sobre las ruedas o en una cesta del portabultos',
        'En una mano, mientras manejas con la otra',
        'A la espalda, en una mochila suelta que se desplaza al rodar',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Weight on the handlebars destabilises the steering and makes the front wheel flop at low speed; a bag held in one hand does the same and blocks your braking. Carry loads low and close to the wheel axles so the centre of gravity stays put, and remember a loaded bike needs more distance to stop.',
      ro: 'Greutatea pe ghidon destabilizează direcția și face roata din față să cadă în lateral la viteză mică; o sacoșă ținută în mână are același efect și îți blochează frânarea. Transportă încărcătura jos și aproape de axele roților, ca centrul de greutate să rămână stabil, și ține minte că o bicicletă încărcată frânează pe o distanță mai mare.',
      es: 'El peso en el manillar desestabiliza la dirección y hace que la rueda delantera se venza a baja velocidad; una bolsa en la mano hace lo mismo y te impide frenar. Lleva la carga baja y cerca de los ejes de las ruedas para que el centro de gravedad no se desplace, y recuerda que una bici cargada necesita más distancia para detenerse.',
    },
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: 'f7c3214d-131f-4776-9494-ded170ffd51d',
    questionText: {
      en: 'You realise you have ridden onto a patch of ice. What should you do?',
      ro: 'Îți dai seama că ai intrat pe o porțiune de gheață. Ce faci?',
      es: 'Te das cuenta de que has entrado en una placa de hielo. ¿Qué haces?',
    },
    options: {
      en: [
        'Brake hard immediately',
        'Keep the bike upright and straight, stop pedalling, and coast across without braking or steering',
        'Turn sharply to get off the ice',
        'Stand up on the pedals and accelerate',
      ],
      ro: [
        'Frânezi imediat, puternic',
        'Ții bicicleta dreaptă și verticală, oprești pedalatul și te lași să aluneci peste, fără să frânezi sau să virezi',
        'Virezi brusc ca să ieși de pe gheață',
        'Te ridici pe pedale și accelerezi',
      ],
      es: [
        'Frenar con fuerza de inmediato',
        'Mantener la bici recta y vertical, dejar de pedalear y pasar por inercia sin frenar ni girar',
        'Girar bruscamente para salir del hielo',
        'Ponerte de pie sobre los pedales y acelerar',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'On ice the tyres have almost no grip, and braking, steering and pedalling all demand grip you do not have. Stay relaxed, keep your weight centred and the bars straight, and simply roll across; make any correction only once you are back on a surface with traction.',
      ro: 'Pe gheață, cauciucurile aproape că nu au aderență, iar frânarea, virarea și pedalatul cer exact aderența pe care nu o ai. Rămâi relaxat, ține greutatea centrată și ghidonul drept și treci pur și simplu peste porțiune; fă orice corecție abia după ce ai revenit pe o suprafață cu aderență.',
      es: 'Sobre hielo los neumáticos apenas tienen agarre, y frenar, girar o pedalear exigen justo el agarre que no tienes. Mantente relajado, con el peso centrado y el manillar recto, y limítate a pasar por inercia; corrige solo cuando vuelvas a una superficie con adherencia.',
    },
    category: 'road_safety',
    difficulty: 3,
  },
  {
    id: 'abd63afe-f558-474a-a54b-6a6d930302f5',
    questionText: {
      en: 'You are riding in a group on a narrow road with traffic behind. What is the safest formation?',
      ro: 'Pedalezi în grup pe un drum îngust, cu trafic în spate. Care este formația cea mai sigură?',
      es: 'Ruedas en grupo por una vía estrecha con tráfico detrás. ¿Cuál es la formación más segura?',
    },
    options: {
      en: [
        'Spread across the full width so nobody can overtake',
        'Single file, with gaps that let drivers overtake in stages',
        'Side by side in a tight bunch with no gaps',
        'Each rider weaving so the group is more noticeable',
      ],
      ro: [
        'Ocupați toată lățimea, ca nimeni să nu vă poată depăși',
        'Coloană pe un singur rând, cu spații care permit șoferilor să depășească pe etape',
        'Câte doi, într-un pluton strâns, fără spații',
        'Fiecare ciclist șerpuiește, ca grupul să fie mai vizibil',
      ],
      es: [
        'Ocupar todo el ancho para que nadie pueda adelantar',
        'En fila india, con huecos que permitan adelantar por tramos',
        'En paralelo y muy juntos, sin huecos',
        'Que cada ciclista zigzaguee para que el grupo se vea más',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'A long unbroken line is as hard to overtake as a wide one — drivers commit to a pass they cannot finish. Ride single file on narrow roads and leave a gap every few riders so vehicles can leapfrog the group safely. Call hazards out loud: the riders behind cannot see the road surface.',
      ro: 'O coloană lungă și neîntreruptă este la fel de greu de depășit ca una lată — șoferii încep o depășire pe care nu o pot termina. Pe drumuri înguste mergeți pe un singur rând și lăsați un spațiu la câțiva cicliști, ca vehiculele să poată depăși grupul pe etape. Semnalați vocal obstacolele: cei din spate nu văd carosabilul.',
      es: 'Una fila larga e ininterrumpida es tan difícil de adelantar como un grupo ancho — el conductor inicia un adelantamiento que no puede terminar. En vías estrechas rodad en fila india y dejad un hueco cada pocos ciclistas para que los vehículos puedan rebasar el grupo por tramos. Cantad los obstáculos en voz alta: quien va detrás no ve el asfalto.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'a2d29eee-b5a1-400c-a453-3393217f6619',
    questionText: {
      en: 'Why is a low sun behind you especially dangerous when riding?',
      ro: 'De ce este periculos în mod special un soare jos aflat în spatele tău?',
      es: '¿Por qué resulta especialmente peligroso un sol bajo situado a tu espalda?',
    },
    options: {
      en: [
        'It heats your back and causes fatigue',
        'Drivers coming up behind look straight into the glare and may not see you at all',
        'Your shadow confuses other cyclists',
        'It has no effect — only a sun in front of you matters',
      ],
      ro: [
        'Îți încălzește spatele și te obosește',
        'Șoferii care vin din spate privesc direct în lumina orbitoare și pot să nu te vadă deloc',
        'Umbra ta îi derutează pe ceilalți cicliști',
        'Nu are niciun efect — contează doar soarele din față',
      ],
      es: [
        'Te calienta la espalda y provoca fatiga',
        'Los conductores que se acercan por detrás miran directamente al deslumbramiento y pueden no verte',
        'Tu sombra confunde a otros ciclistas',
        'No influye — solo importa el sol de frente',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'When the sun sits low behind you, every driver approaching from behind is looking straight into it and you are in the middle of that glare. Assume you are invisible: run a rear light even in daylight, hold a predictable line, and take extra care at junctions where a driver would have to pick you out of the light.',
      ro: 'Când soarele este jos în spatele tău, fiecare șofer care se apropie din spate privește direct în el, iar tu ești chiar în mijlocul acelei lumini. Presupune că ești invizibil: folosește lumina roșie din spate chiar și ziua, ține o traiectorie previzibilă și fii extrem de atent în intersecții, unde șoferul ar trebui să te distingă din lumină.',
      es: 'Con el sol bajo a tu espalda, todo conductor que se aproxima por detrás mira directamente hacia él y tú quedas en mitad de ese deslumbramiento. Da por hecho que eres invisible: lleva luz trasera incluso de día, mantén una trayectoria previsible y extrema la precaución en los cruces, donde el conductor tendría que distinguirte a contraluz.',
    },
    category: 'risk_awareness',
    difficulty: 3,
  },
  {
    id: '1acd1347-9830-4660-a5c6-57625a932d2f',
    questionText: {
      en: 'What changes when you ride a pedal-assist e-bike instead of a regular bicycle?',
      ro: 'Ce se schimbă când pedalezi pe o bicicletă electrică cu asistență la pedalare, față de una obișnuită?',
      es: '¿Qué cambia al rodar en una bici eléctrica con asistencia al pedaleo en lugar de una convencional?',
    },
    options: {
      en: [
        'Nothing — they handle identically',
        'It is heavier and reaches junctions sooner, so braking distances grow and drivers misjudge your speed',
        'It stops faster because the motor helps slow it down',
        'It is more stable, so you can leave braking later',
      ],
      ro: [
        'Nimic — se comportă identic',
        'Este mai grea și ajunge mai repede în intersecții, deci distanțele de frânare cresc, iar șoferii îți subestimează viteza',
        'Se oprește mai repede, pentru că motorul ajută la frânare',
        'Este mai stabilă, deci poți frâna mai târziu',
      ],
      es: [
        'Nada — se comportan igual',
        'Pesa más y llega antes a los cruces, así que la distancia de frenado aumenta y los conductores calculan mal tu velocidad',
        'Frena antes porque el motor ayuda a detenerla',
        'Es más estable, así que puedes frenar más tarde',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'A pedal-assist e-bike typically weighs 8-12 kg more and carries that mass into every stop, so it needs more distance to brake. It also arrives at junctions sooner than drivers expect from a bicycle, which is why they pull out in front of one. Brake earlier and leave room for others to misjudge you.',
      ro: 'O bicicletă electrică cu asistență cântărește de obicei cu 8-12 kg mai mult și duce masa asta în fiecare frânare, deci are nevoie de o distanță mai mare până la oprire. În plus, ajunge în intersecție mai devreme decât se așteaptă șoferii de la o bicicletă — de aceea îi taie calea. Frânează mai devreme și lasă loc pentru estimările greșite ale celorlalți.',
      es: 'Una bici con asistencia al pedaleo suele pesar entre 8 y 12 kg más y arrastra esa masa en cada frenada, por lo que necesita más distancia para detenerse. Además llega a los cruces antes de lo que el conductor espera de una bici, y por eso se le cruzan. Frena antes y deja margen para que otros calculen mal tu velocidad.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'c271d617-6f14-4037-92f8-2915ba1b36f3',
    questionText: {
      en: 'Why are wet leaves on the road a serious hazard for cyclists?',
      ro: 'De ce sunt frunzele ude de pe carosabil un pericol serios pentru cicliști?',
      es: '¿Por qué las hojas mojadas en la calzada son un peligro serio para el ciclista?',
    },
    options: {
      en: [
        'They clog the chain',
        'They form a slippery layer and hide potholes, kerbs and drain covers underneath',
        'They make the bike heavier',
        'They only matter for motorcycles',
      ],
      ro: [
        'Înfundă lanțul',
        'Formează un strat alunecos și ascund gropi, borduri și capace de canalizare',
        'Îngreunează bicicleta',
        'Contează doar pentru motociclete',
      ],
      es: [
        'Atascan la cadena',
        'Forman una capa deslizante y ocultan baches, bordillos y tapas de alcantarilla',
        'Hacen la bici más pesada',
        'Solo afectan a las motos',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'A layer of wet leaves behaves like a thin film of oil, and it also conceals whatever is underneath — holes, edges, metal covers. Cross leafy patches upright and at steady speed, without braking or turning on them, and take extra care in shaded corners where they stay wet all day.',
      ro: 'Un strat de frunze ude se comportă ca o peliculă subțire de ulei și, în plus, ascunde tot ce se află dedesubt — gropi, muchii, capace metalice. Treci peste porțiunile cu frunze în poziție verticală și la viteză constantă, fără să frânezi sau să virezi pe ele, și fii atent în curbele umbrite, unde rămân ude toată ziua.',
      es: 'Una capa de hojas mojadas se comporta como una fina película de aceite y además tapa lo que hay debajo: baches, resaltes, tapas metálicas. Cruza esas zonas con la bici vertical y a velocidad constante, sin frenar ni girar sobre ellas, y extrema el cuidado en curvas sombrías, donde siguen mojadas todo el día.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: '1e18ec01-bee2-4a1f-b449-b967ae29fb40',
    questionText: {
      en: 'How should you pass pedestrians on a path you share with them?',
      ro: 'Cum treci pe lângă pietoni pe o alee pe care o împarți cu ei?',
      es: '¿Cómo debes adelantar a los peatones en un camino compartido?',
    },
    options: {
      en: [
        'Ring the bell continuously and keep your speed',
        'Slow down, warn them early with a bell or your voice, and pass wide',
        'Pass as close as possible so you do not leave the path',
        'Pass from behind without any warning so you do not startle them',
      ],
      ro: [
        'Suni continuu din clopoțel și îți păstrezi viteza',
        'Încetinești, îi avertizezi din timp cu clopoțelul sau vocea și treci la distanță',
        'Treci cât mai aproape, ca să nu ieși de pe alee',
        'Treci pe la spate fără niciun avertisment, ca să nu îi sperii',
      ],
      es: [
        'Tocar el timbre sin parar y mantener la velocidad',
        'Reducir la velocidad, avisar con tiempo con el timbre o la voz y pasar con holgura',
        'Pasar lo más cerca posible para no salirte del camino',
        'Pasar por detrás sin avisar, para no asustarlos',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Pedestrians on a shared path can step sideways without looking, and children and dogs move unpredictably. Drop your speed well in advance, give a friendly warning early rather than at their shoulder, and leave as much lateral space as you would want from a car.',
      ro: 'Pietonii de pe o alee comună pot păși lateral fără să se uite, iar copiii și câinii se mișcă imprevizibil. Redu viteza cu mult înainte, avertizează prietenos din timp, nu chiar lângă umărul lor, și lasă la fel de mult spațiu lateral cât ți-ai dori de la o mașină.',
      es: 'En un camino compartido los peatones pueden desplazarse de lado sin mirar, y los niños y los perros se mueven de forma imprevisible. Baja la velocidad con antelación, avisa pronto y de forma amable en lugar de hacerlo pegado a su hombro, y deja tanto espacio lateral como te gustaría recibir de un coche.',
    },
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: '48441693-4a1f-4b76-8605-a0a43207db14',
    questionText: {
      en: 'Where does a cycle track separated from the road become most dangerous?',
      ro: 'Unde devine cel mai periculoasă o pistă de biciclete separată de carosabil?',
      es: '¿Dónde se vuelve más peligroso un carril bici separado de la calzada?',
    },
    options: {
      en: [
        'In the middle of a long straight section',
        'At driveways and side-street crossings, where turning drivers look late and see you late',
        'Wherever it runs downhill',
        'Where it is at its widest',
      ],
      ro: [
        'În mijlocul unui tronson lung și drept',
        'La intrările în curți și la traversările străzilor laterale, unde șoferii care virează se uită târziu și te văd târziu',
        'Oriunde coboară în pantă',
        'Acolo unde este cea mai lată',
      ],
      es: [
        'En mitad de un tramo recto y largo',
        'En los vados y cruces con calles laterales, donde el conductor que gira mira tarde y te ve tarde',
        'En cualquier tramo en bajada',
        'Donde es más ancho',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Separation removes the danger between junctions and concentrates it wherever a vehicle crosses the track. A driver turning in or out is looking for traffic on the carriageway, often checking only once the nose of the car is already over the cycle track. Cover your brakes, slow at each crossing, and try to make eye contact before you commit.',
      ro: 'Separarea elimină pericolul dintre intersecții și îl concentrează în fiecare punct în care un vehicul traversează pista. Șoferul care intră sau iese caută traficul de pe carosabil și de multe ori se uită abia după ce botul mașinii a ajuns deja peste pistă. Ține degetele pe manete, încetinește la fiecare traversare și încearcă să prinzi contactul vizual înainte de a trece.',
      es: 'La separación elimina el peligro entre cruces y lo concentra en cada punto donde un vehículo atraviesa el carril. Quien entra o sale busca el tráfico de la calzada y muchas veces mira cuando el morro del coche ya está sobre el carril bici. Lleva los dedos en las manetas, reduce en cada cruce y busca el contacto visual antes de pasar.',
    },
    category: 'infrastructure',
    difficulty: 3,
  },
  {
    id: 'dbefc4f0-add0-4934-b716-fa5a8a664f8a',
    questionText: {
      en: 'After a fall, a rider is confused, dizzy and cannot remember the crash. What should you do?',
      ro: 'După o cădere, un ciclist este confuz, amețit și nu își amintește accidentul. Ce faci?',
      es: 'Tras una caída, un ciclista está confuso, mareado y no recuerda el golpe. ¿Qué haces?',
    },
    options: {
      en: [
        'Let them ride home slowly if they can stand up',
        'Treat it as a possible head injury: end the ride, keep them still, and get medical help',
        'Give them water and carry on after a short rest',
        'Remove the helmet straight away to check for bumps',
      ],
      ro: [
        'Îl lași să meargă încet acasă cu bicicleta, dacă se poate ridica',
        'Tratezi situația ca pe o posibilă traumă craniană: încheiați cursa, îl ții nemișcat și ceri ajutor medical',
        'Îi dai apă și continuați după o scurtă pauză',
        'Îi scoți imediat casca, ca să verifici dacă are cucuie',
      ],
      es: [
        'Dejar que vuelva a casa pedaleando despacio si se tiene en pie',
        'Tratarlo como posible traumatismo craneal: terminar la salida, mantenerlo quieto y buscar asistencia médica',
        'Darle agua y seguir tras un breve descanso',
        'Quitarle el casco de inmediato para buscar chichones',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Confusion, dizziness and memory gaps are warning signs of concussion, which can get worse over hours. End the ride, keep the person still and watched, and seek a medical assessment — do not let them cycle off alone. Leave the helmet in place unless it obstructs breathing, since moving the head can worsen a neck injury.',
      ro: 'Confuzia, amețeala și lipsurile de memorie sunt semne de alarmă pentru comoție, care se poate agrava în câteva ore. Încheie cursa, ține persoana nemișcată și sub supraveghere și cere o evaluare medicală — nu o lăsa să plece singură pe bicicletă. Lasă casca pe cap dacă nu împiedică respirația, pentru că mișcarea capului poate agrava o leziune a gâtului.',
      es: 'La confusión, el mareo y las lagunas de memoria son señales de alarma de conmoción, que puede agravarse en horas. Termina la salida, mantén a la persona quieta y vigilada y busca valoración médica — no la dejes marcharse sola en bici. Deja el casco puesto salvo que dificulte la respiración, porque mover la cabeza puede empeorar una lesión cervical.',
    },
    category: 'first_aid',
    difficulty: 2,
  },
  {
    id: 'd9f4e0ca-d27c-4fb0-be72-45969f32686f',
    questionText: {
      en: 'An injured rider is unconscious but breathing normally. What should you do while waiting for the ambulance?',
      ro: 'Un ciclist rănit este inconștient, dar respiră normal. Ce faci până vine ambulanța?',
      es: 'Un ciclista herido está inconsciente pero respira con normalidad. ¿Qué haces mientras llega la ambulancia?',
    },
    options: {
      en: [
        'Sit them up and give them water',
        'Call the emergency number, roll them onto their side into the recovery position, and keep checking their breathing',
        'Leave them exactly as they are and stand back',
        'Try to wake them by shaking their shoulders hard',
      ],
      ro: [
        'Îl ridici în șezut și îi dai apă',
        'Suni la numărul de urgență, îl întorci pe o parte în poziția laterală de siguranță și îi verifici constant respirația',
        'Îl lași exact așa cum este și te dai la o parte',
        'Încerci să îl trezești scuturându-l puternic de umeri',
      ],
      es: [
        'Sentarlo y darle agua',
        'Llamar al número de emergencias, girarlo de lado en posición lateral de seguridad y vigilar su respiración',
        'Dejarlo tal cual está y apartarte',
        'Intentar despertarlo sacudiéndolo con fuerza por los hombros',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'An unconscious person lying on their back can choke on their own tongue or vomit. Call the emergency number first, then roll them gently onto their side so the airway stays open, keep them warm, and re-check breathing until help arrives. Never give food or drink to someone who is not fully conscious.',
      ro: 'O persoană inconștientă întinsă pe spate se poate îneca cu propria limbă sau cu vomă. Sună întâi la numărul de urgență, apoi întoarce-o ușor pe o parte, ca să rămână căile respiratorii libere, ține-o la cald și reverifică respirația până sosește ajutorul. Nu da niciodată mâncare sau băutură unei persoane care nu este pe deplin conștientă.',
      es: 'Una persona inconsciente boca arriba puede asfixiarse con su propia lengua o con el vómito. Llama primero al número de emergencias, después gírala con suavidad de lado para mantener la vía aérea abierta, mantenla abrigada y comprueba la respiración hasta que llegue la ayuda. Nunca des comida ni bebida a alguien que no esté plenamente consciente.',
    },
    category: 'first_aid',
    difficulty: 1,
  },
];
