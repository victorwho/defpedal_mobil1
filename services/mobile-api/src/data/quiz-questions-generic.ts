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
 * from the explanations in all three locales. When editing, keep the rule:
 * if a sentence is only true in SOME countries, it does not belong here.
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
];
