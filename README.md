# Generals No Limits

Een modulaire, speelbare 3D RTS geïnspireerd op Generals en Zero Hour. Drie facties, negen generaalsvarianten, economie, basisbouw, gevechten, AI, campaign en superwapens. Eigen quasi-realistische menu-art, portretten, terrein-, metaal- en boomassets, procedurele 3D-modellen en 174 door ElevenLabs gemaakte stemmen, meldingen en effecten. De bestaande synthetische muziek is voorlopig behouden. Zie [assetproductie](docs/asset-production.md) voor herkomst en reproductie.

## Direct in de browser spelen

De websitebestanden worden gepubliceerd op de branch `gh-pages`. Zet eenmalig in de repository **Settings → Pages → Source: Deploy from a branch → Branch: gh-pages → /(root) → Save**. GitHub toont daar de gepubliceerde link zodra de deployment voltooid is. Daarna speel je via `https://officialdlt.github.io/GeneralsNoLimits/`, zonder ZIP, executable, Node.js of terminal te gebruiken.

De workflow `Publish browser game` bouwt en publiceert volgende wijzigingen aan `main` automatisch naar `gh-pages`. Mocht GitHub Actions uitgeschakeld zijn, dan kan een ontwikkelaar `npm run deploy:pages` uitvoeren. De publicatie maakt een nieuwe commit op de websitebranch zonder de historie te resetten. De Pages-instelling moet wel eenmaal zijn ingeschakeld; een push alleen is geen bewijs dat de website live is.

## Windows: dubbelklikken

Download [releases/GeneralsNoLimits.exe](https://github.com/OfficialDLT/GeneralsNoLimits/blob/main/releases/GeneralsNoLimits.exe) met **Download raw file** en dubbelklik. De ingebouwde game opent in je standaardbrowser. Je hebt geen terminal, Node.js of losse spelbestanden nodig. De executable is Windows x64, niet digitaal ondertekend, en wordt vanuit Linux gebouwd; Windows-browseropening moet op Windows worden getest.

De lokale server luistert alleen op `127.0.0.1` op poort 41731, met een vrije poort als fallback. De vaste voorkeurpoort houdt browseropties bij volgende starts beschikbaar. Sluit alle spelpagina's; de server stopt na ongeveer twee minuten. Download na een update de nieuwe executable en vervang de vorige. Je oude executable heeft geen automatische updater. De SHA-256 staat in `releases/SHA256SUMS.txt`.

## Snel spelen

1. Kies **Sandbox** om bediening en een factie te ontdekken, of **Skirmish** voor een echte tegenstander.
2. Kies USA, China of GLA, een generaal, kaart, startgeld en moeilijkheid. Extra spelers zijn lokale AI, maximaal acht totaal. Teams kunnen speler 2 bondgenoot maken.
3. Je begint met een hoofdkwartier, bouwer, barracks, factory, supplygebouw, collector en klein leger. USA/China hebben ook een energiecentrale.
4. Selecteer je bouwer of Command Center voor de bouwlijst. Bouw barracks voor **+20 populatieruimte** per gebouw. Er is geen passief hoofdkwartierinkomen: collectors halen geld uit eindige supply piles.
5. Bouw een techgebouw om geavanceerde units, upgrades, secundaire economie en superwapens te ontgrendelen. Research is te vinden bij de geselecteerde gebouwen.
6. Verzamel XP uit kills, ontgrendel General's Powers en kies hun doelen op de kaart. Vernietig alle vijandelijke gebouwen om te winnen.

De drie campaign-missies hebben een briefing en factiespecifieke doelen; de kaarten en tegenstander gebruiken de skirmish-simulatie. Een save of replay kun je vanuit het pauzemenu als JSON downloaden en vanuit het menu laden.

## Besturing

| Actie                                         | Bediening                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Camera bewegen                                | WASD, pijltjestoetsen of muis tegen schermrand                                                   |
| Camera draaien / zoomen                       | Scrollknop vasthouden en slepen / scrollen                                                       |
| Selectie                                      | Links klikken/slepen, Shift voegt toe, dubbelklik selecteert hetzelfde zichtbare type            |
| Control groups                                | Ctrl+1–9 opslaan, 1–9 selecteren, dubbel indrukken centreren                                     |
| Bewegen / aanvallen                           | Rechterklik op grond / vijand                                                                    |
| Force Fire                                    | Ctrl+rechterklik; gewone rechterklik geeft nieuw bevel                                           |
| Waypoints                                     | Shift+rechterklik of Q en doel kiezen                                                            |
| Attack-Move / Guard / Stop / Scatter / Patrol | X / G / K / F / P                                                                                |
| Basis / laatste aanval / alle eigen units     | Home / Space / E                                                                                 |
| Bouwen en draaien                             | Kies gebouw, houd links op bouwplek vast, sleep om te draaien, laat los                          |
| Rally-vlag                                    | Productiegebouw selecteren, rechterklik op kaart                                                 |
| Garrison / transport                          | Infanterie selecteren, rechterklik op geschikt eigen gebouw/transport; knop voor neutrale doelen |
| Capture                                       | Capture-upgrade onderzoeken; capture-knop, doel kiezen (Black Lotus heeft directe capture)       |
| Pauze, save, replay, snelheid, weer, opties   | Esc of Menu                                                                                      |

Bouw- en trainhotkeys staan in de JSON-configs en op de knoppen; ze werken in de context van het geselecteerde gebouw of de bouwer. Actietoetsen, volume en grafische kwaliteit zijn instelbaar via Options. Opties worden lokaal in de browser bewaard. **K** is Stop, zodat **S** de bestaande WASD-camera blijft bedienen. Capturen, hero abilities, tunneltransport, Strategy Center-modes, uitladen en repairs hebben expliciete actieknoppen.

## Wat zit erin en hoe test ik het?

Het volledige overzicht van **alle 67 gevraagde punten**, met status, vereenvoudigingen en teststappen, staat in [docs/FEATURES.md](docs/FEATURES.md). Lees dat overzicht voor de verschillen met Generals/Zero Hour.

Belangrijke grenzen: alle extra spelers zijn lokale AI; online multiplayer ontbreekt. Units en gebouwen gebruiken procedurele geometrie met gegenereerde materiaaltexturen; infantry en tanks hebben quasi-realistische klasseportretten, overige objecten 3D-cameos. Alle 54 unittypes hebben drie ElevenLabs-radioclips; EVA heeft zes ingesproken meldingen. Vier originele synthesizertracks verzorgen voorlopig de menu- en factiemuziek. Powers delen enkele effecttypen. Water, kliffen, bruggen, vliegen/landen en damage states zijn vereenvoudigd. Er is geen realistische sloopfysica of uitgebreide verhalende campaign.

## Ontwikkelen en stats aanpassen

Node.js 22.12+ of 24:

```sh
npm ci
npm run dev
```

Als jouw npm het postinstall-script van esbuild blokkeert: `npm install-scripts approve esbuild` en `npm rebuild esbuild`.

- `src/config/units.json`: namen, kosten, HP, snelheid, bevolking, wapens, armor, productiegebouw en prerequisites.
- `src/config/buildings.json`: kosten, bouwtijd, radius, power, capaciteit, economie, defenses en superwapens.
- `src/config/upgrades.json`, `powers.json`, `factions.json`: effecten, cooldowns, kleuren, generaalsvarianten en voice lines.
- `src/config/combat.json`: armor/damage-matrix, veterancy en promotiedrempels.
- `src/config/maps.json`, `missions.json`: kaartpresets en campaign-briefings/doelen. Via Skirmish kun je een kaart-JSON laden/exporteren: `name`, `size` (400–2400), `seed`, `weather` (`clear`, `rain`, `snow`). Terreinpatronen zijn procedureel, geen vrije sculpting-editor.

De simulatie is los van Three.js: `simulation/engine.js` beheert state en opdrachten, met aparte systemen voor `economy`, `combat`, `orders`, `ai`, `vision`, `world` (A*) en `spatial` (spatial hash en pooling). `render/` bevat de bestaande modelvormen en de 3D-weergave; `ui/` bevat besturing, menu's, command bar en audio. De oude zuivere `game.js`-helpers blijven behouden voor compatibiliteit met het eerste prototype.

## Controles

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

De browsercontrole start zelf een Vite-server op poort 5179. Voor systeem-Chromium kun je `CHROMIUM_PATH` instellen. De tests controleren echte economische/gevechtsketens en bediening; ze gebruiken geen debug-global in de productiebuild. Go-launchertests zitten in `launcher/`.

## Windows-executable opnieuw bouwen

Met Node.js en Go 1.24+ op Linux/macOS:

```sh
bash scripts/build-windows.sh
sha256sum releases/GeneralsNoLimits.exe > releases/SHA256SUMS.txt
```

De launcher embedt de Vite-build en gebruikt alleen Go's standaardbibliotheek. Wijzigingen in JSON/config worden meegenomen bij opnieuw bouwen. De bestaande executable verandert pas wanneer je hem opnieuw bouwt.

## Presentatie-update 0.3

Het hoofdmenu heeft gegenereerde militaire woestijnart, een metallic titel en een eigen soundtrack. Muziek begint na de eerste klik, zoals browsers vereisen; zet hem aan/uit via de muziekknop of Options. Mastervolume, muziekvolume en stemmen zijn afzonderlijk instelbaar.

De commandobalk staat onderin. Gebruik **COMMANDOBALK INKLAPPEN/UITKLAPPEN** voor meer kaartzicht, en de tabs **BEVELEN / GENERALS** om te wisselen. Cameos tonen de echte eigen 3D-modellen. Tanks, aircraft en factiegebouwen hebben nieuwe silhouetten en details, zonder originele game-assets over te nemen.

Verkende vijandelijke en neutrale gebouwen verdwijnen nu ook in grijze fog of war. Elk unittype heeft drie eigen radioclips (selectie, bewegen, aanvallen) en een eigen stemprofiel in `src/config/voice-profiles.json`. Audio staat in `public/audio/`. Reproduceren kan met `npm run assets:audio -- --keep-music` en een lokale ElevenLabs-sleutel; spelen en normale builds hebben geen sleutel nodig. Het oude `generate-audio.py` is uitsluitend voor de eerdere synthetische assets.
