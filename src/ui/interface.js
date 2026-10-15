import {
  factions,
  units,
  buildings,
  upgrades,
  powers,
  maps,
  missions,
  definition as def,
} from "../config/index.js";
import { defaultHotkeys } from "./controls.js";
const $ = (s) => document.querySelector(s);
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export class Interface {
  constructor(audio) {
    this.audio = audio;
    this.overlay = $("#overlay");
    this.ids = [];
    this.lastActions = "";
    this.options = {
      volume: 0.35,
      graphics: "medium",
      voices: true,
      music: true,
      musicVolume: 0.42,
      hotkeys: { ...defaultHotkeys },
    };
    try {
      Object.assign(
        this.options,
        JSON.parse(localStorage.getItem("gnl-options") || "{}"),
      );
    } catch {}
    this.audio.volume = this.options.volume;
    this.audio.voiceEnabled = this.options.voices;
    this.audio.musicEnabled = this.options.music;
    this.audio.musicVolume = this.options.musicVolume;
    $("#pause-button").onclick = () => this.pause();
    this.audio.onStateChange = () => this.syncMusicButton();
    this.collapsed = false;
    $("#deck-toggle").onclick = () => {
      this.collapsed = !this.collapsed;
      $("#command-deck").dataset.collapsed = String(this.collapsed);
      $("#deck-toggle").setAttribute("aria-expanded", String(!this.collapsed));
      $("#deck-toggle").textContent = this.collapsed
        ? "COMMANDOBALK UITKLAPPEN ▴"
        : "COMMANDOBALK INKLAPPEN ▾";
    };
    for (const tab of ["orders", "powers"])
      $("#" + tab + "-tab").onclick = () => {
        $("#command-deck").dataset.tab = tab;
        for (const id of ["orders", "powers"])
          $("#" + id + "-tab").classList.toggle("active", id === tab);
      };
    this.menu();
  }
  syncMusicButton() {
    const b = $("#music-toggle");
    if (b)
      b.innerHTML = `<span class="equalizer"><i></i><i></i><i></i><i></i></span> ${!this.audio.unlocked ? "MUZIEK STARTEN" : this.audio.musicEnabled ? "MUZIEK AAN" : "MUZIEK UIT"}`;
  }
  connect(controls, view, start, load) {
    this.controls = controls;
    this.view = view;
    this.start = start;
    this.load = load;
    controls.hotkeys = { ...defaultHotkeys, ...this.options.hotkeys };
    this.view.renderer.shadowMap.enabled = this.options.graphics !== "low";
    this.view.renderer.setPixelRatio(
      this.options.graphics === "low"
        ? 1
        : Math.min(
            devicePixelRatio,
            this.options.graphics === "high" ? 2 : 1.5,
          ),
    );
    this.menu();
  }
  toast(message) {
    $("#toast").textContent = message;
    $("#toast").style.opacity = 1;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => ($("#toast").style.opacity = 0), 4000);
  }
  showGame(game) {
    this.game = game;
    this.lastPortrait = null;
    this.screen = "game";
    this.audio.setScene(game.player.faction);
    this.overlay.hidden = true;
    for (const id of [
      "hud",
      "command-deck",
      "command",
      "powers-panel",
      "mapbox",
    ])
      $("#" + id).hidden = false;
    document.documentElement.style.setProperty(
      "--accent",
      factions[game.player.faction].color,
    );
    this.lastActions = "";
    this.update();
  }
  menu() {
    this.screen = "menu";
    this.audio.setScene("menu");
    this.overlay.className = "main-menu";
    if (this.game) this.game.paused = true;
    this.overlay.hidden = false;
    this.overlay.innerHTML = `<div class="menu-horizon"></div><div class="menu-topline"><span><i></i> GLOBAL COMMAND NETWORK</span><span>GNL / STRATEGIC OPERATIONS</span></div><main class="menu-shell"><div class="brand-kicker"><span></span> REAL-TIME STRATEGY <span></span></div><h1 class="metal-title">GENERALS</h1><div class="brand-subtitle"><span></span> NO LIMITS <span></span></div><p class="menu-tagline">THE WORLD IS YOUR BATTLEFIELD.</p><div class="menu-buttons"><button id="skirmish" class="menu-primary"><em>01</em><div>SKIRMISH<small>Bouw je leger. Bepaal je strategie. Win de oorlog.</small></div><b>↗</b></button><button id="campaign"><em>02</em><div>CAMPAIGN<small>Drie facties. Drie fronten.</small></div><b>›</b></button><button id="sandbox"><em>03</em><div>SANDBOX<small>Een open slagveld. Jouw regels.</small></div><b>›</b></button></div><div class="menu-secondary"><button id="load-save">SPEL LADEN</button><button id="load-replay">REPLAY</button><button id="options">OPTIES</button><button id="instructions">HANDLEIDING</button>${this.game ? '<button id="resume">VERDER SPELEN</button>' : ""}</div></main><div class="menu-brief"><small>OPERATION // IRON HORIZON</small><div class="brief-rule"></div><h2>COMMAND.<br>CONQUER.<br>REPEAT.</h2><p>USA · CHINA · GLA</p><div class="brief-coordinates">24° 37′ N &nbsp; 067° 12′ E<br><span>THEATER OF OPERATIONS — ACTIVE</span></div></div><div class="menu-bottomline"><button id="music-toggle"></button><span>ORIGINAL SCORE · IRON HORIZON</span><small>GENERALS NO LIMITS / FIELD EDITION</small></div>`;
    $("#music-toggle").onclick = () => {
      const first = !this.audio.unlocked;
      this.audio.unlock();
      if (!first) this.audio.toggleMusic();
      else {
        this.audio.musicEnabled = true;
        this.audio.playMusic();
      }
      this.options.music = this.audio.musicEnabled;
      localStorage.setItem("gnl-options", JSON.stringify(this.options));
      this.syncMusicButton();
    };
    this.syncMusicButton();
    $("#skirmish").onclick = () => this.setup();
    $("#campaign").onclick = () => this.campaign();
    $("#sandbox").onclick = () => this.setup("sandbox");
    $("#options").onclick = () => this.settings();
    $("#instructions").onclick = () => this.instructions();
    $("#load-save").onclick = () => this.file("save");
    $("#load-replay").onclick = () => this.file("replay");
    if ($("#resume")) $("#resume").onclick = () => this.resume();
  }
  setup(mode = "skirmish") {
    this.overlay.className = "dialog-overlay";
    this.overlay.innerHTML = `<div class="dialog"><small>MATCH CONFIGURATION</small><h2>${mode === "sandbox" ? "Sandbox" : "Skirmish"}</h2><div class="form-grid"><label>Factie<select id="faction">${Object.entries(
      factions,
    )
      .map(([id, f]) => `<option value="${id}">${f.name}</option>`)
      .join(
        "",
      )}</select></label><label>Generaal<select id="subfaction"></select></label><label>Kaart<select id="map">${Object.entries(
      maps,
    )
      .map(
        ([id, m]) =>
          `<option value="${id}" ${id === "medium" ? "selected" : ""}>${m.name} (${m.size}m)</option>`,
      )
      .join(
        "",
      )}</select></label><label>Moeilijkheid<select id="difficulty"><option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option><option value="brutal">Brutal</option></select></label><label>Spelers<input id="players" type="number" min="${mode === "sandbox" ? 1 : 2}" max="8" value="${mode === "sandbox" ? 1 : 2}"></label><label>Startgeld<input id="cash" type="number" min="1000" max="1000000" step="1000" value="8000"></label><label>Handicap<select id="handicap"><option value="1">100%</option><option value="0.75">75% damage</option><option value="0.5">50% damage</option></select></label><label>Teams<select id="teams"><option value="0">Iedereen tegen iedereen</option><option value="1">Speler 2 is bondgenoot (min. 3)</option></select></label></div><p>Extra spelers zijn AI. ${mode === "sandbox" ? "Geen win/verlies; één speler is mogelijk." : "Vernietig alle vijandelijke gebouwen."}</p><button id="map-import">Kaart-JSON laden <span>size, seed, weather, name</span></button><button id="map-export">Kaart-JSON exporteren</button><button id="begin" class="primary">Start operatie</button><button id="back">Terug</button></div>`;
    const update = () => {
      $("#subfaction").innerHTML = Object.entries(
        factions[$("#faction").value].subs,
      )
        .map(
          ([id, s]) => `<option value="${id}">${s.name || "Standard"}</option>`,
        )
        .join("");
    };
    $("#faction").onchange = update;
    update();
    this.customMap = null;
    $("#map-import").onclick = () => this.file("map");
    $("#map-export").onclick = () =>
      this.download(maps[$("#map").value], "generals-map.json");
    $("#begin").onclick = () => {
      this.audio.unlock();
      this.start({
        mode,
        faction: $("#faction").value,
        subfaction: $("#subfaction").value,
        map: this.customMap || $("#map").value,
        players: Math.max(
          Number($("#teams").value) ? 3 : mode === "sandbox" ? 1 : 2,
          Math.min(8, Number($("#players").value) || 2),
        ),
        cash: Math.max(1000, Number($("#cash").value) || 8000),
        difficulty: $("#difficulty").value,
        team: Number($("#teams").value),
        handicap: Number($("#handicap").value),
      });
    };
    $("#back").onclick = () => this.menu();
  }
  campaign() {
    this.overlay.className = "dialog-overlay";
    this.overlay.innerHTML = `<div class="dialog"><small>CAMPAIGN</small><h2>Drie fronten</h2>${Object.entries(
      missions,
    )
      .map(
        ([f, m]) =>
          `<button data-mission="${f}">${factions[f].name}: ${m.name}</button><p>${m.briefing}</p>`,
      )
      .join("")}<button id="back">Terug</button></div>`;
    this.overlay.querySelectorAll("[data-mission]").forEach(
      (b) =>
        (b.onclick = () => {
          this.audio.unlock();
          this.start({
            mode: "campaign",
            faction: b.dataset.mission,
            map: "small",
            players: 2,
            cash: 10000,
            difficulty: "easy",
          });
          this.toast(missions[b.dataset.mission].briefing);
        }),
    );
    $("#back").onclick = () => this.menu();
  }
  resume() {
    if (!this.game) return;
    this.game.paused = false;
    this.screen = "game";
    this.audio.setScene(this.game.player.faction);
    this.overlay.hidden = true;
    this.controls.keys.clear();
  }
  pause() {
    if (!this.game) {
      this.menu();
      return;
    }
    if (!this.overlay.hidden) {
      this.resume();
      return;
    }
    this.game.paused = true;
    this.overlay.className = "dialog-overlay";
    this.controls.cancel();
    this.overlay.hidden = false;
    this.overlay.innerHTML = `<div class="dialog"><small>OPERATIE GEPAUZEERD</small><h2>Pauze</h2><button id="resume">Verder spelen</button><label>Spelsnelheid<select id="speed"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label><label>Weer<select id="weather"><option value="clear">Clear</option><option value="rain">Rain</option><option value="snow">Snow</option></select></label><button id="save">Save downloaden</button><button id="load-save">Save laden</button><button id="replay">Replay exporteren</button><button id="options">Options</button><button id="main-menu">Hoofdmenu</button></div>`;
    $("#speed").value = this.game.speed;
    $("#speed").disabled = !!this.game.replayCommands;
    $("#speed").onchange = () =>
      this.controls.dispatch({
        type: "speed",
        value: Number($("#speed").value),
      });
    $("#weather").value = this.game.environment.weather;
    $("#weather").disabled = !!this.game.replayCommands;
    $("#weather").onchange = () =>
      this.controls.dispatch({ type: "weather", value: $("#weather").value });
    $("#resume").onclick = () => this.resume();
    $("#save").onclick = () =>
      this.download(this.game.save(), "generals-save.json");
    $("#load-save").onclick = () => this.file("save");
    $("#replay").onclick = () =>
      this.download(this.game.replay(), "generals-replay.json");
    $("#options").onclick = () => this.settings();
    $("#main-menu").onclick = () => this.menu();
  }
  settings() {
    this.overlay.className = "dialog-overlay";
    this.overlay.hidden = false;
    this.overlay.innerHTML = `<div class="dialog"><small>OPTIONS</small><h2>Geluid & bediening</h2><label>Volume<input id="volume" type="range" min="0" max="1" step="0.05" value="${this.options.volume}"></label><label>Stemmen en EVA<select id="voices"><option value="true">Aan</option><option value="false">Uit</option></select></label><label>Muziek<select id="music"><option value="true">Aan</option><option value="false">Uit</option></select></label><label>Muziekvolume<input id="music-volume" type="range" min="0" max="1" step="0.05" value="${this.options.musicVolume}"></label><label>Grafisch<select id="graphics"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><div class="form-grid">${Object.entries(
      this.options.hotkeys,
    )
      .map(
        ([a, k]) =>
          `<label>${a}<input data-key="${a}" value="${escape(k)}" maxlength="12"></label>`,
      )
      .join(
        "",
      )}</div><p>WASD/pijlen blijven camera bedienen. Gebruik voor acties andere toetsen. Alle unittypes hebben een eigen radiostem. EVA gebruikt een beschikbare browserstem.</p><button id="apply">Opslaan</button><button id="back">Terug</button></div>`;
    $("#voices").value = String(this.options.voices);
    $("#music").value = String(this.options.music);
    $("#graphics").value = this.options.graphics;
    $("#apply").onclick = () => {
      this.options.volume = Number($("#volume").value);
      this.options.voices = $("#voices").value === "true";
      this.options.music = $("#music").value === "true";
      this.options.musicVolume = Number($("#music-volume").value);
      this.options.graphics = $("#graphics").value;
      this.overlay
        .querySelectorAll("[data-key]")
        .forEach(
          (e) => (this.options.hotkeys[e.dataset.key] = e.value.toLowerCase()),
        );
      this.audio.volume = this.options.volume;
      this.audio.voiceEnabled = this.options.voices;
      this.audio.musicEnabled = this.options.music;
      this.audio.musicVolume = this.options.musicVolume;
      this.audio.syncMix();
      this.audio.playMusic();
      this.controls.hotkeys = { ...defaultHotkeys, ...this.options.hotkeys };
      this.view.renderer.shadowMap.enabled = this.options.graphics !== "low";
      this.view.renderer.setPixelRatio(
        this.options.graphics === "low"
          ? 1
          : Math.min(
              devicePixelRatio,
              this.options.graphics === "high" ? 2 : 1.5,
            ),
      );
      localStorage.setItem("gnl-options", JSON.stringify(this.options));
      this.toast("Opties opgeslagen");
    };
    $("#back").onclick = () =>
      this.game && this.screen === "game" ? this.resume() : this.menu();
  }
  instructions() {
    this.overlay.className = "dialog-overlay";
    this.overlay.innerHTML = `<div class="dialog"><small>FIELD MANUAL</small><h2>Bediening</h2><p>WASD/pijlen/randen: camera · scroll: zoom · scrollknop slepen: draaien.<br>Links slepen: groep · dubbelklik: zelfde type in beeld · Shift: toevoegen.<br>Rechts: bewegen, aanvallen, laden/garrison, harvest; bij gebouw: verzamelvlag.<br>Ctrl + rechts: Force Fire · Shift + rechts: waypoints.<br>Ctrl + 1–9: groep opslaan; 1–9: selecteren, dubbel indrukken: centreren.<br>X: Attack-Move · G: Guard · K: Stop · F: Scatter · P: Patrol · Q: Waypoint.<br>Home: basis · Space: laatste aanval · E: alle eenheden · Esc: pauze.<br>Bouwen: houd links vast op de plek, sleep om te draaien en laat los.<br>Selecteer een bouwer of Command Center voor de bouwlijst. Barracks geven +20 populatieruimte. Supply units verzamelen geld. Capture-upgrade is nodig om gebouwen over te nemen. Hero's kunnen altijd capturen.</p><button id="back">Terug</button></div>`;
    $("#back").onclick = () => this.menu();
  }
  download(data, name) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  file(kind) {
    const input = $("#load-file");
    input.value = "";
    input.onchange = async () => {
      try {
        const data = JSON.parse(await input.files[0].text());
        if (kind === "map") {
          if (
            !Number.isFinite(data.size) ||
            data.size < 400 ||
            data.size > 2400 ||
            !Number.isFinite(data.seed) ||
            !["clear", "rain", "snow"].includes(data.weather)
          )
            throw Error(
              "Kaart vereist size 400–2400, seed en weather clear/rain/snow",
            );
          this.customMap = {
            ...data,
            name: String(data.name || "Custom map").slice(0, 80),
          };
          this.toast("Kaart geladen: " + this.customMap.name);
        } else {
          this.load(kind, data);
        }
      } catch (err) {
        this.toast("Laden mislukt: " + err.message);
      }
    };
    input.click();
  }
  selection(ids) {
    this.ids = ids;
    this.lastActions = "";
    this.refreshActions();
  }
  cameo(d, id) {
    if (id && this.view?.game)
      return this.view.portrait(id, buildings[id] ? "building" : "unit");
    return d.kind === "infantry"
      ? `${import.meta.env.BASE_URL}art/soldier.svg`
      : `${import.meta.env.BASE_URL}art/tank.svg`;
  }
  button(label, meta, fn, options = {}) {
    const b = document.createElement("button");
    b.className = options.icon ? "cameo-button" : "";
    b.innerHTML =
      (options.icon ? `<img src="${options.icon}" alt="">` : "") +
      `<strong>${escape(label)}</strong><span>${escape(meta || "")}</span>`;
    b.title = options.tooltip || label;
    b.disabled = !!options.disabled;
    b.onclick = fn;
    $("#actions").append(b);
  }
  refreshActions() {
    if (!this.game || !this.controls) return;
    const g = this.game,
      p = g.player,
      e = g.get(this.ids[0]);
    $("#actions").replaceChildren();
    $("#selection").textContent =
      this.ids.length > 1
        ? `${this.ids.length} eenheden`
        : e
          ? def(e)?.name || "Civilian"
          : "Basis bouwen";
    $("#description").textContent =
      e?.owner === 0
        ? e.kind === "building"
          ? `HP ${Math.ceil(e.hp)}/${e.maxHp} · ${e.progress < 1 ? "Bouw bezig" : "Rechts op kaart: verzamelvlag"}`
          : `${units[e.type]?.armor} · ${["Recruit", "Veteran", "Elite", "Heroic"][e.veterancy]}`
        : "Selecteer je bouwer of hoofdkwartier.";
    if (e?.owner === 0) {
      const d = def(e);
      if (e.kind === "building" && e.progress < 1)
        this.button("Bouw annuleren", "Ongebruikt bedrag terug", () => {
          this.controls.dispatch({ type: "cancel_build", id: e.id });
          this.controls.select([]);
        });
      if (e.kind === "building" && e.progress === 1) {
        for (const [id, u] of g.availableUnits(p, d.role)) {
          const missing = (u.prerequisites || []).filter((r) => !g.has(0, r));
          this.button(
            u.name,
            `${g.cost(0, u)} cr · ${u.population} pop · ${u.hotkey.toUpperCase()}`,
            () => this.controls.dispatch({ type: "train", id: e.id, unit: id }),
            {
              icon: this.cameo(u, id),
              tooltip: `${u.description}\nVereist: ${missing.join(", ") || "gereed"}`,
              disabled: missing.length > 0,
            },
          );
        }
        for (const [id, u] of Object.entries(upgrades))
          if (
            (u.faction === "all" || u.faction === p.faction) &&
            u.building === d.role &&
            !p.upgrades.includes(id)
          )
            this.button(u.name, `${u.cost} cr`, () =>
              this.controls.dispatch({
                type: "research",
                id: e.id,
                upgrade: id,
              }),
            );
        this.button(
          e.queuePaused ? "Productie hervatten" : "Productie pauzeren",
          "",
          () => this.controls.dispatch({ type: "queue_pause", id: e.id }),
        );
        this.button(
          e.repair ? "Reparatie stoppen" : "Repareren",
          "4 cr/s",
          () => this.controls.dispatch({ type: "repair", id: e.id }),
        );
        this.button("Verkopen", "50% terugbetaling", () => {
          this.controls.dispatch({ type: "sell", id: e.id });
          this.controls.select([]);
        });
        if (d.capacity)
          this.button("Uitladen", `${e.passengers.length} passagiers`, () =>
            this.controls.dispatch({ type: "unload", id: e.id }),
          );
        if (e.type === "tunnel")
          this.button("Tunneltransport", "Kies eigen uitgang", () =>
            this.controls.target({ tunnel: e.id }),
          );
        if (d.role === "super")
          this.button(
            "Superwapen afvuren",
            `${Math.ceil(Math.max(0, d.superTime - e.superCharge))}s`,
            () => this.controls.target({ super: e.id }),
          );
        if (d.role === "tech" && p.faction === "usa")
          for (const mode of ["bombard", "hold", "search"])
            this.button(
              {
                bombard: "Bombardment",
                hold: "Hold the Line",
                search: "Search & Destroy",
              }[mode],
              p.mode === mode ? "ACTIEF" : "",
              () => this.controls.dispatch({ type: "mode", id: e.id, mode }),
            );
      }
      if (e.kind === "unit") {
        for (const order of [
          "attackMove",
          "guard",
          "stop",
          "scatter",
          "patrol",
          "waypoint",
          "forceFire",
        ])
          this.button(
            {
              attackMove: "Attack-Move",
              guard: "Guard",
              stop: "Stop",
              scatter: "Scatter",
              patrol: "Patrol",
              waypoint: "Waypoint",
              forceFire: "Force Fire",
            }[order],
            this.controls.hotkeys[order] || "",
            () =>
              ["guard", "stop", "scatter"].includes(order)
                ? this.controls.order(order)
                : this.controls.target({ order }),
          );
        if (d.capture)
          this.button("Capture Building", "Vereist Capture-upgrade", () =>
            this.controls.target({ order: "capture" }),
          );
        if (d.kind === "infantry")
          this.button("Garrison / instappen", "Kies gebouw of transport", () =>
            this.controls.target({ order: "garrison" }),
          );
        if (d.collector)
          this.button("Supplies ophalen", "", () =>
            this.controls.order("harvest"),
          );
        if (d.capacity)
          this.button("Uitladen", `${e.passengers.length} passagiers`, () =>
            this.controls.dispatch({ type: "unload", id: e.id }),
          );
        for (const ability of d.abilities || [])
          this.button(
            ability.replaceAll("_", " "),
            ability.startsWith("overlord") ? "500 cr" : "",
            () =>
              ["camouflage", "disguise"].includes(ability) ||
              ability.startsWith("overlord") ||
              ability === "cash_hack"
                ? this.controls.dispatch({ type: "ability", id: e.id, ability })
                : this.controls.target({ ability, id: e.id }),
          );
      }
      if (d.builder || d.role === "hq") {
        for (const [id, b] of Object.entries(buildings))
          if (b.faction === p.faction) {
            const missing = b.prerequisites.filter((r) => !g.has(0, r));
            this.button(
              b.name,
              `${g.cost(0, b)} cr${b.population ? " · +" + b.population + " pop" : ""} · ${b.hotkey.toUpperCase()}`,
              () => this.controls.build(id),
              {
                icon: this.view.portrait(id, "building"),
                tooltip: `${b.description || b.name}\nVereist: ${missing.join(", ") || "gereed"} · power ${b.powerUse}`,
                disabled: missing.length > 0,
              },
            );
          }
      }
    }
    this.button("Selecteer alle eenheden", "E", () =>
      this.controls.select(
        g.units.filter((e) => e.owner === 0 && !e.inside).map((e) => e.id),
      ),
    );
  }
  update() {
    if (!this.game) return;
    const g = this.game,
      p = g.player;
    $("#resources").innerHTML =
      `<div><small>CREDITS · +${Math.round(p.income)}/s</small><b>${Math.floor(p.cash).toLocaleString("nl-NL")}</b></div><div><small>POPULATIE</small><b>${g.population(0)} / ${g.capacity(0)}</b></div><div><small>POWER</small><b class="${p.lowPower ? "danger" : ""}">${p.power} / ${p.powerUse}</b></div>`;
    $("#rank").textContent =
      `Rang ${p.rank}/5 · XP ${Math.floor(p.xp)} · ${p.points} General Points`;
    const e = g.get(this.ids[0]),
      q = e?.queue?.[0];
    $("#queue").replaceChildren();
    if (e?.owner === 0 && e.kind === "building") {
      e.queue.forEach((q, i) => {
        const b = document.createElement("button");
        b.textContent = `${q.kind === "unit" ? units[q.type].name : upgrades[q.type].name} · ${i === 0 ? Math.ceil(q.remaining) + "s" : "wacht"} ×`;
        b.title = "Annuleren: volledige terugbetaling";
        b.onclick = () =>
          this.controls.dispatch({ type: "cancel", id: e.id, index: i });
        $("#queue").append(b);
      });
    }
    const prod = $("#production"),
      preview =
        e?.owner === 0 && e.kind === "building"
          ? g.availableUnits(p, buildings[e.type].role)[0]?.[1]
          : null;
    prod.hidden = !(e?.owner === 0 && e.kind === "building" && (q || preview));
    if (!prod.hidden) {
      const d = q
        ? q.kind === "unit"
          ? units[q.type]
          : upgrades[q.type]
        : preview;
      prod.innerHTML = `<span class="production-label">${q ? (e.queuePaused ? "GEPAUZEERD" : "IN PRODUCTIE") : "STANDBY"}</span><h3>${escape(d.name)}</h3><div class="progress-track"><div style="width:${q ? 100 * (1 - q.remaining / q.total) : 0}%"></div></div><p>${q ? Math.ceil(q.remaining) + "s · " + e.queue.length + " in wachtrij" : "Klaar voor productie"}</p>`;
    }
    const portraitType = q?.kind === "unit" ? q.type : e?.type;
    if (portraitType && portraitType !== this.lastPortrait) {
      this.lastPortrait = portraitType;
      $("#selected-portrait").src = this.view.portrait(
        portraitType,
        buildings[portraitType] ? "building" : "unit",
        e?.owner ?? 0,
      );
      $("#selected-portrait").alt =
        (units[portraitType] || buildings[portraitType])?.name || "Civilian";
    }
    $("#selected-portrait").hidden = !portraitType;
    $("#portrait-caption").textContent = portraitType
      ? (units[portraitType] || buildings[portraitType])?.name || "FIELD UNIT"
      : "NO SELECTION";
    $("#general-points").textContent = p.points;
    const signature = JSON.stringify([
      this.ids,
      e?.owner,
      e?.progress === 1,
      p.upgrades,
      p.mode,
      e?.passengers.length,
      p.cash > 100,
      g.buildings
        .filter((b) => b.owner === 0 && b.progress === 1)
        .map((b) => b.type)
        .join("|"),
    ]);
    if (signature !== this.lastActions) {
      this.lastActions = signature;
      this.refreshActions();
    }
    $("#powers").replaceChildren();
    for (const [id, d] of Object.entries(powers))
      if (d.faction === "all" || d.faction === p.faction) {
        const b = document.createElement("button");
        const unlocked = p.unlocked.includes(id);
        b.textContent = unlocked
          ? `${d.name} ${p.cooldowns[id] > 0 ? Math.ceil(p.cooldowns[id]) + "s" : "✦"}`
          : `+ ${d.name} · rang ${d.rank}`;
        b.title = d.description + " · " + d.points + " GP";
        b.disabled = unlocked
          ? p.cooldowns[id] > 0
          : p.rank < d.rank || p.points < d.points;
        b.onclick = () =>
          unlocked
            ? this.controls.target({ power: id })
            : this.controls.dispatch({ type: "unlock", power: id });
        $("#powers").append(b);
      }
    $("#super-timers").innerHTML = g.buildings
      .filter((b) => buildings[b.type].role === "super")
      .map(
        (b) =>
          `<p class="${b.owner === 0 ? "" : "danger"}">${escape(buildings[b.type].name)} · P${b.owner + 1} · ${Math.ceil(Math.max(0, buildings[b.type].superTime - b.superCharge))}s</p>`,
      )
      .join("");
    $("#objectives").innerHTML = g
      .objectives()
      .map((o) => `<div>${o.done ? "✓" : "○"} ${escape(o.id)}</div>`)
      .join("");
    this.view.minimap($("#minimap"));
    if (g.result && !this.gameOverShown) {
      this.gameOverShown = true;
      this.overlay.hidden = false;
      this.overlay.innerHTML = `<div class="dialog"><small>OPERATION COMPLETE</small><h2>${g.result === "victory" ? "Overwinning" : "Verslagen"}</h2><p>Kills: ${g.stats.kills} · Verliezen: ${g.stats.losses}<br>Gebouwen: ${g.stats.built} · Inkomen: ${Math.round(g.stats.income)}<br>Tijd: ${Math.floor(g.time)} seconden</p><button id="replay-export">Replay downloaden</button><button id="main-menu">Hoofdmenu</button></div>`;
      $("#main-menu").onclick = () => this.menu();
      $("#replay-export").onclick = () =>
        this.download(g.replay(), "generals-replay.json");
    }
  }
}
