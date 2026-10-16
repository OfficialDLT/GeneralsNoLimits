import { economyMethods } from "./economy.js";
import { combatMethods } from "./combat.js";
import { ordersMethods } from "./orders.js";
import { aiMethods } from "./ai.js";
import { aircraftMethods } from './aircraft.js';
import { AIRFIELD } from '../config/airfield.js';
import { formationOffset } from './formations.js';
import { visionMethods } from "./vision.js";
import {
  factions,
  units,
  buildings,
  upgrades,
  powers,
  combat,
  maps,
  missions,
  definition as def,
} from "../config/index.js";
import { SpatialHash, Pool } from "./spatial.js";
import { Navigation, distance, clamp, water, cliff, height, townLots } from "./world.js";
const alive = (e) => e.hp > 0;
export class Game {
  constructor(settings = {}) {
    this.settings = {
      faction: "usa",
      subfaction: "standard",
      map: "medium",
      cash: 8000,
      players: 2,
      team: 0,
      difficulty: "medium",
      mode: "skirmish",
      seed: 42,
      handicap: 1,
      ...settings,
    };
    this.map =
      typeof this.settings.map === "object"
        ? structuredClone(this.settings.map)
        : structuredClone(maps[this.settings.map] || maps.medium);
    this.seed = this.settings.seed;
    this.time = 0;
    this.tick = 0;
    this.nextId = 1;
    this.entities = [];
    this.knownBuildings = {};
    this.byId = new Map();
    this.effectCache = new Map();
    this.supplies = [];
    this.crates = [];
    this.projectiles = [];
    this.fields = [];
    this.events = [];
    this.log = [];
    this.result = null;
    this.paused = false;
    this.speed = 1;
    this.stats = { kills: 0, losses: 0, built: 0, income: 0 };
    this.replayCommands = null;
    this.replayIndex = 0;
    this.spatial = new SpatialHash();
    this.pool = new Pool(() => ({}));
    this.nav = new Navigation(this.map);
    this.navTimer = 0;
    this.fogTimer = 0;
    this.aiTimer = 0;
    this.environment = { day: 0, weather: this.map.weather };
    const count = clamp(Number(this.settings.players) || 2, 1, 8);
    this.players = Array.from({ length: count }, (_, id) => {
      const f =
        id === 0
          ? this.settings.faction
          : this.settings.mode === "campaign" && id === 1
            ? missions[this.settings.faction].enemy
            : id % 3 === 0
              ? "gla"
              : id % 3 === 1
                ? "china"
                : "usa";
      return {
        id,
        faction: f,
        color:
          id === 0
            ? factions[f].color
            : [
                "",
                "#ff765e",
                "#d2a6ff",
                "#ffc865",
                "#7cf1da",
                "#ff95cb",
                "#80bffe",
                "#becd7a",
              ][id],
        subfaction: id === 0 ? this.settings.subfaction : "standard",
        team: id === 0 ? 0 : this.settings.team && id === 1 ? 0 : id,
        cash: Number(this.settings.cash),
        xp: 0,
        points: 1,
        rank: 1,
        upgrades: [],
        unlocked: [],
        cooldowns: {},
        power: 0,
        powerUse: 0,
        lowPower: false,
        income: 0,
        earned: 0,
        incomeSample: 0,
        mode: "search",
        handicap: id === 0 ? Number(this.settings.handicap) : this.settings.difficulty === 'super_easy' ? 0.3 : 1,
        eliminated: false,
      };
    });
    this.fogSize = 64;
    this.explored = new Uint8Array(4096);
    this.visible = new Uint8Array(4096);
    this.initialize();
  }
  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  get player() {
    return this.players[0];
  }
  get buildings() {
    return this.entities.filter((e) => e.kind === "building" && alive(e));
  }
  get units() {
    return this.entities.filter((e) => e.kind === "unit" && alive(e));
  }
  get(id) {
    const e = this.byId.get(id);
    return e && alive(e) ? e : undefined;
  }
  emit(type, data = {}) {
    this.events.push({ type, time: this.time, ...data });
    if (this.events.length > 500) this.events.shift();
  }
  drain() {
    return this.events.splice(0);
  }
  enemy(a, b) {
    return a >= 0 && b >= 0 && this.players[a].team !== this.players[b].team;
  }
  initialize() {
    const radius =
      this.players.length === 1 ? this.map.size * 0.27 : this.map.size * 0.32;
    for (const p of this.players) {
      const angle = Math.PI / 8 + (Math.PI * 2 * p.id) / this.players.length,
        x = Math.cos(angle) * radius,
        z = Math.sin(angle) * radius;
      p.home = { x, z };
      this.add(p.faction + "_hq", p.id, x, z, true);
      this.add(p.faction + "_barracks", p.id, x - 55, z, true);
      this.add(p.faction + "_factory", p.id, x + 55, z, true);
      this.add(p.faction + "_supply", p.id, x, z + 55, true);
      if (p.faction !== "gla")
        this.add(p.faction + "_power", p.id, x - 55, z + 55, true);
      this.add(factions[p.faction].builder, p.id, x - 30, z - 35);
      const collector = this.add(
        factions[p.faction].collector,
        p.id,
        x + 20,
        z + 75,
      );
      collector.order = { type: "harvest" };
      for (let i = 0; i < 3; i++)
        this.add(
          { usa: "ranger", china: "red_guard", gla: "rebel" }[p.faction],
          p.id,
          x - 20 + i * 7,
          z - 45,
        );
      this.add(
        { usa: "crusader", china: "battlemaster", gla: "scorpion" }[p.faction],
        p.id,
        x + 20,
        z - 40,
      );
      this.supplies.push({
        id: this.nextId++,
        x: x + 45,
        z: z + 110,
        amount: 20000,
      });
    }
    const neutral = [
      ["civilian", -80, 30],
      ["civilian", 75, 15],
      ["oil", -100, -90],
      ["hospital", 100, -90],
      ["repair_bay", -100, 110],
      ["reinforcement", 100, 110],
      ["neutral_airfield", -180, 0],
      ["refinery", 180, 0],
    ];
    for (const [type, x, z] of neutral) {
      this.add(type, -1, x, z, true);
    }
    for (const lot of townLots(this.map)) this.add(lot.type, -1, lot.x, lot.z, true);
    if (this.map.town) {
      for (let i = 0; i < 6; i++)
        this.add('civilian_unit', -1, this.map.town.x + i * 12, this.map.town.z);
      for (const side of [-1, 1]) this.supplies.push({
        id: this.nextId++, x: side * this.map.size * 0.2, z: this.map.size * 0.2, amount: 40000,
      });
    }
    this.add("civilian_unit", -1, 40, 70); // explicit harmless civilian type below
    this.crates.push(
      ...["cash", "heal", "veterancy", "upgrade", "reveal"].map((type, i) => ({
        id: this.nextId++,
        type,
        x: -160 + i * 75,
        z: -160,
      })),
    );
    this.updatePower();
    this.updateFog();
    this.nav.rebuild(this.buildings);
    this.spatial.rebuild(this.entities);
  }
  add(type, owner, x, z, complete = true) {
    const d =
      buildings[type] ||
      units[type] ||
      (type === "civilian_unit"
        ? {
            hp: 70,
            kind: "infantry",
            armor: "Infantry",
            radius: 2,
            speed: 8,
            population: 0,
            sight: 0,
            damage: 0,
          }
        : null);
    if (!d) throw Error("Unknown type " + type);
    const isBuilding = !!buildings[type];
    const e = {
      id: this.nextId++,
      kind: isBuilding ? "building" : "unit",
      type,
      owner,
      x,
      z,
      rotation: 0,
      hp: complete ? d.hp : d.hp * 0.15,
      maxHp: d.hp,
      radius: d.radius || 2,
      progress: complete ? 1 : 0,
      queue: [],
      queuePaused: false,
      rallyPoint: null,
      order: { type: "guard" },
      path: [],
      pathGoal: null,
      cooldown: 0,
      xp: 0,
      veterancy: 0,
      inside: null,
      passengers: [],
      status: {},
      ammo: d.ammo ?? null,
      attachments: [],
      captureProgress: 0,
      repair: false,
      superCharge: 0,
      incomeClock: 0,
      salvage: 0,
      mode: "search",
    };
    this.entities.push(e);
    this.byId.set(e.id, e);
    return e;
  }

  command(c, record = true) {
    if (this.result) return "Spel afgelopen";
    if (record) {
      this.log.push({ tick: this.tick, ...structuredClone(c) });
    }
    const owner = c.owner ?? 0,
      p = this.players[owner];
    if (!p) return "Onbekende speler";
    const e = this.get(c.id),
      owned = e?.owner === owner;
    switch (c.type) {
      case "speed":
        this.speed = clamp(Number(c.value) || 1, 0.5, 4);
        return null;
      case "weather":
        if (["clear", "rain", "snow"].includes(c.value)) {
          this.environment.weather = c.value;
          return null;
        }
        break;
      case "build": {
        const error = this.canBuild(c.building, owner, c.x, c.z);
        if (error) return error;
        const d = buildings[c.building];
        p.cash -= this.cost(owner, d);
        const b = this.add(c.building, owner, c.x, c.z, false);
        b.rotation = c.rotation || 0;
        b.builder = this.units
          .filter(
            (u) => u.owner === owner && units[u.type]?.builder && !u.inside,
          )
          .sort((a, b) => distance(a, c) - distance(b, c))[0].id;
        this.command(
          {
            type: "order",
            ids: [b.builder],
            order: "build",
            targetId: b.id,
            owner,
          },
          false,
        );
        this.emit("build_start", { id: b.id });
        this.stats.built += owner === 0 ? 1 : 0;
        return null;
      }
      case "train": {
        const d = units[c.unit];
        if (
          !owned ||
          !d ||
          e.progress < 1 ||
          d.faction !== p.faction ||
          (d.subfaction && d.subfaction !== p.subfaction) ||
          d.producer !== buildings[e.type]?.role
        )
          return "Geen geldig productiegebouw";
        if (!this.requirements(owner, d)) return "Vereiste gebouwen ontbreken";
        if (e.queue.length >= 8) return "Wachtrij vol";
        if (d.kind === 'air' && d.ammo != null) {
          const capacity = this.buildings.filter(b => b.owner === owner && b.progress === 1 && buildings[b.type].role === 'airfield').length * AIRFIELD.capacity;
          const reserved = this.units.filter(u => u.owner === owner && units[u.type]?.ammo != null).length +
            this.buildings.filter(b => b.owner === owner).reduce((n, b) => n + b.queue.filter(q => q.kind === 'unit' && units[q.type]?.ammo != null).length, 0);
          if (reserved >= capacity) return 'Hangars vol: bouw een extra vliegveld (vier vliegtuigen per basis)';
        }
        if (
          d.hero &&
          (this.units.some((u) => u.owner === owner && u.type === c.unit) ||
            this.buildings.some(
              (b) =>
                b.owner === owner && b.queue.some((q) => q.type === c.unit),
            ))
        )
          return "Hero al aanwezig";
        const cost = this.cost(owner, d);
        if (p.cash < cost) return "Onvoldoende credits";
        if (this.population(owner) + d.population > this.capacity(owner))
          return "Bouw barracks voor meer populatieruimte";
        p.cash -= cost;
        e.queue.push({
          kind: "unit",
          type: c.unit,
          total: d.seconds,
          remaining: d.seconds,
          cost,
        });
        return null;
      }
      case "research": {
        const d = upgrades[c.upgrade];
        if (
          !owned ||
          !d ||
          (d.faction !== "all" && d.faction !== p.faction) ||
          d.building !== buildings[e.type]?.role
        )
          return "Geen geldig onderzoeksgebouw";
        if (
          p.upgrades.includes(c.upgrade) ||
          this.buildings.some(
            (b) =>
              b.owner === owner && b.queue.some((q) => q.type === c.upgrade),
          )
        )
          return "Upgrade al onderzocht of bezig";
        if (p.cash < d.cost) return "Onvoldoende credits";
        if (e.queue.length >= 8) return "Wachtrij vol";
        p.cash -= d.cost;
        e.queue.push({
          kind: "upgrade",
          type: c.upgrade,
          total: d.seconds,
          remaining: d.seconds,
          cost: d.cost,
        });
        return null;
      }
      case "cancel_build":
        if (owned && e.kind === "building" && e.progress < 1) {
          p.cash += this.cost(owner, buildings[e.type]) * (1 - e.progress);
          const builder = this.get(e.builder);
          if (builder) builder.order = { type: "guard" };
          this.destroy(e, null, true);
          return null;
        }
        break;
      case "cancel":
        if (owned) {
          const q = e.queue.splice(c.index ?? 0, 1)[0];
          if (q) p.cash += q.cost;
          return null;
        }
        break;
      case "queue_pause":
        if (owned) {
          e.queuePaused = !e.queuePaused;
          return null;
        }
        break;
      case "sell":
        if (owned && e.kind === "building") {
          p.cash +=
            this.cost(owner, buildings[e.type]) * 0.5 * e.progress +
            e.queue.reduce((n, q) => n + q.cost, 0);
          e.queue = [];
          this.destroy(e, null, true);
          return null;
        }
        break;
      case "repair":
        if (owned && e.kind === "building") {
          e.repair = !e.repair;
          return null;
        }
        break;
      case "rally":
        if (owned && e.kind === "building") {
          e.rallyPoint = { x: c.x, z: c.z };
          return null;
        }
        break;
      case "mode":
        if (owned) {
          if (buildings[e.type]?.role === "tech") p.mode = c.mode;
          return null;
        }
        break;
      case "order": {
        const list = (c.ids || [])
          .map((id) => this.get(id))
          .filter(
            (u) => u && u.owner === owner && u.kind === "unit" && !u.inside,
          );
        const center = list.reduce((p, u) => ({ x: p.x + u.x / list.length, z: p.z + u.z / list.length }), { x: 0, z: 0 });
        const facing = Math.atan2((c.x ?? center.x) - center.x, (c.z ?? center.z) - center.z);
        const spacing = Math.max(12, ...list.map(u => (u.radius || 2) * 2 + 4));
        const ground = list.filter(u => units[u.type]?.kind !== 'air');
        const formationSpeed = c.formation && ground.length > 1 ? Math.min(...ground.map(u => units[u.type]?.speed || 24)) : null;
        list.forEach((u, i) => {
          const order = {
            type: c.order,
            x: clamp(c.x ?? u.x, -this.map.size / 2 + 5, this.map.size / 2 - 5),
            z: clamp(c.z ?? u.z, -this.map.size / 2 + 5, this.map.size / 2 - 5),
            targetId: c.targetId,
          };
          if (
            ["move", "attackMove", "scatter", "patrol", "waypoint"].includes(
              c.order,
            ) &&
            list.length > 1
          ) {
            if (units[u.type]?.kind !== 'air') order.formationSpeed = formationSpeed;
            const offset = formationOffset(i, list.length, c.formation, spacing);
            order.x += offset.x * Math.cos(facing) + offset.z * Math.sin(facing);
            order.z += -offset.x * Math.sin(facing) + offset.z * Math.cos(facing);
            order.x = clamp(order.x, -this.map.size / 2 + 5, this.map.size / 2 - 5);
            order.z = clamp(order.z, -this.map.size / 2 + 5, this.map.size / 2 - 5);
          }
          if (c.order === "patrol") order.origin = { x: u.x, z: u.z };
          if (c.order === "scatter") {
            order.x = u.x + (this.random() - 0.5) * 70;
            order.z = u.z + (this.random() - 0.5) * 70;
          }
          if (c.order === "waypoint") {
            u.waypoints ??= [];
            u.waypoints.push({ x: order.x, z: order.z });
            if (u.order.type === "move") return;
            order.type = "move";
          } else u.waypoints = [];
          u.order = order;
          u.path = [];
          u.pathGoal = null;
          u.status.camouflage = false;
        });
        return null;
      }
      case "unload":
        if (owned) {
          this.unload(e);
          return null;
        }
        break;
      case "tunnel":
        if (owned && e.type === "tunnel") {
          const exit = this.get(c.targetId);
          if (exit?.type === "tunnel" && exit.owner === owner) {
            for (const id of [...e.passengers]) {
              const u = this.get(id);
              if (u) {
                u.inside = exit.id;
                u.x = exit.x;
                u.z = exit.z;
                exit.passengers.push(id);
              }
            }
            e.passengers = [];
            this.unload(exit);
            return null;
          }
        }
        break;
      case "ability":
        if (owned) {
          return this.ability(e, c.ability, c.targetId);
        }
        break;
      case "unlock": {
        const d = powers[c.power];
        if (!d || (d.faction !== "all" && d.faction !== p.faction))
          return "Verkeerde factie";
        if (p.rank < d.rank || p.points < d.points)
          return "Onvoldoende rang of General Points";
        if (p.unlocked.includes(c.power)) return "Al ontgrendeld";
        p.points -= d.points;
        p.unlocked.push(c.power);
        return null;
      }
      case "power":
        return this.power(owner, c.power, c.x, c.z);
      case "super":
        if (owned && buildings[e.type]?.role === "super") {
          const d = buildings[e.type];
          if (e.superCharge < d.superTime) return "Superwapen laadt nog";
          e.superCharge = 0;
          this.blast(
            c.x,
            c.z,
            d.superRadius,
            d.superDamage,
            d.damageType,
            owner,
            e,
          );
          this.emit("superweapon", { x: c.x, z: c.z, owner });
          if (d.damageType !== "Laser")
            this.fields.push({
              x: c.x,
              z: c.z,
              radius: d.superRadius * 0.7,
              time: 25,
              damage: 12,
              type: d.damageType,
              owner,
            });
          return null;
        }
        break;
    }
    return "Ongeldig commando";
  }

  step(dt = 0.1) {
    if (this.paused || this.result) return;
    dt *= this.speed;
    this.environment.day = this.time / 180;
    if (this.replayCommands) {
      while (
        this.replayIndex < this.replayCommands.length &&
        this.replayCommands[this.replayIndex].tick <= this.tick
      ) {
        this.command(this.replayCommands[this.replayIndex++], false);
      }
    }
    this.time += dt;
    this.tick++;
    this.updatePower();
    this.spatial.rebuild(this.entities);
    this.navTimer -= dt;
    if (this.navTimer <= 0) {
      this.navTimer = 1;
      this.nav.rebuild(this.buildings);
    }
    for (const p of this.players) {
      for (const k in p.cooldowns)
        p.cooldowns[k] = Math.max(0, p.cooldowns[k] - dt);
      if (this.time - p.incomeSample >= 5) {
        p.income = (p.earned - (p.lastEarned || 0)) / 5;
        p.lastEarned = p.earned;
        p.incomeSample = this.time;
      }
    }
    for (const e of this.entities) {
      if (!alive(e)) continue;
      for (const key in e.status)
        if (typeof e.status[key] === "number") {
          e.status[key] -= dt;
          if (e.status[key] <= 0) delete e.status[key];
        }
      if (e.inside) {
        const container = this.get(e.inside);
        if (!container) {
          e.inside = null;
        } else {
          e.x = container.x;
          e.z = container.z;
          e.hp = Math.min(e.maxHp, e.hp + (def(container)?.heal || 0) * dt);
          continue;
        }
      }
      e.damageState =
        e.hp / e.maxHp > 0.65
          ? "pristine"
          : e.hp / e.maxHp > 0.3
            ? "damaged"
            : "reallydamaged";
      if (e.kind === "building") this.stepBuilding(e, dt);
      else this.stepUnit(e, dt);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i],
        target = this.get(p.targetId);
      if (p.homing && target) {
        p.tx = target.x;
        p.tz = target.z;
      }
      p.remaining -= dt;
      if (p.remaining <= 0) {
        if (p.splash)
          this.blast(
            p.tx,
            p.tz,
            p.splash,
            p.damage,
            p.damageType,
            p.owner,
            this.get(p.source),
          );
        else if (target)
          this.damage(target, p.damage, p.damageType, this.get(p.source));
        this.emit("impact", {
          x: p.tx,
          z: p.tz,
          radius: p.splash || 3,
          damageType: p.damageType,
        });
        if (["Flame", "Toxin", "Radiation"].includes(p.damageType))
          this.fields.push({
            x: p.tx,
            z: p.tz,
            radius: p.splash || 12,
            time: 7,
            damage: 8,
            type: p.damageType,
            owner: p.owner,
          });
        this.projectiles.splice(i, 1);
        this.pool.release(p);
      }
    }
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      f.time -= dt;
      for (const e of this.spatial.query(f.x, f.z, f.radius))
        if (
          f.type === "mine" ? this.enemy(f.owner, e.owner) : e.owner !== f.owner
        ) {
          this.damage(
            e,
            f.type === "mine" ? f.damage : f.damage * dt,
            f.type === "mine" ? "Explosion" : f.type,
            null,
          );
          if (f.type === "mine") {
            f.time = 0;
            this.emit("impact", { x: f.x, z: f.z, radius: 12 });
            break;
          }
        }
      if (f.time <= 0) {
        if (
          f.type === "hole" &&
          this.buildings.some((b) => b.owner === f.owner) &&
          !this.buildings.some((b) => distance(b, f) < b.radius + 12)
        ) {
          const b = this.add(f.building, f.owner, f.x, f.z, true);
          b.hp = b.maxHp * 0.4;
          this.emit("rebuild", { id: b.id, owner: f.owner });
        }
        this.fields.splice(i, 1);
      }
    }
    this.fogTimer -= dt;
    if (this.fogTimer <= 0) {
      this.fogTimer = 0.35;
      this.updateFog();
    }
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = 2;
      this.ai();
    }
    this.checkVictory();
    if (this.replayCommands && this.replayEnd && this.tick >= this.replayEnd) {
      this.paused = true;
      this.emit("replay_complete");
    }
  }

  save() {
    return {
      version: 1,
      settings: this.settings,
      state: JSON.parse(
        JSON.stringify({
          time: this.time,
          tick: this.tick,
          nextId: this.nextId,
          seed: this.seed,
          entities: this.entities,
          knownBuildings: this.knownBuildings,
          supplies: this.supplies,
          crates: this.crates,
          projectiles: this.projectiles,
          fields: this.fields,
          players: this.players,
          stats: this.stats,
          log: this.log,
          explored: [...this.explored],
          visible: [...this.visible],
          environment: this.environment,
          result: this.result,
          speed: this.speed,
        }),
      ),
    };
  }
  static load(data) {
    if (data.version !== 1) throw Error("Onbekend saveformaat");
    if (
      !Array.isArray(data.state?.entities) ||
      !Array.isArray(data.state?.players) ||
      data.state.players.length < 1 ||
      data.state.players.length > 8 ||
      data.state.explored?.length !== 4096 ||
      data.state.visible?.length !== 4096 ||
      data.state.entities.some(
        (e) =>
          (!units[e.type] &&
            !buildings[e.type] &&
            e.type !== "civilian_unit") ||
          !Number.isFinite(e.x) ||
          !Number.isFinite(e.z),
      )
    )
      throw Error("Ongeldige savegegevens");
    const g = new Game(data.settings);
    Object.assign(g, data.state);
    g.knownBuildings = data.state.knownBuildings || {};
    g.byId = new Map(g.entities.map((e) => [e.id, e]));
    g.effectCache = new Map();
    g.explored = Uint8Array.from(data.state.explored);
    g.visible = Uint8Array.from(data.state.visible);
    g.projectiles = data.state.projectiles || [];
    g.events = [];
    g.nav.rebuild(g.buildings);
    g.spatial.rebuild(g.entities);
    return g;
  }
  replay() {
    return {
      version: 1,
      settings: this.settings,
      endTick: this.tick,
      commands: this.log,
    };
  }
  static fromReplay(data) {
    if (data.version !== 1 || !Array.isArray(data.commands))
      throw Error("Ongeldig replaybestand");
    const g = new Game(data.settings);
    g.replayCommands = data.commands;
    g.replayEnd = data.endTick || null;
    return g;
  }
}

Object.assign(
  Game.prototype,
  economyMethods,
  combatMethods,
  ordersMethods,
  aircraftMethods,
  aiMethods,
  visionMethods,
);
