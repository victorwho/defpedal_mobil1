import type { FaqSections } from './faqTypes';

export const faqEs: FaqSections = [
  {
    id: 'safety',
    title: 'Seguridad y rutas',
    items: [
      {
        id: 'what-is-defensive-pedal',
        question: '¿Qué es Defensive Pedal?',
        answer:
          'Defensive Pedal es una app de navegación ciclista que pone por delante la seguridad de quien pedalea. Calcula rutas que evitan carreteras peligrosas, cruces con mucho tráfico y tramos de riesgo, a partir de datos reales de riesgo vial.',
      },
      {
        id: 'pre-ride-check',
        question: '¿Qué debo revisar antes de cada salida?',
        answer:
          'Una revisión de 60 segundos antes de salir.\n\nLa bici (aire, frenos, cadena):\n• Aire — aprieta ambas cubiertas, infla si están blandas\n• Frenos — aprieta cada maneta, la rueda debe detenerse con firmeza\n• Cadena — gira los pedales y comprueba que no esté seca ni oxidada; cierres rápidos y tornillos apretados\n\nTú:\n• Casco puesto, correa abrochada\n• Luz blanca delante y luz roja detrás, encendidas (siempre, también de día)\n• El timbre funciona\n• Móvil cargado, en soporte o bien guardado en el bolsillo\n• Ropa visible o reflectantes al atardecer o de noche\n\nLa ruta:\n• Destino fijado en Defensive Pedal y ruta Segura seleccionada\n• Un vistazo a la distribución de riesgo y al desnivel — saber qué viene\n• Consulta el widget del tiempo por si hay lluvia, viento o mala calidad del aire\n• Fíjate en los peligros avisados en tu ruta\n\nLa cabeza:\n• Hidratado, sin pedalear con hambre ni agotado\n• Guía por voz activada para no apartar la vista de la carretera\n• Piensa tu primer giro antes de arrancar\n\nSi algo no pasa la revisión, arréglalo antes de salir — no en el primer semáforo en rojo.',
      },
      {
        id: 'safe-vs-fast',
        question: '¿En qué se diferencia la ruta «Segura» de la «Rápida»?',
        answer:
          'El modo Seguro usa nuestro propio servidor OSRM con un perfil ponderado por seguridad que evita los tramos de mayor riesgo. El modo Rápido usa las indicaciones ciclistas estándar de Mapbox, optimizadas para el menor tiempo de trayecto.',
      },
      {
        id: 'why-not-shortest',
        question: '¿Por qué mi ruta no va por el camino más corto?',
        answer:
          'Porque el camino más corto suele ser el que más tráfico tiene. Defensive Pedal equilibra seguridad y distancia, y prefiere calles tranquilas y protegidas. Puedes ver el intercambio en la tarjeta de la ruta — normalmente son un par de minutos a cambio de un trayecto mucho más tranquilo.',
      },
      {
        id: 'risk-score-source',
        question: '¿De dónde sale la Puntuación de Riesgo?',
        answer:
          'De la propia calle: límites de velocidad, carriles, infraestructura ciclista y cómo de bien te separa de los coches, volúmenes de tráfico modelados, calidad del firme, iluminación y decenas de señales más — a partir de OpenStreetMap, datos de elevación y modelado de tráfico. Cuanto más baja, más segura. Las puntuaciones calle a calle cubren los 31 países europeos compatibles.',
      },
      {
        id: 'wrong-street-color',
        question: '¿Por qué esta calle tiene el color equivocado?',
        answer:
          'Nuestros datos de mapa vienen de OpenStreetMap y se actualizan con regularidad, pero las calles cambian — carriles bici nuevos, obras, vías reetiquetadas. Si una puntuación te parece equivocada, dínoslo con el botón de sugerencias de la pantalla de planificación, y fíate siempre de lo que ves antes que de lo que dice el mapa.',
      },
      {
        id: 'green-not-guaranteed',
        question: '¿Una calle verde es segura garantizado?',
        answer:
          'Ninguna puntuación puede prometer eso. Verde significa que el diseño de la calle y las condiciones de tráfico son favorables — no puede ver el tiempo de hoy, una furgoneta de reparto parada en el carril bici ni a un conductor concreto. La Puntuación de Riesgo es una ayuda para decidir, no una garantía. Circula a la defensiva; lo llevamos en el nombre.',
      },
      {
        id: 'supported-countries',
        question: '¿Qué países están cubiertos?',
        answer:
          'La ruta segura y los colores de riesgo calle a calle están disponibles en 31 países europeos (la UE, el EEE y Suiza). La ruta rápida funciona en todo el mundo, mediante Mapbox.',
      },
      {
        id: 'avoid-unpaved',
        question: '¿Qué hace «Evitar sin asfaltar»?',
        answer:
          'Cuando está activo, el motor de rutas penaliza la grava, los caminos de tierra y las vías sin asfaltar para que tu ruta se mantenga sobre pavimento siempre que sea posible.',
      },
      {
        id: 'report-hazard',
        question: '¿Cómo informo de un peligro?',
        answer:
          'Durante la navegación, toca el botón de informar peligro del HUD. Puedes señalar baches, perros agresivos, inundaciones y otros obstáculos. Los avisos se comparten con el resto de ciclistas. También puedes mantener pulsado el mapa en la pantalla de planificación para informar de peligros antes de salir.',
      },
      {
        id: 'offline-use',
        question: '¿Puedo usar la app sin conexión?',
        answer:
          'Los mapas sin conexión se descargan desde la pantalla Mapas offline, en Ajustes. El cálculo de la ruta sigue necesitando conexión a internet.',
      },
      {
        id: 'voice-guidance',
        question: '¿Cómo funciona la guía por voz?',
        answer:
          'Cuando está activada, la app lee en voz alta las indicaciones giro a giro durante la navegación. Puedes activarla o desactivarla desde la pantalla de planificación de ruta o desde el HUD de navegación.',
      },
    ],
  },
  {
    id: 'impact',
    title: 'Tu impacto',
    items: [
      {
        id: 'microlives',
        question: '¿Qué son las Microvidas?',
        answer:
          'Las Microvidas son una medida científica de la esperanza de vida. 1 Microvida = 30 minutos de esperanza de vida adulta. Cada trayecto te da Microvidas según la distancia pedaleada, el tipo de bici y la calidad del aire. La fórmula: 0,4 × distancia (km) × modificador de vehículo × modificador de AQI. Las bicis convencionales suman más que las eléctricas porque el esfuerzo físico es mayor.',
      },
      {
        id: 'community-seconds',
        question: '¿Cómo se calculan los segundos donados a la comunidad?',
        answer:
          'Cada kilómetro que pedaleas en lugar de conducir evita la contaminación que acortaría la vida de quienes te rodean. Lo calculamos como 4,5 segundos de esperanza de vida comunitaria donados por kilómetro. Se agregan a escala de ciudad para mostrar el impacto colectivo.',
      },
      {
        id: 'lifetime-impact',
        question: '¿Dónde veo mi impacto acumulado?',
        answer:
          'El Panel de Impacto (pestaña Historial → Tu impacto) muestra tus totales acumulados de todos los trayectos: CO2 evitado, dinero ahorrado, Microvidas ganadas y segundos donados a la comunidad. Estas cifras solo suben — cada trayecto añade a ellas.',
      },
      {
        id: 'co2-calculation',
        question: '¿Cómo se calcula el CO2 evitado?',
        answer:
          'Calculamos el ahorro de CO2 comparando tu distancia real pedaleada, medida por GPS, con las emisiones que produciría un coche en el mismo trayecto. La fórmula usa la media de la UE de 120 g CO2/km. Por ejemplo, un trayecto de 10 km evita unos 1,2 kg de CO2.',
      },
      {
        id: 'ride-equivalents',
        question: '¿Qué son las equivalencias que aparecen tras un trayecto?',
        answer:
          'Después de cada trayecto, el resumen de impacto muestra tu ahorro de CO2 en equivalencias del mundo real — árboles salvados, cargas de móvil o kilómetros en coche evitados. Ayudan a que las cifras abstractas resulten tangibles y motivadoras.',
      },
    ],
  },
  {
    id: 'progression',
    title: 'Progreso y recompensas',
    items: [
      {
        id: 'xp-system',
        question: '¿Cómo funciona el sistema de XP?',
        answer:
          'Ganas puntos de experiencia (XP) cada vez que completas un trayecto, consigues una insignia o mantienes un día de racha. El XP por trayecto crece con la distancia e incluye multiplicadores por mal tiempo y por informar de peligros. El XP se acumula hacia tu nivel de ciclista.',
      },
      {
        id: 'rider-tiers',
        question: '¿Qué son los niveles de ciclista?',
        answer:
          'Hay 10 niveles de ciclista, desde Kickstand (principiante) hasta Legend. Cada nivel exige más XP. Tu nivel actual aparece en la tarjeta de perfil y en tus publicaciones del feed de la comunidad. Al alcanzar un nivel nuevo se muestra una animación de celebración.',
      },
      {
        id: 'badges',
        question: '¿Cómo consigo insignias?',
        answer:
          'Las insignias se otorgan automáticamente al alcanzar hitos en 8 categorías: distancia, rachas, informes de peligros, participación en la comunidad, pedalear con mal tiempo, hora del día, exploración y logros especiales. Entra en la Vitrina de trofeos de tu perfil para ver el catálogo completo de más de 140 insignias y tu progreso.',
      },
      {
        id: 'streaks',
        question: '¿Cómo funcionan las rachas?',
        answer:
          'Tu racha cuenta los días consecutivos con actividad que cuenta. El día se reinicia a las 4:00, hora local. Si te saltas un día, la racha vuelve a cero — salvo que tengas un congelado de racha disponible. Tu racha más larga se registra aparte.',
      },
      {
        id: 'streak-qualifying-actions',
        question: '¿Qué acciones cuentan para mi racha?',
        answer:
          'Cinco acciones cuentan para la racha diaria: completar un trayecto, informar de un peligro, confirmar o desmentir un peligro existente, responder al test diario de seguridad y compartir un trayecto en el feed de la comunidad. Basta con una al día para mantener viva la racha.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacidad y datos',
    items: [
      {
        id: 'location-data',
        question: '¿Qué pasa con mis datos de ubicación?',
        answer:
          'Las trazas GPS de tus trayectos se suben a nuestros servidores para que puedas revivir las rutas en tu historial, ver tus estadísticas de impacto y compartir rutas en el feed de la comunidad. Los avisos de peligro incluyen la coordenada exacta donde tocaste, además de tu nombre de usuario para que el resto de ciclistas vea quién lo señaló. Si compartes un trayecto en el feed, tu nombre de usuario, el resumen de la ruta y la traza completa son visibles para los demás.\n\nPuedes eliminar tu cuenta cuando quieras desde Perfil → Cuenta → Eliminar cuenta, lo que borra todos estos datos de forma permanente.',
      },
      {
        id: 'delete-account',
        question: '¿Cómo elimino mi cuenta?',
        answer:
          'Abre Perfil, baja hasta la sección Cuenta y toca Eliminar cuenta. Se te pedirá escribir DELETE para confirmar. Al confirmar, borramos de forma permanente de nuestros servidores tus trayectos, tu historial GPS, tus avisos de peligro, tus comentarios, tus «me gusta», tus insignias, tu XP y tu perfil. El contenido visible para la comunidad que hayas publicado (un peligro que señalaste o un comentario que escribiste) se anonimiza — la publicación se queda para no perder la señal para la comunidad, pero tu nombre y tu cuenta desaparecen.',
      },
      {
        id: 'analytics',
        question: '¿Recopiláis reportes de fallos o analítica de producto?',
        answer:
          'Los dos están activos por defecto. Los reportes de fallos mantienen la app estable — llevan trazas de pila e información del dispositivo, nunca tu ubicación ni datos personales. La analítica de producto son datos de uso anónimos y agregados, sin trazas GPS, y nos dice sobre qué funciones merece la pena seguir construyendo. Ambos se anuncian en la primera pantalla de bienvenida y ambos puedes desactivarlos tú: Perfil → Privacidad y analítica, cuando quieras. Apagar un interruptor detiene de inmediato los nuevos eventos de ese canal, y una vez que has elegido nunca sobrescribimos tu elección. Nunca vendemos tus datos.',
      },
    ],
  },
];
