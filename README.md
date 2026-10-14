# Generals No Limits

Een speelbaar RTS-prototype met Three.js: een 3D-kaart van 2 × 2 kilometer, een basis, soldaten en tanks. De spelregels staan los van de weergave in `src/game.js`.

## Windows: starten zonder terminal

Download `releases/GeneralsNoLimits.exe` vanaf GitHub met de knop **Download raw file**. Dubbelklik op het bestand: het spel opent automatisch in je standaardbrowser. Node.js, npm en een terminal zijn niet nodig. Internet is niet nodig voor het spel; het optionele webfont gebruikt een lokale fallback als je offline bent.

De launcher luistert alleen op je eigen computer (`127.0.0.1`) op een vrije poort. Na het sluiten van alle spelpagina's stopt hij na ongeveer twee minuten. Sla je spel niet op door het tabblad te sluiten: opslaan is nog niet ingebouwd. De executable is voor Windows x64 en is niet digitaal ondertekend. Een melding van SmartScreen is daarom mogelijk.

De Windows-build is vanuit Linux samengesteld. De ingebouwde server en webversie worden hier getest; Windows-start en browseropening moeten nog op een Windows-computer worden gecontroleerd.

## Starten voor ontwikkeling

Node.js 22.12+ of 24:

```sh
npm ci --cache /tmp/generals-npm-cache
npm run dev
```

Open de door Vite getoonde URL in een browser met WebGL. `npm run build` maakt de productieversie; `npm test` controleert de economische spelregels.

## Spelen

- WASD of pijltjestoetsen: camera bewegen. Scroll: in-/uitzoomen. Klik op de minimap om naar een sector te gaan.
- Linkerklik: een gebouw of eenheid selecteren. Shift + klik: eenheden aan selectie toevoegen/verwijderen.
- Sleep met de linkermuisknop een selectiekader om meerdere eenheden te selecteren. Shift + slepen voegt eenheden toe.
- Dubbelklik op een eenheid om alle zichtbare eenheden van hetzelfde type te selecteren.
- Rechterklik: geselecteerde eenheden laten bewegen in formatie.
- Ctrl + rechterklik: aanval op de grond. Eenheden bewegen binnen bereik en blijven schieten; een gewone rechterklik stopt de aanval.
- Gebruik het commandopaneel om gebouwen te plaatsen. Esc of rechterklik annuleert bouwen.
- Selecteer barracks om soldaten te trainen; selecteer een tankfabriek om tanks te maken. Onderin verschijnt een productiekaart met een eigen illustratie, resterende tijd, voortgang en vijf wachtrijslots.

Je begint met 3.000 credits, een hoofdkwartier, barracks, tankfabriek, twee soldaten en één tank. Het hoofdkwartier levert 30 credits per seconde en 10 populatiepunten. Elke barracks kost 400 credits en geeft 20 extra populatiepunten. Een tankfabriek kost 700 credits. Soldaten kosten 100 credits en 1 populatiepunt; tanks kosten 300 credits en 3 populatiepunten. Een productiegebouw heeft vijf wachtrijplaatsen. Eenheden in productie reserveren al populatieruimte.

Dit prototype richt zich op bouwen, produceren en bewegen. Grondaanvallen hebben projectielen en inslageffecten, maar nog geen schade. Vijanden, gebouwvernietiging, opslaan en volledige obstakelpadvinding zijn nog niet geïmplementeerd; bomen zijn decoratief. Gebouwen worden direct geplaatst en eenheden proberen er langs te bewegen.

## Windows-launcher opnieuw bouwen

Met Node.js en Go 1.24+ op Linux/macOS: `bash scripts/build-windows.sh`. De build gebruikt alleen de Go-standaardbibliotheek en embedt de Vite-productiebuild. De broncode staat in `launcher/`; de uitvoer staat in `releases/GeneralsNoLimits.exe`.
