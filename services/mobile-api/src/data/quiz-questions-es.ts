/**
 * Static quiz question pool — Spain content.
 *
 * Multilingual model — see quiz-questions.ts for the full shape contract.
 * The COUNTRY (this file = ES) decides WHICH content (Spanish law, Spanish
 * cities, Reglamento General de Circulación references). The LOCALE decides
 * which LANGUAGE that content is presented in.
 *
 * IDs are FRESH stable UUIDs that do NOT collide with the Romanian pool.
 */

import type { StaticQuizQuestion } from './quiz-questions';

export type { StaticQuizQuestion };

export const QUIZ_QUESTIONS_ES: readonly StaticQuizQuestion[] = [
  // ── Road Safety ──────────────────────────────────────────────────────────
  {
    id: 'a1f2e3d4-c5b6-4a7e-8d9c-0b1a2c3d4e5f',
    questionText: {
      en: 'What is the legal minimum passing distance for cars overtaking cyclists in Spain?',
      ro: 'Care este distanța minimă legală pe care un autovehicul trebuie să o lase la depășirea unui biciclist în Spania?',
      es: '¿Cuál es la distancia legal mínima que un coche debe dejar al adelantar a un ciclista en España?',
    },
    options: {
      en: ['0.5 meters', '1 meter', '1.5 meters', '3 meters'],
      ro: ['0,5 metri', '1 metru', '1,5 metri', '3 metri'],
      es: ['0,5 metros', '1 metro', '1,5 metros', '3 metros'],
    },
    correctIndex: 2,
    explanation: {
      en: 'The Reglamento General de Circulación (Art. 35) requires drivers to leave at least 1.5 meters of lateral space when overtaking a cyclist. Drivers must also reduce their speed by 20 km/h below the posted limit while passing. Violations carry fines of €200 and 4 license points.',
      ro: 'Reglamento General de Circulación (Art. 35) obligă șoferii să lase cel puțin 1,5 metri lateral la depășirea unui biciclist. Trebuie să reducă viteza cu 20 km/h sub limita semnalizată în timpul manevrei. Amenzile sunt de 200 € și 4 puncte de penalizare.',
      es: 'El Reglamento General de Circulación (Art. 35) exige al conductor dejar al menos 1,5 metros laterales al adelantar a un ciclista. Además debe reducir su velocidad 20 km/h por debajo del límite señalizado durante el adelantamiento. Infracciones: 200 € de multa y 4 puntos del carnet.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'b2e3d4c5-b6a7-4f8e-9d0c-1a2b3c4d5e6f',
    questionText: {
      en: 'What should you do at a red light on your bicycle in Spain?',
      ro: 'Ce trebuie să faci la semafor pe roșu, pe bicicletă, în Spania?',
      es: '¿Qué debes hacer en un semáforo en rojo cuando vas en bici en España?',
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
      en: 'Under the Reglamento General de Circulación, cyclists are vehicle users and must obey traffic signals. Running a red light carries a fine of up to €200 and is one of the leading causes of cyclist–vehicle collisions at intersections.',
      ro: 'Conform Reglamento General de Circulación, cicliștii sunt utilizatori de vehicule și trebuie să respecte semnalele de circulație. Trecerea pe roșu se sancționează cu amendă de până la 200 € și este una dintre principalele cauze ale coliziunilor ciclist-vehicul în intersecții.',
      es: 'Según el Reglamento General de Circulación, los ciclistas son usuarios de vehículos y deben obedecer las señales luminosas. Saltarse un rojo conlleva una multa de hasta 200 € y es una de las principales causas de colisiones entre ciclistas y vehículos en cruces.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'c3d4e5f6-a7b8-4c9d-8e0f-2b3c4d5e6f70',
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
      en: 'Looking 3-4 seconds ahead gives you time to react to hazards, potholes, and traffic changes. Scanning further improves your safety significantly, especially on busy avenues in Madrid or Barcelona.',
      ro: 'Privirea la 3-4 secunde în față îți dă timp să reacționezi la pericole, gropi și schimbări de trafic. Scanarea pe distanță îmbunătățește semnificativ siguranța, mai ales pe bulevardele aglomerate din Madrid sau Barcelona.',
      es: 'Mirar 3-4 segundos por delante te da tiempo de reaccionar ante peligros, baches y cambios de tráfico. Ampliar la vista mejora mucho tu seguridad, sobre todo en avenidas concurridas de Madrid o Barcelona.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'd4e5f6a7-b8c9-4d0e-9f1a-3c4d5e6f7081',
    questionText: {
      en: 'When cycling at night in Spain, what lights are legally required?',
      ro: 'Pe timp de noapte în Spania, ce lumini sunt obligatorii pentru bicicletă?',
      es: 'Para pedalear de noche en España, ¿qué luces son obligatorias por ley?',
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
      en: 'Spanish law requires a white front light and a red rear light at night or in poor visibility. Reflectors on pedals and wheels are also mandatory, and a reflective vest or other reflective clothing must be worn at night or in low-light conditions, including in urban areas.',
      ro: 'Legea spaniolă cere lumină albă în față și lumină roșie în spate pe timp de noapte sau cu vizibilitate redusă. Sunt obligatorii și catadioptrii pe pedale și roți, iar vesta sau altă haină reflectorizantă trebuie purtată noaptea sau cu lumină redusă, inclusiv în zonele urbane.',
      es: 'La normativa española exige luz blanca delantera y luz roja trasera de noche o con poca visibilidad. También son obligatorios catadióptricos en pedales y ruedas, y un chaleco reflectante u otra prenda reflectante de noche o en condiciones de baja luminosidad, incluso en zona urbana.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'e5f6a7b8-c9d0-4e1f-a02b-4d5e6f708192',
    questionText: {
      en: 'What should you do when approaching a roundabout (rotonda) on a bicycle in Spain?',
      ro: 'Ce ar trebui să faci la apropierea de un sens giratoriu (rotonda) pe bicicletă în Spania?',
      es: 'Al acercarte a una rotonda en bicicleta en España, ¿qué debes hacer?',
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
        'Cedezi trecerea vehiculelor deja aflate în sensul giratoriu',
        'Cobori întotdeauna și mergi pe jos',
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
      en: 'Cyclists must yield to traffic already in the rotonda, just like cars. Take the lane confidently rather than hugging the outside — Spanish drivers expect a vehicle taking the lane and giving way at entry, then exiting with a clear arm signal.',
      ro: 'Ciclistul trebuie să cedeze trecerea vehiculelor deja aflate în rotonda, la fel ca o mașină. Ocupă banda cu încredere în loc să te lipești de exterior — șoferii spanioli se așteaptă la un vehicul care ocupă banda și cedează la intrare, ieșind cu semnal clar din braț.',
      es: 'El ciclista debe ceder el paso a los vehículos que ya están en la rotonda, igual que un coche. Toma el carril con seguridad en lugar de pegarte al exterior — los conductores españoles esperan a un vehículo que ocupe el carril, ceda al entrar y salga señalizando con el brazo.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'f6a7b8c9-d0e1-4f2a-b13c-5e6f70819203',
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
      en: 'Extend your left arm straight out to signal a left turn. Signal well before the turn so drivers can anticipate your movement. Arm signals are required by the Reglamento General de Circulación.',
      ro: 'Întinde brațul stâng drept lateral pentru a semnaliza virajul la stânga. Semnalizează cu mult înainte de viraj ca șoferii să anticipeze mișcarea. Semnalizarea cu brațul este cerută de Reglamento General de Circulación.',
      es: 'Extiende el brazo izquierdo recto para señalizar un giro a la izquierda. Hazlo con tiempo antes del giro para que los conductores puedan anticipar tu maniobra. La señalización con el brazo es obligatoria según el Reglamento General de Circulación.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'a7b8c9d0-e1f2-4a3b-c24d-6f7081920314',
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
      en: 'The door zone extends about 1.5 meters from parked cars. Dooring is one of the most common urban cycling accidents in Spanish cities, where on-street parking sits right next to the carriageway. Always ride outside this zone.',
      ro: 'Zona portierei se întinde pe aproximativ 1,5 metri de la mașinile parcate. Deschiderea portierei („dooring”) este unul dintre cele mai frecvente accidente urbane în orașele spaniole, unde parcarea în linie este lipită de carosabil. Mergi mereu în afara acestei zone.',
      es: 'La zona de puerta se extiende aproximadamente 1,5 metros desde los coches aparcados. El "dooring" es uno de los accidentes urbanos más comunes en ciudades españolas, donde el aparcamiento en línea está pegado a la calzada. Circula siempre fuera de esta zona.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'b8c9d0e1-f2a3-4b4c-d35e-708192031425',
    questionText: {
      en: 'What is the safest position for a cyclist on a road without bike lanes in Spain?',
      ro: 'Care este poziția cea mai sigură pentru ciclist pe o stradă fără pistă de biciclete în Spania?',
      es: 'En una carretera sin carril bici en España, ¿cuál es la posición más segura para el ciclista?',
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
      en: 'Riding in the center of the lane makes you more visible and prevents dangerous close passes. The Reglamento General de Circulación explicitly allows cyclists to ride two abreast and to take the lane when the right edge is unsafe.',
      ro: 'Mergând pe centrul benzii devii mai vizibil și eviți depășirile periculoase. Reglamento General de Circulación permite expres ciclistului să circule două la rând și să ocupe banda când marginea din dreapta nu e sigură.',
      es: 'Circular en el centro del carril te hace más visible y evita adelantamientos peligrosos. El Reglamento General de Circulación permite expresamente a los ciclistas circular en paralelo de dos en dos y ocupar el carril cuando el borde derecho no es seguro.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'c9d0e1f2-a3b4-4c5d-e46f-819203142536',
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
      en: 'The ABC check: Air (tire pressure), Brakes (both working), Chain (lubed and not loose). Takes 30 seconds and prevents most mechanical failures — particularly relevant in Spanish summer heat, which accelerates tire pressure changes.',
      ro: 'Verificarea ABC: Aer (presiune), Brakes/Frâne (ambele funcționează), Cadrul/Lanț (uns și fără joc). Durează 30 de secunde și previne majoritatea defecțiunilor — în special relevant pe căldura verilor spaniole, care accelerează schimbările de presiune în cauciucuri.',
      es: 'La revisión ABC: Aire (presión de neumáticos), Brakes/Frenos (que ambos funcionen), Cadena (lubricada y sin holgura). Te lleva 30 segundos y previene la mayoría de fallos mecánicos — sobre todo en el calor estival español, que altera la presión de los neumáticos.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'd0e1f2a3-b4c5-4d6e-f570-920314253647',
    questionText: {
      en: 'Are cyclists in Spain allowed to ride on the sidewalk (acera)?',
      ro: 'Au voie cicliștii din Spania să circule pe trotuar (acera)?',
      es: '¿Pueden los ciclistas circular por la acera en España?',
    },
    options: {
      en: [
        'Yes, always',
        'No — sidewalk cycling is generally prohibited unless explicitly signposted, with limited exceptions for children',
        'Yes, if you ride at walking speed',
        'Only in parks',
      ],
      ro: [
        'Da, oricând',
        'Nu — circulația pe trotuar este în general interzisă, cu excepții limitate pentru copii sub supraveghere',
        'Da, dacă mergi cu viteza pasului',
        'Doar în parcuri',
      ],
      es: [
        'Sí, siempre',
        'No — circular por la acera está prohibido salvo señalización expresa, con excepciones limitadas para menores',
        'Sí, si vas a velocidad de paseo',
        'Solo en parques',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Spanish law prohibits cycling on sidewalks and pedestrian-only areas unless they are specifically signposted as shared. Children under 14 may ride on sidewalks under adult supervision. Adults cycling on a regular acera risk a fine of €100–€200.',
      ro: 'Legea spaniolă interzice mersul pe bicicletă pe trotuar și în zone exclusiv pietonale, dacă nu sunt expres semnalizate ca uz comun. Copiii sub 14 ani pot pedala pe trotuar sub supravegherea unui adult. Adulții care circulă pe o acera obișnuită riscă o amendă de 100-200 €.',
      es: 'La ley española prohíbe circular en bici por aceras y zonas peatonales salvo que estén señalizadas como uso compartido. Los menores de 14 años sí pueden hacerlo bajo supervisión de un adulto. Un adulto en bici sobre una acera normal se arriesga a una multa de 100-200 €.',
    },
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: 'e1f2a3b4-c5d6-4e7f-0681-a30425364758',
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
      en: 'Stopping and using your bike as a barrier is the safest approach. Most dogs stop chasing once you stop moving. Speak calmly and avoid eye contact. This matters on rural roads in regions like Extremadura, Castilla-La Mancha and parts of Andalucía where loose farm dogs can be encountered.',
      ro: 'Cea mai sigură variantă este să te oprești și să folosești bicicleta ca barieră. Majoritatea câinilor încetează urmărirea când nu mai te miști. Vorbește calm și evită contactul vizual. Contează pe drumurile rurale din Extremadura, Castilla-La Mancha și părți din Andalucía, unde poți întâlni câini de fermă liberi.',
      es: 'Parar y usar la bici como barrera es lo más seguro. La mayoría de perros dejan de perseguir cuando dejas de moverte. Habla en tono calmado y evita el contacto visual. Esto importa en carreteras rurales de Extremadura, Castilla-La Mancha y partes de Andalucía, donde puedes encontrar perros sueltos de fincas.',
    },
    category: 'road_safety',
    difficulty: 2,
  },

  // ── Risk Awareness ───────────────────────────────────────────────────────
  {
    id: 'f2a3b4c5-d6e7-4f8a-1792-b40536475869',
    questionText: {
      en: 'Which type of road has the lowest cycling accident rate?',
      ro: 'Ce tip de drum are cea mai mică rată de accidente pentru cicliști?',
      es: '¿Qué tipo de vía tiene la menor tasa de accidentes en bici?',
    },
    options: {
      en: [
        'Multi-lane highways',
        'Residential streets with speed limits of 30 km/h or below',
        'Roads with painted bike lanes',
        'One-way streets',
      ],
      ro: [
        'Autostrăzi cu mai multe benzi',
        'Străzi rezidențiale cu limită de 30 km/h sau mai mică',
        'Drumuri cu pistă pictată',
        'Străzi cu sens unic',
      ],
      es: [
        'Autovías de varios carriles',
        'Calles residenciales con límite de 30 km/h o menor',
        'Calles con carril bici pintado',
        'Calles de un solo sentido',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Low-speed residential streets — including Spain’s "Zonas 30" and "Ciudad 30" rollouts in Madrid, Barcelona, Bilbao, Pontevedra and many others — have the lowest accident rates for cyclists. Speed is the strongest predictor of accident severity.',
      ro: 'Străzile rezidențiale cu viteză redusă — inclusiv „Zonas 30” și implementările „Ciudad 30” din Madrid, Barcelona, Bilbao, Pontevedra și multe altele — au cea mai mică rată de accidente pentru cicliști. Viteza este cel mai puternic factor al gravității unui accident.',
      es: 'Las calles residenciales con velocidad reducida — incluidas las "Zonas 30" y la "Ciudad 30" que están desplegando Madrid, Barcelona, Bilbao, Pontevedra y muchas más — tienen la menor tasa de accidentes para ciclistas. La velocidad es el mayor predictor de gravedad en un siniestro.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: 'a3b4c5d6-e7f8-4a9b-28a3-c5064758697a',
    questionText: {
      en: 'Why are large vehicles (trucks, buses) especially dangerous for cyclists?',
      ro: 'De ce sunt vehiculele mari (camioane, autobuze) deosebit de periculoase pentru cicliști?',
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
        'Blochează vederea semaforului',
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
      en: 'Large vehicles have extensive blind spots on all sides and their rear wheels track inside the front wheels during turns, creating a deadly crush zone. Stay well behind a turning bus or truck — never alongside.',
      ro: 'Vehiculele mari au unghiuri moarte ample pe toate laturile, iar roțile din spate trec pe interiorul celor din față la viraj, creând o zonă de strivire mortală. Stai bine în spatele unui autobuz sau camion care virează — niciodată lângă el.',
      es: 'Los vehículos grandes tienen ángulos muertos enormes en todos los costados y sus ruedas traseras trazan por dentro al girar, creando una zona de aplastamiento mortal. Quédate bien detrás de un camión o autobús que va a girar — nunca a su lado.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: 'b4c5d6e7-f8a9-4b0c-39b4-d6075869708b',
    questionText: {
      en: 'Which surface is most slippery for cyclists when wet?',
      ro: 'Ce suprafață devine cea mai alunecoasă pentru cicliști când e udă?',
      es: '¿Qué superficie es más resbaladiza para los ciclistas cuando está mojada?',
    },
    options: {
      en: ['Asphalt', 'Concrete', 'Metal grates, manhole covers, and tram tracks', 'Brick'],
      ro: ['Asfalt', 'Beton', 'Grătare metalice, capace de canalizare și șine de tramvai', 'Cărămidă'],
      es: ['Asfalto', 'Hormigón', 'Rejillas metálicas, tapas de alcantarilla y raíles del tranvía', 'Adoquín'],
    },
    correctIndex: 2,
    explanation: {
      en: 'Metal surfaces become extremely slippery when wet. In Spanish cities with trams — Barcelona, Bilbao, Valencia, Zaragoza, Sevilla and Murcia — always cross tram tracks at a right angle and never ride along them.',
      ro: 'Suprafețele metalice devin extrem de alunecoase pe ploaie. În orașe spaniole cu tramvai — Barcelona, Bilbao, Valencia, Zaragoza, Sevilla, Murcia — traversează șinele mereu în unghi drept și nu pedala niciodată de-a lungul lor.',
      es: 'Las superficies metálicas se vuelven extremadamente resbaladizas con agua. En ciudades españolas con tranvía — Barcelona, Bilbao, Valencia, Zaragoza, Sevilla y Murcia — cruza siempre los raíles en ángulo recto y nunca circules sobre ellos.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'c5d6e7f8-a9b0-4c1d-4ac5-e708697081ac',
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
      en: 'Studies show wet roads increase cycling accident risk by approximately 70% due to reduced traction and longer braking distances. In Spain, the first rain after a long dry spell — common in summer — is especially treacherous because oil residue surfaces on the asphalt.',
      ro: 'Studiile arată că drumul ud crește riscul de accident al ciclistului cu aproximativ 70% din cauza aderenței reduse și a distanțelor de frânare mai mari. În Spania, prima ploaie după o secetă lungă — frecventă vara — e foarte periculoasă pentru că reziduurile de ulei urcă la suprafața asfaltului.',
      es: 'Los estudios muestran que la calzada mojada incrementa el riesgo de accidente ciclista en torno a un 70% por la menor adherencia y mayor distancia de frenado. En España, la primera lluvia tras una sequía larga — común en verano — es especialmente traicionera porque emerge una capa de residuos oleosos sobre el asfalto.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'd6e7f8a9-b0c1-4d2e-5bd6-f8197a8192bd',
    questionText: {
      en: 'When is the most dangerous time of day for cycling?',
      ro: 'Care e cel mai periculos moment al zilei pentru pedalat?',
      es: '¿Qué momento del día es el más peligroso para pedalear?',
    },
    options: {
      en: [
        'Early morning (6-8 AM)',
        'Midday (12-2 PM)',
        'Evening rush hour (5-8 PM)',
        'Late night (10 PM-12 AM)',
      ],
      ro: [
        'Devreme dimineața (6-8)',
        'La amiază (12-14)',
        'Orele de vârf de seară (17-20)',
        'Noaptea târziu (22-00)',
      ],
      es: [
        'Primera hora (6-8 h)',
        'Mediodía (12-14 h)',
        'Hora punta de tarde (17-20 h)',
        'Noche cerrada (22-00 h)',
      ],
    },
    correctIndex: 2,
    explanation: {
      en: 'Evening rush hour combines heavy traffic, tired drivers, changing light conditions, and sun glare — making it the highest-risk period for cyclists. In Spain, summer evening rides also overlap with the strong low-angle sunset light that blinds westbound drivers.',
      ro: 'Orele de vârf de seară combină trafic dens, șoferi obosiți, schimbări de lumină și soare orbitor — făcând-o perioada cu cel mai mare risc pentru cicliști. În Spania, ieșirile estivale de seară coincid și cu lumina puternică de apus la unghi mic care îi orbește pe șoferii care merg spre vest.',
      es: 'La hora punta de tarde combina tráfico denso, conductores cansados, cambios de luz y deslumbramiento solar — la franja con más riesgo para ciclistas. En España, las salidas estivales de tarde coinciden además con un sol bajo intenso que ciega a quien circula hacia el oeste.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'e7f8a9b0-c1d2-4e3f-6ce7-08208b9203ce',
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
      en: 'Approximately 60% of cycling fatalities involve head injuries. Wearing a helmet reduces the risk of serious head injury by up to 70%. In Spain, helmets are legally required for ALL cyclists outside urban areas, and for under-16s everywhere.',
      ro: 'Aproximativ 60% dintre decesele ciclistice implică traumatisme craniene. Casca reduce riscul de leziune gravă cu până la 70%. În Spania, casca este obligatorie pentru TOȚI cicliștii în afara zonelor urbane și pentru minorii sub 16 ani peste tot.',
      es: 'Aproximadamente el 60% de los fallecimientos ciclistas implican lesiones craneales. Llevar casco reduce el riesgo de lesión craneal grave hasta un 70%. En España el casco es obligatorio para TODOS los ciclistas fuera de zona urbana y para los menores de 16 años en cualquier lugar.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'f8a9b0c1-d2e3-4f4a-7df8-19319ca314df',
    questionText: {
      en: 'How does wind affect cycling safety in Spain?',
      ro: 'Cum afectează vântul siguranța la pedalat în Spania?',
      es: '¿Cómo afecta el viento a la seguridad en bici en España?',
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
        'Rafale laterale puternice te pot împinge în trafic sau în afara drumului',
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
      en: 'Crosswinds above 30 km/h can destabilize cyclists, especially on exposed coastal roads. Spain has several wind hotspots — Tarifa (Levante / Poniente winds), the Cantabrian coast, and Aragón’s Cierzo corridor — where gusts can be severe. Adjust your grip and lean into the wind.',
      ro: 'Rafalele laterale peste 30 km/h pot destabiliza ciclistul, mai ales pe drumuri costiere expuse. Spania are mai multe puncte ferbinți — Tarifa (Levante / Poniente), coasta cantabrică și culoarul Cierzo din Aragón — unde rafalele pot fi severe. Ajustează priza pe ghidon și înclină-te ușor împotriva vântului.',
      es: 'El viento lateral por encima de 30 km/h desestabiliza al ciclista, sobre todo en carreteras costeras expuestas. España tiene varios puntos calientes — Tarifa (Levante / Poniente), la cornisa cantábrica y el corredor del Cierzo en Aragón — con rachas severas. Ajusta el agarre del manillar e inclínate ligeramente hacia el viento.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },

  // ── Infrastructure ───────────────────────────────────────────────────────
  {
    id: 'a9b0c1d2-e3f4-4a5b-8e09-2a42ad425ae0',
    questionText: {
      en: 'What does a green bike box (ciclocaja) at an intersection mean?',
      ro: 'Ce înseamnă o „ciclocaja” verde la o intersecție în Spania?',
      es: '¿Qué es una "ciclocaja" verde en un cruce?',
    },
    options: {
      en: [
        'Bikes must stop here',
        'An advanced stop area where cyclists wait ahead of cars at a red light',
        'A bike repair station',
        'A bike sharing dock',
      ],
      ro: [
        'Cicliștii trebuie să se oprească aici',
        'O zonă de oprire avansată unde cicliștii așteaptă în fața mașinilor la roșu',
        'O stație de reparație',
        'O stație de bike-sharing',
      ],
      es: [
        'Las bicis deben pararse aquí',
        'Un área de detención avanzada donde los ciclistas esperan delante de los coches en un semáforo en rojo',
        'Una estación de reparación de bicis',
        'Un punto de bicis públicas',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'A "ciclocaja" or bike box is a designated area at the head of a traffic lane that provides cyclists a safe and visible way to wait ahead of queuing traffic. Common in Spanish cities investing in carril bici networks, including Madrid, Barcelona and Sevilla.',
      ro: 'O „ciclocaja” sau cutie pentru biciclete este o zonă marcată la capul benzii de circulație care permite ciclistului să aștepte în siguranță și vizibil în fața traficului. Frecventă în orașe spaniole care extind rețelele de carril bici, inclusiv Madrid, Barcelona și Sevilla.',
      es: 'Una "ciclocaja" o caja bici es un área señalizada al inicio de un carril que permite a los ciclistas esperar de forma segura y visible por delante de la cola de tráfico. Es habitual en ciudades españolas que están ampliando su red de carriles bici, incluyendo Madrid, Barcelona y Sevilla.',
    },
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'b0c1d2e3-f4a5-4b6c-9f1a-3b53be536bf1',
    questionText: {
      en: 'What is the purpose of a bike lane buffer zone on a carril bici?',
      ro: 'La ce folosește zona-tampon a unui carril bici în Spania?',
      es: '¿Para qué sirve la zona de protección (buffer) de un carril bici?',
    },
    options: {
      en: [
        'Extra space for parking',
        'A painted or physical area separating the bike lane from vehicle traffic',
        'A waiting area for pedestrians',
        'Space for street furniture',
      ],
      ro: [
        'Spațiu suplimentar pentru parcare',
        'O zonă pictată sau fizică ce separă pista de banda de circulație',
        'Zonă de așteptare pentru pietoni',
        'Spațiu pentru mobilier stradal',
      ],
      es: [
        'Espacio extra para aparcar',
        'Una franja pintada o física que separa el carril bici del tráfico motorizado',
        'Zona de espera para peatones',
        'Espacio para mobiliario urbano',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Buffer zones provide additional separation between cyclists and motor vehicles, reducing the risk of sideswipe collisions and dooring incidents. Sevilla’s award-winning network and Barcelona’s newer carrils bici both rely heavily on buffer zones.',
      ro: 'Zonele-tampon adaugă separare între cicliști și vehiculele motorizate, reducând riscul de coliziune laterală și de dooring. Rețeaua premiată din Sevilla și noile carrils bici din Barcelona se bazează masiv pe astfel de zone.',
      es: 'Las zonas de protección añaden separación entre ciclistas y vehículos, reduciendo el riesgo de colisión por roce lateral y de "dooring". La premiada red de Sevilla y los carriles bici más recientes de Barcelona dependen en gran medida de estos buffers.',
    },
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'c1d2e3f4-a5b6-4c7d-a02b-4c64cf647c02',
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
        'Bajándose y cruzando a pie con la bici',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Tram tracks can trap a bicycle wheel if crossed at a shallow angle, causing an instant crash. Always cross at a right angle. This is critical in Spanish cities with active tram systems — Bilbao, Valencia, Barcelona, Zaragoza, Sevilla and Murcia — where tram lines share the road with cyclists.',
      ro: 'Șinele de tramvai pot prinde roata bicicletei dacă le traversezi sub un unghi mic, provocând o căzătură instantanee. Traversează mereu în unghi drept. Critic în orașele spaniole cu rețea activă de tramvai — Bilbao, Valencia, Barcelona, Zaragoza, Sevilla și Murcia — unde liniile împart carosabilul cu cicliștii.',
      es: 'Los raíles del tranvía pueden atrapar la rueda de la bici si los cruzas en ángulo bajo, provocando una caída inmediata. Cruza siempre en ángulo recto. Es crítico en las ciudades españolas con tranvía en activo — Bilbao, Valencia, Barcelona, Zaragoza, Sevilla y Murcia — donde las líneas comparten calzada con los ciclistas.',
    },
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'd2e3f4a5-b6c7-4d8e-b13c-5d75d0758d13',
    questionText: {
      en: 'What is a contraflow bike lane (carril bici a contracorriente)?',
      ro: 'Ce este un carril bici a contracorriente în Spania?',
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
      en: 'Contraflow bike lanes allow cyclists to ride in the opposite direction on one-way streets, providing shorter and more direct routes. Madrid and Barcelona have introduced many of these in their historic centres to enable safer cycling routes through narrow streets.',
      ro: 'Pistele în contrasens permit ciclistului să circule în direcția opusă pe străzile cu sens unic, oferind trasee mai scurte și directe. Madrid și Barcelona au amenajat multe astfel de piste în centrele istorice ca să permită trasee mai sigure pe străzile înguste.',
      es: 'Los carriles bici a contracorriente permiten a los ciclistas circular en sentido opuesto en calles de sentido único, ofreciendo rutas más cortas y directas. Madrid y Barcelona han implantado muchos en sus cascos históricos para facilitar trayectos ciclistas más seguros por calles estrechas.',
    },
    category: 'infrastructure',
    difficulty: 2,
  },
  {
    id: 'e3f4a5b6-c7d8-4e9f-c24d-6e86e1869e24',
    questionText: {
      en: 'What is a protected intersection?',
      ro: 'Ce este o intersecție protejată?',
      es: '¿Qué es un cruce protegido?',
    },
    options: {
      en: [
        'An intersection with traffic police',
        'A design that physically separates cyclists from turning vehicles using corner refuge islands',
        'An intersection with no traffic lights',
        'A pedestrian-only crossing',
      ],
      ro: [
        'O intersecție cu agent de circulație',
        'Un design care separă fizic cicliștii de vehiculele care virează folosind insule de refugiu în colț',
        'O intersecție fără semafor',
        'O trecere doar pentru pietoni',
      ],
      es: [
        'Un cruce con presencia policial',
        'Un diseño que separa físicamente a ciclistas y vehículos que giran mediante isletas en las esquinas',
        'Un cruce sin semáforos',
        'Un paso peatonal',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Protected intersections use corner refuge islands, setback crossings, and forward queuing areas to keep cyclists safe from turning vehicles. Vitoria-Gasteiz, Sevilla and pilot sites in Barcelona have introduced them as part of their cycling infrastructure modernisation.',
      ro: 'Intersecțiile protejate folosesc insule de refugiu în colț, treceri retrase și zone de așteptare avansate ca să-i protejeze pe cicliști de vehiculele care virează. Vitoria-Gasteiz, Sevilla și locații pilot din Barcelona le-au introdus ca parte din modernizarea infrastructurii ciclistice.',
      es: 'Los cruces protegidos usan isletas en las esquinas, pasos retranqueados y zonas de espera avanzadas para mantener a los ciclistas a salvo de los vehículos que giran. Vitoria-Gasteiz, Sevilla y proyectos piloto en Barcelona los han incorporado como parte de la modernización de su infraestructura ciclista.',
    },
    category: 'infrastructure',
    difficulty: 3,
  },

  // ── First Aid ────────────────────────────────────────────────────────────
  {
    id: 'f4a5b6c7-d8e9-4f0a-d35e-7f97f297af35',
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
      en: 'Riding on a flat tire damages the rim and is unstable. Pull over safely off the road or into a wide shoulder, then either fix the tube or call for help.',
      ro: 'Pedalatul cu o cameră spartă strică janta și e instabil. Trage pe dreapta sau pe un acostament larg în siguranță, apoi repară camera sau cere ajutor.',
      es: 'Rodar con un pinchazo daña la llanta y es inestable. Sal de la calzada hacia un arcén amplio o lugar seguro y, ya allí, repara la cámara o pide ayuda.',
    },
    category: 'first_aid',
    difficulty: 1,
  },
  {
    id: 'a5b6c7d8-e9f0-4a1b-e46f-80a8030bb046',
    questionText: {
      en: 'What is the first thing you should do if you witness a cycling accident in Spain?',
      ro: 'Care este primul lucru pe care îl faci dacă ești martor la un accident ciclistic în Spania?',
      es: 'Si presencias un accidente ciclista en España, ¿qué es lo primero que debes hacer?',
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
      en: 'Call 112 — the EU-wide emergency number — immediately. Do not move the injured person unless they are in immediate danger (e.g., in traffic). Keep them warm and calm until the ambulance arrives. 112 in Spain reaches police, ambulance, Guardia Civil and fire services.',
      ro: 'Sună imediat la 112 — numărul unic european de urgență. Nu muta persoana rănită decât dacă este în pericol imediat (de exemplu, în trafic). Ține-o caldă și calmă până la sosirea ambulanței. În Spania, 112 coordonează poliția, ambulanța, Guardia Civil și pompierii.',
      es: 'Llama al 112 — el número europeo único de emergencias — de inmediato. No muevas a la persona herida salvo que haya peligro inmediato (por ejemplo, dentro de la calzada). Mantenla abrigada y tranquila hasta que llegue la ambulancia. El 112 en España coordina policía, ambulancia, Guardia Civil y bomberos.',
    },
    category: 'first_aid',
    difficulty: 1,
  },

  // ── Spanish Law ──────────────────────────────────────────────────────────
  {
    id: 'b6c7d8e9-f0a1-4b2c-f570-91b9141cc157',
    questionText: {
      en: 'Are helmets mandatory for cyclists in Spain?',
      ro: 'Este casca obligatorie pentru cicliști în Spania?',
      es: '¿Es obligatorio el casco para ciclistas en España?',
    },
    options: {
      en: [
        'No, never required',
        'Mandatory only for cyclists under 16 years of age, everywhere they ride',
        'Mandatory for ALL cyclists outside urban areas, and for under-16s everywhere',
        'Mandatory for all cyclists at all times',
      ],
      ro: [
        'Nu, niciodată',
        'Doar pentru cicliștii sub 16 ani, oriunde merg',
        'Obligatorie pentru TOȚI cicliștii în afara zonelor urbane și pentru minorii sub 16 ani peste tot',
        'Obligatorie pentru toți cicliștii tot timpul',
      ],
      es: [
        'No, nunca es obligatorio',
        'Solo para ciclistas menores de 16 años, en cualquier sitio',
        'Obligatorio para TODOS los ciclistas fuera de zona urbana y para menores de 16 años en cualquier lugar',
        'Obligatorio para todos los ciclistas en todo momento',
      ],
    },
    correctIndex: 2,
    explanation: {
      en: 'The Reglamento General de Circulación makes helmets compulsory for ALL cyclists on interurban roads (outside cities), and for ALL cyclists under 16 years old whether inside or outside urban areas. Exceptions exist for extreme heat or long uphill climbs, and the rule does not apply to competitive cycling events.',
      ro: 'Reglamento General de Circulación impune casca pentru TOȚI cicliștii pe drumurile interurbane (în afara orașelor) și pentru TOȚI minorii sub 16 ani, indiferent dacă sunt în interiorul sau în afara zonelor urbane. Există excepții pentru căldură extremă sau urcări lungi, iar regula nu se aplică la competițiile ciclistice.',
      es: 'El Reglamento General de Circulación impone el casco para TODOS los ciclistas en vías interurbanas (fuera de ciudad), y para TODOS los menores de 16 años, dentro o fuera de zona urbana. Existen excepciones por calor extremo o ascensos prolongados, y no aplica a competiciones ciclistas.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'c7d8e9f0-a1b2-4c3d-0681-a2ca252dd268',
    questionText: {
      en: 'Is it legal to use your phone while cycling in Spain?',
      ro: 'Este legal să folosești telefonul în mână în timp ce pedalezi în Spania?',
      es: '¿Es legal usar el móvil mientras pedaleas en España?',
    },
    options: {
      en: [
        'Yes, if you use one hand',
        'No — handheld phones, hands-free devices, headphones, and earbuds are all prohibited',
        'Only for navigation apps',
        'Only with a Bluetooth earpiece',
      ],
      ro: [
        'Da, dacă îl ții cu o singură mână',
        'Nu — telefonul în mână, dispozitivele mâini libere, căștile și airpods-urile sunt toate interzise',
        'Doar pentru aplicații de navigație',
        'Doar cu o cască Bluetooth',
      ],
      es: [
        'Sí, si lo sostienes con una mano',
        'No — están prohibidos el móvil en mano, los dispositivos manos libres, los auriculares y los cascos audífono',
        'Solo para apps de navegación',
        'Solo con un manos libres por Bluetooth',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Spanish law is stricter than most: cyclists may not use a handheld phone, AND may not wear headphones or earbuds. Fines reach €200. Use a silent handlebar mount for navigation and pull over to take any call.',
      ro: 'Legea spaniolă e mai strictă decât în majoritatea țărilor: ciclistul nu poate folosi telefonul în mână ȘI nu poate purta căști sau airpods. Amenzile ajung la 200 €. Folosește un suport silențios pe ghidon pentru navigație și oprește-te pentru orice apel.',
      es: 'La ley española es más estricta que en muchos países: el ciclista no puede usar el móvil en la mano, NI llevar auriculares o cascos audífono. Las multas llegan a 200 €. Usa un soporte de manillar silencioso para la navegación y detente para atender cualquier llamada.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'd8e9f0a1-b2c3-4d4e-1792-b3db363ee379',
    questionText: {
      en: 'Can you be fined for cycling under the influence of alcohol in Spain?',
      ro: 'Poți fi amendat pentru pedalat sub influența alcoolului în Spania?',
      es: '¿Pueden multarte por pedalear bajo los efectos del alcohol en España?',
    },
    options: {
      en: [
        'No, alcohol laws only apply to drivers',
        'Yes — cyclists are subject to the same alcohol limits as motorists (0.5 g/L blood, 0.25 mg/L breath)',
        'Only if you cause an accident',
        'Only on the carretera, not on the carril bici',
      ],
      ro: [
        'Nu, normele privind alcoolul se aplică doar șoferilor',
        'Da — cicliștii au aceleași limite ca șoferii (0,5 g/L sânge, 0,25 mg/L aer)',
        'Doar dacă provoci un accident',
        'Doar pe carretera, nu pe carril bici',
      ],
      es: [
        'No, las normas de alcohol solo aplican a conductores de vehículos a motor',
        'Sí — los ciclistas tienen los mismos límites que los conductores (0,5 g/L en sangre, 0,25 mg/L en aire)',
        'Solo si causas un accidente',
        'Solo en carretera, no en carril bici',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'The Reglamento General de Circulación applies to cyclists. The legal limit is 0.5 g/L of alcohol in blood (0.25 mg/L breath) — the same as for car drivers. Exceeding it results in fines of €500–€1,000, and refusing the breathalyser can be treated as a criminal offence.',
      ro: 'Reglamento General de Circulación se aplică și cicliștilor. Limita legală este 0,5 g/L alcool în sânge (0,25 mg/L în aer expirat) — aceeași ca pentru șoferi. Depășirea conduce la amenzi de 500-1.000 €, iar refuzul testării poate fi tratat ca infracțiune penală.',
      es: 'El Reglamento General de Circulación aplica también a los ciclistas. El límite legal es 0,5 g/L de alcohol en sangre (0,25 mg/L en aire espirado) — el mismo que para conductores. Superarlo conlleva multas de 500-1.000 €, y negarse a la prueba puede ser delito penal.',
    },
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: 'e9f0a1b2-c3d4-4e5f-28a3-c4ec474ff48a',
    questionText: {
      en: 'When must a cyclist wear a reflective vest in Spain?',
      ro: 'Când trebuie ciclistul să poarte vestă reflectorizantă în Spania?',
      es: '¿Cuándo debe llevar chaleco reflectante un ciclista en España?',
    },
    options: {
      en: [
        'Always while cycling',
        'At night or in low-visibility conditions — both inside and outside built-up areas',
        'Only on autovías',
        'Reflective vests are not required',
      ],
      ro: [
        'Mereu, când pedalează',
        'Noaptea sau în condiții de vizibilitate redusă — atât în interiorul, cât și în afara zonelor construite',
        'Doar pe autovías',
        'Vesta reflectorizantă nu este obligatorie',
      ],
      es: [
        'Siempre mientras pedalea',
        'De noche o en condiciones de baja visibilidad — tanto dentro como fuera de zona urbana',
        'Solo en autovías',
        'El chaleco no es obligatorio',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Updated Spanish rules require a reflective vest or other reflective garment for cyclists at night or in conditions of reduced visibility — fog, heavy rain, dusk — in urban as well as interurban settings. This is stricter than older rules that only covered rural night riding.',
      ro: 'Normele spaniole actualizate cer vestă sau altă haină reflectorizantă pentru cicliști noaptea sau în vizibilitate redusă — ceață, ploaie intensă, amurg — atât în mediul urban, cât și interurban. Este mai strict decât regulile vechi, care acopereau doar mersul de noapte la țară.',
      es: 'La normativa española actual exige chaleco reflectante u otra prenda reflectante a los ciclistas de noche o en condiciones de baja visibilidad — niebla, lluvia intensa, anochecer — tanto en zona urbana como interurbana. Esto endurece las reglas antiguas, que solo cubrían las salidas nocturnas en carretera.',
    },
    category: 'road_safety',
    difficulty: 2,
  },
  {
    id: 'f0a1b2c3-d4e5-4f6a-39b4-d5fd585005b9',
    questionText: {
      en: 'What is the maximum legal assisted speed for an e-bike (EPAC pedelec) in Spain?',
      ro: 'Care este viteza maximă legală cu asistență pentru o e-bike (EPAC / pedelec) în Spania?',
      es: '¿Cuál es la velocidad máxima legal con asistencia para una bici eléctrica (EPAC / pedelec) en España?',
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
    id: 'a1b2c3d4-e5f6-4a7b-4ac5-e60e6961167a',
    questionText: {
      en: 'May a child legally ride on the sidewalk in Spain?',
      ro: 'Poate un copil să meargă legal pe trotuar cu bicicleta în Spania?',
      es: '¿Puede un menor circular por la acera en bici en España?',
    },
    options: {
      en: [
        'No, never',
        'Yes, children under 14 may ride on sidewalks and pedestrian areas under adult supervision',
        'Only on Sundays',
        'Only in parks',
      ],
      ro: [
        'Nu, niciodată',
        'Da, copiii sub 14 ani pot circula pe trotuare și zone pietonale sub supravegherea unui adult',
        'Doar duminica',
        'Doar în parcuri',
      ],
      es: [
        'No, nunca',
        'Sí, los menores de 14 años pueden hacerlo bajo supervisión de un adulto',
        'Solo los domingos',
        'Solo en parques',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Spanish law allows children under 14 to ride on sidewalks and pedestrian areas, provided they are accompanied by a supervising adult and respect pedestrians (priority and walking pace). Adults must use the carriageway or carril bici.',
      ro: 'Legea spaniolă permite copiilor sub 14 ani să circule pe trotuare și zone pietonale, cu condiția să fie însoțiți de un adult responsabil și să respecte prioritatea pietonilor (cu viteza pasului). Adulții trebuie să folosească carosabilul sau carril bici.',
      es: 'La ley española permite a los menores de 14 años circular por aceras y zonas peatonales, siempre acompañados por un adulto responsable y respetando a los peatones (prioridad y velocidad de paseo). Los adultos deben usar la calzada o el carril bici.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'b2c3d4e5-f6a7-4b8c-5bd6-f71f7a72278b',
    questionText: {
      en: 'As a cyclist in Spain, what must you do at a pedestrian crossing (paso de cebra)?',
      ro: 'Ca biciclist în Spania, ce trebuie să faci la o trecere de pietoni (paso de cebra)?',
      es: 'Como ciclista en España, ¿qué debes hacer en un paso de cebra?',
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
        'Accelerezi ca să treci rapid',
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
      en: 'Spanish traffic rules require cyclists to dismount and walk their bicycle across a pedestrian crossing. Riding through a paso de cebra is treated as a vehicle ignoring pedestrian priority, and is a finable offence.',
      ro: 'Regulile spaniole impun ciclistului să coboare și să treacă pe jos cu bicicleta peste paso de cebra. Trecerea pedalând este tratată ca un vehicul care ignoră prioritatea pietonilor și este sancționabilă.',
      es: 'La normativa de tráfico española exige al ciclista bajarse de la bicicleta y cruzar a pie por el paso de peatones. Cruzar pedaleando se considera un vehículo que ignora la prioridad peatonal y es sancionable.',
    },
    category: 'road_safety',
    difficulty: 1,
  },
  {
    id: 'c3d4e5f6-a7b8-4c9d-6ce7-08208b83389c',
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
      en: 'To signal stopping, raise one arm vertically above your head. This is the internationally recognized stop signal and is required by the Reglamento General de Circulación before slowing or stopping in traffic.',
      ro: 'Pentru a semnaliza oprirea, ridică un braț vertical deasupra capului. Este semnalul de stop recunoscut internațional și este cerut de Reglamento General de Circulación înainte de încetinire sau oprire în trafic.',
      es: 'Para señalizar la detención, levanta un brazo verticalmente sobre la cabeza. Es la señal de parada reconocida internacionalmente y el Reglamento General de Circulación la exige antes de reducir la marcha o detenerse en el tráfico.',
    },
    category: 'road_safety',
    difficulty: 1,
  },

  // ── Spanish Hazards ──────────────────────────────────────────────────────
  {
    id: 'd4e5f6a7-b8c9-4d0e-7df8-19319c9449ad',
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
      en: 'Cobblestone streets, common in Spanish old town centres like Toledo, Córdoba, Granada, Sevilla, Cáceres and Santiago de Compostela, have gaps that can catch narrow road bike tires. Reduce speed, use wider tires if possible, and avoid sharp braking on wet cobblestones — they are extremely slippery after rain.',
      ro: 'Străzile pavate cu piatră cubică, frecvente în centrele istorice spaniole precum Toledo, Córdoba, Granada, Sevilla, Cáceres și Santiago de Compostela, au rosturi care pot prinde cauciucuri subțiri de șosea. Redu viteza, folosește cauciucuri mai late dacă poți și evită frânările bruște pe pavaj ud — sunt extrem de alunecoase după ploaie.',
      es: 'Las calles adoquinadas, frecuentes en cascos históricos españoles como Toledo, Córdoba, Granada, Sevilla, Cáceres y Santiago de Compostela, tienen juntas que pueden atrapar neumáticos finos de bici de carretera. Reduce la velocidad, usa cubiertas más anchas si es posible, y evita frenar de golpe sobre adoquines mojados — son muy resbaladizos tras la lluvia.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: 'e5f6a7b8-c9d0-4e1f-8e09-2a42adaa50be',
    questionText: {
      en: 'Can you cycle on a Spanish autovía or autopista?',
      ro: 'Poți pedala pe o autovía sau autopista din Spania?',
      es: '¿Se puede pedalear por una autovía o autopista española?',
    },
    options: {
      en: [
        'Yes, in the right shoulder',
        'No — cycling is prohibited on most autovías and all autopistas',
        'Only on weekends',
        'Only with a special permit',
      ],
      ro: [
        'Da, pe acostamentul din dreapta',
        'Nu — bicicleta este interzisă pe majoritatea autovías și pe toate autopistas',
        'Doar în weekend',
        'Doar cu un permis special',
      ],
      es: [
        'Sí, por el arcén derecho',
        'No — la bici está prohibida en la mayoría de autovías y en todas las autopistas',
        'Solo los fines de semana',
        'Solo con un permiso especial',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Bicycles are banned from autopistas (toll motorways) and from most autovías (free motorways). Some autovía stretches allow cyclists on the shoulder when no alternative route exists — look for the white circular sign with a red diagonal over a bicycle to confirm the prohibition. Cycling is allowed on N-roads (carreteras nacionales) unless specifically signposted otherwise.',
      ro: 'Bicicletele sunt interzise pe autopistas (autostrăzi cu taxă) și pe majoritatea autovías (autostrăzi gratuite). Unele tronsoane de autovía permit ciclistului pe acostament când nu există rută alternativă — caută indicatorul circular alb cu bară roșie peste o bicicletă pentru a confirma interdicția. Pe carreteras nacionales (drumuri naționale) este permis, dacă nu e semnalizat altfel.',
      es: 'Las bicicletas están prohibidas en las autopistas (de peaje) y en la mayoría de las autovías (gratuitas). Algunos tramos de autovía permiten al ciclista por el arcén cuando no existe ruta alternativa — busca la señal circular blanca con barra roja sobre una bicicleta para confirmar la prohibición. Las carreteras nacionales (N-roads) sí permiten ciclistas, salvo que esté señalizado lo contrario.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: 'f6a7b8c9-d0e1-4f2a-9f1a-3b53beb561cf',
    questionText: {
      en: 'What is the biggest hazard when cycling near parked cars in Spanish cities?',
      ro: 'Care e cel mai mare pericol când pedalezi lângă mașini parcate în orașele spaniole?',
      es: '¿Cuál es el mayor peligro al pedalear cerca de coches aparcados en ciudades españolas?',
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
      en: 'Dooring — a parked car door opening into your path — is one of the most common urban cycling accidents. In Spanish cities where cars often park right next to the road, maintain at least 1 meter of distance from parked vehicles. Scan ahead for occupied driver seats and brake lights.',
      ro: 'Dooring-ul — portiera unei mașini parcate care se deschide pe traseul tău — este unul dintre cele mai frecvente accidente urbane. În orașele spaniole unde mașinile se parchează adesea lipit de carosabil, păstrează cel puțin 1 metru distanță față de vehiculele staționate. Caută înainte scaune ocupate la volan și lumini de frână aprinse.',
      es: 'El "dooring" — la puerta de un coche aparcado que se abre sobre tu trayectoria — es uno de los accidentes urbanos más comunes. En ciudades españolas donde se aparca pegado a la calzada, mantén al menos 1 metro de distancia respecto a los coches estacionados. Escanea por delante buscando asientos de conductor ocupados y luces de freno.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: 'a7b8c9d0-e1f2-4a3b-a02b-4c64cfc672da',
    questionText: {
      en: 'During which season should Spanish cyclists be most cautious about heat-related risks?',
      ro: 'În ce anotimp trebuie cicliștii spanioli să fie cei mai precauți cu riscurile legate de căldură?',
      es: '¿En qué estación deben los ciclistas españoles ser más cautos con los riesgos por calor?',
    },
    options: {
      en: [
        'Winter, because of frost',
        'Summer — heatstroke, dehydration, and afternoon UV peak between 12:00 and 17:00',
        'Autumn only',
        'Heat is never a major issue in Spain',
      ],
      ro: [
        'Iarna, din cauza brumei',
        'Vara — insolație, deshidratare și vârful UV între 12:00 și 17:00',
        'Doar toamna',
        'Căldura nu e niciodată o problemă majoră în Spania',
      ],
      es: [
        'Invierno, por las heladas',
        'Verano — golpe de calor, deshidratación y pico de UV entre las 12:00 y las 17:00',
        'Solo el otoño',
        'El calor nunca es un problema importante en España',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'Spanish summers — especially inland in Andalucía, Extremadura, Castilla and Aragón — regularly exceed 38 °C. Avoid riding between 12:00 and 17:00 when possible, carry at least 750 ml of water per hour, watch for early heatstroke signs (dizziness, no sweating, confusion), and adjust your route to use shaded streets and tree-lined avenues.',
      ro: 'Verile spaniole — mai ales în interiorul țării, în Andalucía, Extremadura, Castilla și Aragón — depășesc frecvent 38 °C. Evită mersul între 12:00 și 17:00 dacă poți, ia cu tine cel puțin 750 ml de apă pe oră, urmărește semnele timpurii de insolație (amețeală, lipsa transpirației, confuzie) și planifică ruta prin străzi umbroase și bulevarde cu copaci.',
      es: 'Los veranos españoles — sobre todo en el interior de Andalucía, Extremadura, Castilla y Aragón — superan con frecuencia los 38 °C. Evita rodar entre las 12:00 y las 17:00 cuando sea posible, lleva al menos 750 ml de agua por hora, vigila los primeros signos de golpe de calor (mareo, ausencia de sudor, confusión) y planifica rutas por calles sombreadas y avenidas arboladas.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'b8c9d0e1-f2a3-4b4c-b13c-5d75d0d783eb',
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
      en: 'EMT buses in Madrid, TMB buses in Barcelona, and city buses elsewhere pull out from stops frequently. The driver may not see you in the mirror. Always assume you are invisible and let the bus merge first — you will catch up at the next stop.',
      ro: 'Autobuzele EMT din Madrid, TMB din Barcelona și cele urbane din restul orașelor pleacă frecvent din stații. Șoferul poate să nu te vadă în oglindă. Presupune mereu că ești invizibil și lasă autobuzul să se reintegreze primul — îl prinzi din urmă la stația următoare.',
      es: 'Los autobuses de la EMT en Madrid, TMB en Barcelona y los urbanos de cualquier ciudad se incorporan desde paradas constantemente. Es posible que el conductor no te vea por el espejo. Asume siempre que eres invisible y deja que el autobús se incorpore primero — lo alcanzarás en la siguiente parada.',
    },
    category: 'risk_awareness',
    difficulty: 1,
  },
  {
    id: 'c9d0e1f2-a3b4-4c5d-c24d-6e86e1e894fc',
    questionText: {
      en: 'What is the right-hook danger at intersections?',
      ro: 'Ce este pericolul „right-hook” într-o intersecție?',
      es: '¿Qué es el peligro de "giro a la derecha" (right-hook) en un cruce?',
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
        'O groapă pe partea dreaptă',
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
      en: 'The right-hook happens when a car overtakes you and immediately turns right, cutting across your path. At intersections, make eye contact with drivers and be ready to brake. This is a leading cause of urban cycling accidents in Spain, particularly where carriles bici sit to the right of the traffic lane.',
      ro: '„Right-hook” se întâmplă când o mașină te depășește și virează imediat la dreapta, tăindu-ți drumul. În intersecții, caută contactul vizual cu șoferii și fii pregătit să frânezi. Este o cauză importantă a accidentelor urbane în Spania, în special unde carril bici este în dreapta benzii de circulație.',
      es: 'El "right-hook" ocurre cuando un coche te adelanta y gira inmediatamente a la derecha, cruzándose en tu trayectoria. En los cruces, busca el contacto visual con los conductores y prepárate para frenar. Es una causa habitual de accidentes ciclistas urbanos en España, sobre todo donde el carril bici queda a la derecha del carril de circulación.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },
  {
    id: 'd0e1f2a3-b4c5-4d6e-d35e-7f97f2f9a50d',
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
        'Afectează doar alergătorii',
        'Poluarea e problemă doar în zone industriale',
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
      en: 'Cyclists breathe deeper and faster than car occupants, inhaling 2-5 times more pollutants. In cities like Madrid (Plaza Elíptica, Marqués de Vadillo) and Barcelona (Eixample) where NO2 and PM levels can spike, prefer routes through parks (Retiro, Casa de Campo, Ciutadella) or side streets, and avoid rush-hour traffic on major boulevards.',
      ro: 'Cicliștii respiră mai adânc și mai rapid decât ocupanții mașinilor și inhalează de 2-5 ori mai mulți poluanți. În orașe precum Madrid (Plaza Elíptica, Marqués de Vadillo) și Barcelona (Eixample), unde NO₂ și particulele cresc brusc, preferă rute prin parcuri (Retiro, Casa de Campo, Ciutadella) sau străzi laterale și evită orele de vârf pe marile bulevarde.',
      es: 'Los ciclistas respiran más profundo y más rápido que los ocupantes de un coche, e inhalan entre 2 y 5 veces más contaminantes. En ciudades como Madrid (Plaza Elíptica, Marqués de Vadillo) o Barcelona (Eixample), donde los niveles de NO₂ y partículas pueden dispararse, prioriza rutas por parques (Retiro, Casa de Campo, Ciutadella) o calles secundarias, y evita las grandes avenidas en hora punta.',
    },
    category: 'risk_awareness',
    difficulty: 2,
  },

  // ── Spanish Infrastructure ───────────────────────────────────────────────
  {
    id: 'e1f2a3b4-c5d6-4e7f-e46f-80a803aab61e',
    questionText: {
      en: 'What should you do when a carril bici in Spain is blocked by a parked car?',
      ro: 'Ce faci când un carril bici din Spania este blocat de o mașină parcată?',
      es: 'Si un carril bici en España está bloqueado por un coche aparcado, ¿qué debes hacer?',
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
      en: 'Carril bici blockage by delivery vehicles or illegally parked cars is common in Spanish cities. Check over your shoulder, signal with your arm, merge safely into the traffic lane, pass the obstacle, and return to the carril bici. Never squeeze into a gap between a car and the curb — that’s the door zone.',
      ro: 'Blocarea unui carril bici de vehicule de livrare sau mașini parcate ilegal e frecventă în orașele spaniole. Privește peste umăr, semnalizează cu brațul, intră în siguranță în banda de circulație, depășește obstacolul și revino în carril bici. Nu te strecura niciodată între mașină și bordură — acolo e zona portierei.',
      es: 'El bloqueo del carril bici por vehículos de reparto o coches mal aparcados es habitual en ciudades españolas. Mira por encima del hombro, señaliza con el brazo, incorpórate al carril de circulación con seguridad, adelanta el obstáculo y vuelve al carril bici. Nunca pases por el hueco entre el coche y el bordillo — esa es la zona de puerta.',
    },
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'f2a3b4c5-d6e7-4f8a-f570-91b914bbc72f',
    questionText: {
      en: 'What does a blue circular sign with a white bicycle (señal R-407a) mean in Spain?',
      ro: 'Ce semnifică indicatorul circular albastru cu o bicicletă albă (R-407a) în Spania?',
      es: '¿Qué significa la señal R-407a (círculo azul con una bici blanca) en España?',
    },
    options: {
      en: [
        'No cycling allowed',
        'Mandatory bike path — cyclists must use it instead of the carriageway',
        'Shared path for cyclists and pedestrians',
        'Bicycle parking ahead',
      ],
      ro: [
        'Pedalarea este interzisă',
        'Pistă de biciclete obligatorie — ciclistul trebuie să o folosească în loc de carosabil',
        'Pistă comună pentru cicliști și pietoni',
        'Parcare de biciclete în față',
      ],
      es: [
        'Prohibido circular en bici',
        'Vía ciclista obligatoria — el ciclista debe usarla en lugar de la calzada',
        'Vía compartida para ciclistas y peatones',
        'Aparcamiento de bicis más adelante',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'The blue circular sign with a white bicycle (R-407a) indicates a mandatory bike path or via ciclista. When this sign is present, cyclists are legally required to use the marked path instead of the main carriageway. The sign showing both a bicycle and a pedestrian (R-407b) indicates a shared path.',
      ro: 'Indicatorul circular albastru cu bicicletă albă (R-407a) indică pistă ciclistă obligatorie sau vía ciclista. Când este prezent, ciclistul este obligat prin lege să folosească pista marcată în loc de carosabilul principal. Indicatorul cu bicicletă și pieton (R-407b) indică pistă comună.',
      es: 'La señal circular azul con una bicicleta blanca (R-407a) indica vía ciclista obligatoria. Cuando aparece, los ciclistas están legalmente obligados a usar la vía señalizada en lugar de la calzada principal. La señal con bici y peatón (R-407b) indica una vía compartida.',
    },
    category: 'infrastructure',
    difficulty: 1,
  },
  {
    id: 'a3b4c5d6-e7f8-4a9b-0681-a2ca25ccd830',
    questionText: {
      en: 'What is the EuroVelo network and why is it relevant to Spanish cyclists?',
      ro: 'Ce este rețeaua EuroVelo și de ce e relevantă pentru cicliștii spanioli?',
      es: '¿Qué es la red EuroVelo y por qué es relevante para los ciclistas españoles?',
    },
    options: {
      en: [
        'A bike-sharing programme in Madrid',
        'A network of long-distance cycling routes crossing Europe — EV1, EV3 and EV8 all pass through Spain',
        'An EU regulation on bicycle standards',
        'A cycling insurance programme',
      ],
      ro: [
        'Un program de bike-sharing în Madrid',
        'O rețea de trasee ciclistice de lungă distanță prin Europa — EV1, EV3 și EV8 trec toate prin Spania',
        'O reglementare UE privind standardele bicicletelor',
        'Un program de asigurări ciclistice',
      ],
      es: [
        'Un programa de bicis compartidas en Madrid',
        'Una red de rutas ciclistas de larga distancia que atraviesan Europa — EV1, EV3 y EV8 pasan por España',
        'Una normativa europea sobre bicicletas',
        'Un programa de seguros para ciclistas',
      ],
    },
    correctIndex: 1,
    explanation: {
      en: 'EuroVelo is a network of 17 long-distance cycling routes. In Spain, EV1 (Atlantic Coast Route) follows the Camino del Norte from País Vasco to Galicia; EV3 (Pilgrims Route) terminates in Santiago de Compostela; and EV8 (Mediterranean Route) runs from Cádiz along the coast to Catalonia and into France.',
      ro: 'EuroVelo este o rețea de 17 trasee ciclistice de lungă distanță. În Spania: EV1 (Ruta Coastei Atlantice) urmează Camino del Norte din Țara Bascilor până în Galicia; EV3 (Ruta Pelerinilor) se termină la Santiago de Compostela; iar EV8 (Ruta Mediterană) merge de la Cádiz pe coastă până în Catalonia și mai departe în Franța.',
      es: 'EuroVelo es una red de 17 rutas ciclistas de larga distancia. En España: EV1 (Ruta de la Costa Atlántica) sigue el Camino del Norte desde el País Vasco hasta Galicia; EV3 (Ruta de los Peregrinos) termina en Santiago de Compostela; y EV8 (Ruta del Mediterráneo) recorre desde Cádiz por la costa hasta Cataluña y entra en Francia.',
    },
    category: 'infrastructure',
    difficulty: 3,
  },
  {
    id: 'b4c5d6e7-f8a9-4b0c-1792-b3db36dde941',
    questionText: {
      en: 'How should you handle a railway crossing on a bicycle in Spain?',
      ro: 'Cum traversezi o trecere de cale ferată cu bicicleta în Spania?',
      es: '¿Cómo debes afrontar un paso a nivel en bici en España?',
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
      en: 'Spanish railway crossings (pasos a nivel) can be unguarded, especially on rural roads and on parts of the secondary FEVE / Renfe Cercanías network. Always slow down, look and listen for trains in both directions, and cross tracks at a right angle to avoid your wheel getting caught in the rail groove.',
      ro: 'Trecerile la nivel din Spania (pasos a nivel) pot fi nepăzite, mai ales pe drumurile rurale și pe părți ale rețelei secundare FEVE / Renfe Cercanías. Încetinește mereu, privește și ascultă trenurile din ambele direcții, și traversează șinele în unghi drept ca să nu prinzi roata în canalul șinei.',
      es: 'Los pasos a nivel españoles pueden estar sin barreras, especialmente en carreteras rurales y partes de las redes secundarias de FEVE / Renfe Cercanías. Reduce siempre la velocidad, mira y escucha a ambos lados, y cruza las vías en ángulo recto para evitar que la rueda quede atrapada en la ranura del raíl.',
    },
    category: 'infrastructure',
    difficulty: 2,
  },
] as const;

/** Look up a question by its stable UUID. */
export function findQuizQuestionEs(id: string): StaticQuizQuestion | undefined {
  return QUIZ_QUESTIONS_ES.find((q) => q.id === id);
}
