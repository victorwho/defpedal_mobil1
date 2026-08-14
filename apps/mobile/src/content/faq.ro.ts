import type { FaqSections } from './faqTypes';

export const faqRo: FaqSections = [
  {
    id: 'safety',
    title: 'Siguranță și rutare',
    items: [
      {
        id: 'what-is-defensive-pedal',
        question: 'Ce este Defensive Pedal?',
        answer:
          'Defensive Pedal este o aplicație de navigație pentru bicicliști care pune siguranța pe primul loc. Calculează rute care ocolesc drumurile periculoase, intersecțiile aglomerate și segmentele riscante, pe baza datelor reale de risc rutier.',
      },
      {
        id: 'pre-ride-check',
        question: 'Ce ar trebui să verific înainte de fiecare cursă?',
        answer:
          'O verificare de 60 de secunde înainte să pornești.\n\nBicicleta (aer, frâne, lanț):\n• Aer — strânge ambele cauciucuri, umflă-le dacă sunt moi\n• Frâne — strânge fiecare manetă, roata trebuie să se oprească ferm\n• Lanț — învârte pedalele, verifică să nu fie uscat sau ruginit; închizătoarele rapide și șuruburile strânse\n\nTu:\n• Casca pusă, cureaua prinsă\n• Far alb în față și stop roșu în spate, aprinse (mereu, chiar și ziua)\n• Soneria funcționează\n• Telefonul încărcat, montat sau bine pus în buzunar\n• Haine vizibile sau reflectorizante la amurg ori noaptea\n\nTraseul:\n• Destinația setată în Defensive Pedal și ruta Sigură selectată\n• O privire pe distribuția riscului și pe profilul de elevație — să știi ce urmează\n• Verifică widgetul de vreme pentru ploaie, vânt sau aer de calitate slabă\n• Reține pericolele raportate pe traseul tău\n\nMintea:\n• Hidratat, nu pedala flămând sau epuizat\n• Ghidarea vocală pornită, ca ochii să rămână pe drum\n• Gândește-ți primul viraj înainte să pleci\n\nDacă ceva nu trece verificarea, rezolvă înainte de plecare — nu la primul semafor roșu.',
      },
      {
        id: 'safe-vs-fast',
        question: 'Prin ce diferă rutarea „Sigur” de „Rapid”?',
        answer:
          'Modul Sigur folosește serverul nostru OSRM propriu, cu un profil ponderat pe siguranță, care ocolește segmentele de drum cu risc ridicat. Modul Rapid folosește indicațiile standard Mapbox pentru bicicletă, optimizate pentru cel mai scurt timp de deplasare.',
      },
      {
        id: 'why-not-shortest',
        question: 'De ce ruta mea nu merge pe drumul cel mai scurt?',
        answer:
          'Pentru că drumul cel mai scurt este adesea și cel mai aglomerat. Defensive Pedal pune în balanță siguranța și distanța și preferă străzile liniștite și protejate. Vezi compromisul pe cardul rutei — de obicei sunt câteva minute în plus pentru o cursă mult mai liniștită.',
      },
      {
        id: 'risk-score-source',
        question: 'De unde vine Scorul de Risc?',
        answer:
          'De la stradă în sine: limite de viteză, benzi, infrastructura pentru biciclete și cât de bine te separă de mașini, volume de trafic modelate, calitatea suprafeței, iluminatul și zeci de alte semnale — din OpenStreetMap, date de elevație și modelare de trafic. Mai mic înseamnă mai sigur. Scorurile stradă cu stradă acoperă toate cele 31 de țări europene suportate.',
      },
      {
        id: 'wrong-street-color',
        question: 'De ce are strada asta culoarea greșită?',
        answer:
          'Datele noastre de hartă vin din OpenStreetMap și sunt reîmprospătate periodic, dar străzile se schimbă — piste noi, lucrări, drumuri reetichetate. Dacă un scor pare greșit, spune-ne prin butonul de sugestii de pe ecranul de planificare și ai mereu încredere în ce vezi, nu în ce spune harta.',
      },
      {
        id: 'green-not-guaranteed',
        question: 'O stradă verde este garantat sigură?',
        answer:
          'Niciun scor nu poate promite asta. Verde înseamnă că designul străzii și condițiile de trafic sunt favorabile — nu poate vedea vremea de azi, o dubă de livrări oprită pe pistă sau un șofer anume. Scorul de Risc este un sprijin în decizie, nu o garanție. Pedalează defensiv; e chiar în numele nostru.',
      },
      {
        id: 'supported-countries',
        question: 'Ce țări sunt acoperite?',
        answer:
          'Rutarea sigură și culorile de risc stradă cu stradă sunt disponibile în 31 de țări europene (UE, SEE și Elveția). Rutarea rapidă funcționează în toată lumea, prin Mapbox.',
      },
      {
        id: 'avoid-unpaved',
        question: 'Ce face „Evită drumurile neasfaltate”?',
        answer:
          'Când e activă, opțiunea penalizează pietrișul, drumurile de pământ și cele neasfaltate, astfel încât ruta ta să rămână pe suprafețe asfaltate ori de câte ori e posibil.',
      },
      {
        id: 'report-hazard',
        question: 'Cum raportez un pericol?',
        answer:
          'În timpul navigării, apasă butonul de raportare a pericolelor din HUD. Poți semnala gropi, câini agresivi, inundații și alte obstacole. Rapoartele ajung la ceilalți bicicliști. Poți și să ții apăsat pe hartă din ecranul de planificare, ca să raportezi pericole înainte să pornești.',
      },
      {
        id: 'offline-use',
        question: 'Pot folosi aplicația offline?',
        answer:
          'Hărțile pentru offline se descarcă din ecranul Hărți offline, aflat în Setări. Calcularea rutei are însă nevoie în continuare de conexiune la internet.',
      },
      {
        id: 'voice-guidance',
        question: 'Cum funcționează ghidarea vocală?',
        answer:
          'Când e activată, aplicația citește cu voce tare indicațiile pas cu pas în timpul navigării. O poți porni sau opri din ecranul de planificare a rutei ori din HUD-ul de navigare.',
      },
    ],
  },
  {
    id: 'impact',
    title: 'Impactul tău',
    items: [
      {
        id: 'microlives',
        question: 'Ce sunt Microviețile?',
        answer:
          'Microviețile sunt o măsură științifică a speranței de viață. 1 Microviață = 30 de minute din speranța de viață a unui adult. Fiecare cursă îți aduce Microvieți în funcție de distanța pedalată, tipul de bicicletă și calitatea aerului. Formula: 0,4 × distanța (km) × modificatorul de vehicul × modificatorul AQI. Bicicletele obișnuite aduc mai mult decât cele electrice, pentru că efortul fizic e mai mare.',
      },
      {
        id: 'community-seconds',
        question: 'Cum se calculează secundele donate comunității?',
        answer:
          'Fiecare kilometru pedalat în locul mersului cu mașina evită poluarea care ar scurta viețile celor din jurul tău. Calculăm asta ca 4,5 secunde din speranța de viață a comunității, donate pe kilometru. Ele sunt însumate la nivel de oraș, ca să arate impactul colectiv.',
      },
      {
        id: 'lifetime-impact',
        question: 'Unde îmi văd impactul de-a lungul timpului?',
        answer:
          'Panoul de Impact (fila Istoric → Impactul tău) îți arată totalurile cumulate din fiecare cursă: CO2 evitat, bani economisiți, Microvieți câștigate și secunde donate comunității. Cifrele astea doar cresc — fiecare cursă adaugă la ele.',
      },
      {
        id: 'co2-calculation',
        question: 'Cum se calculează CO2 economisit?',
        answer:
          'Calculăm economia de CO2 comparând distanța ta reală pedalată, măsurată prin GPS, cu emisiile pe care le-ar produce o mașină pe același traseu. Formula folosește media UE de 120 g CO2/km. De exemplu, o cursă de 10 km economisește aproximativ 1,2 kg de CO2.',
      },
      {
        id: 'ride-equivalents',
        question: 'Ce sunt echivalențele afișate după o cursă?',
        answer:
          'După fiecare cursă, rezumatul de impact îți arată economia de CO2 exprimată în echivalențe din lumea reală — copaci salvați, încărcări de telefon sau kilometri de condus evitați. Ele fac cifrele abstracte tangibile și motivante.',
      },
    ],
  },
  {
    id: 'progression',
    title: 'Progres și recompense',
    items: [
      {
        id: 'xp-system',
        question: 'Cum funcționează sistemul de XP?',
        answer:
          'Primești puncte de experiență (XP) de fiecare dată când termini o cursă, câștigi o insignă sau menții o zi de streak. XP-ul pe cursă crește cu distanța și include multiplicatori pentru vreme nefavorabilă și pentru raportarea pericolelor. XP-ul se adună către nivelul tău de biciclist.',
      },
      {
        id: 'rider-tiers',
        question: 'Ce sunt nivelurile de biciclist?',
        answer:
          'Există 10 niveluri de biciclist, de la Kickstand (începător) până la Legend. Fiecare nivel cere mai mult XP. Nivelul tău actual apare pe cardul de profil și pe postările din feedul comunității. Când ajungi la un nivel nou, primești o animație de sărbătoare.',
      },
      {
        id: 'badges',
        question: 'Cum câștig insigne?',
        answer:
          'Insignele se acordă automat când atingi praguri în 8 categorii: distanță, streak-uri, raportarea pericolelor, implicare în comunitate, pedalat pe vreme grea, ora din zi, explorare și realizări speciale. Intră în Vitrina cu trofee din profil ca să vezi catalogul complet de peste 140 de insigne și progresul tău.',
      },
      {
        id: 'streaks',
        question: 'Cum funcționează streak-urile?',
        answer:
          'Streak-ul tău numără zilele consecutive cu activitate care se califică. Ziua se resetează la ora 4:00, ora locală. Dacă ratezi o zi, streak-ul revine la zero — dacă nu ai o înghețare de streak disponibilă. Cel mai lung streak al tău este urmărit separat.',
      },
      {
        id: 'streak-qualifying-actions',
        question: 'Ce acțiuni contează pentru streak?',
        answer:
          'Cinci acțiuni contează pentru streak-ul zilnic: să termini o cursă, să raportezi un pericol, să confirmi sau să infirmi un pericol existent, să răspunzi la quizul zilnic de siguranță și să partajezi o cursă în feedul comunității. E de ajuns una pe zi ca streak-ul să rămână viu.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Confidențialitate și date',
    items: [
      {
        id: 'location-data',
        question: 'Ce se întâmplă cu datele mele de locație?',
        answer:
          'Urmele GPS din cursele tale sunt încărcate pe serverele noastre ca să poți relua traseele în istoric, să îți vezi statisticile de impact și să partajezi rute în feedul comunității. Rapoartele de pericol includ coordonata exactă unde ai apăsat, plus numele tău de utilizator, ca ceilalți bicicliști să vadă cine a semnalat. Dacă partajezi o cursă în feed, numele tău de utilizator, rezumatul rutei și traseul complet sunt vizibile pentru ceilalți utilizatori.\n\nÎți poți șterge contul oricând din Profil → Cont → Șterge contul, ceea ce elimină definitiv toate aceste date.',
      },
      {
        id: 'delete-account',
        question: 'Cum îmi șterg contul?',
        answer:
          'Deschide Profil, derulează până la secțiunea Cont și apasă Șterge contul. Ți se va cere să scrii DELETE pentru confirmare. La confirmare, eliminăm definitiv de pe serverele noastre cursele, istoricul GPS, rapoartele de pericol, comentariile, aprecierile, insignele, XP-ul și profilul tău. Conținutul vizibil în comunitate pe care l-ai postat (un pericol semnalat sau un comentariu scris de tine) este anonimizat — postarea rămâne, ca semnalul pentru comunitate să se păstreze, dar numele și contul tău dispar.',
      },
      {
        id: 'analytics',
        question: 'Colectați rapoarte de eroare sau analize de produs?',
        answer:
          'Amândouă sunt active implicit. Rapoartele de eroare mențin aplicația stabilă — conțin urme de stivă și informații despre dispozitiv, niciodată locația ta și niciun fel de date personale. Analiza de produs înseamnă date de utilizare anonime și agregate, fără trasee GPS, și ne arată pe ce funcții merită să construim. Ambele sunt anunțate pe primul ecran de onboarding și ambele pot fi oprite de tine: Profil → Confidențialitate & analiză, oricând. Dezactivarea unui comutator oprește imediat evenimentele noi pe acel canal, iar odată ce ai făcut o alegere, nu ți-o suprascriem niciodată. Nu vindem niciodată datele tale.',
      },
    ],
  },
];
