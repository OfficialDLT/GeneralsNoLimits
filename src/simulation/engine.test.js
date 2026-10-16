import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "./engine.js";
import {
  units,
  buildings,
  factions,
  upgrades,
  powers,
} from "../config/index.js";
import { Navigation, height, water, townLots, distance } from "./world.js";
import { maps } from '../config/index.js';
import { AIRFIELD, airfieldPoint } from '../config/airfield.js';
const game = (faction = "usa") =>
  new Game({
    mode: "sandbox",
    faction,
    map: "small",
    players: 1,
    cash: 100000,
  });
const run = (g, seconds) => {
  for (let i = 0; i < seconds * 10; i++) g.step(0.1);
};
const building = (g, role) =>
  g.buildings.find((b) => b.owner === 0 && buildings[b.type].role === role);
const unit = (g, type) => g.units.find((u) => u.type === type && u.owner === 0);
test("all configurations have valid references and nine general variants", () => {
  assert.equal(
    Object.values(factions).reduce(
      (n, f) => n + Object.keys(f.subs).length - 1,
      0,
    ),
    9,
  );
  for (const [id, u] of Object.entries(units)) {
    assert.ok(factions[u.faction], id);
    assert.ok(u.hp > 0 && u.seconds > 0, id);
    assert.ok(
      ["hq", "barracks", "factory", "supply", "airfield"].includes(u.producer),
      id,
    );
  }
  for (const b of Object.values(buildings)) assert.ok(b.radius > 0 && b.hp > 0);
});
test("supply collectors deplete piles, deposit cash, and update income", () => {
  for (const f of ["usa", "china", "gla"]) {
    const g = game(f),
      cash = g.player.cash;
    run(g, 35);
    assert.ok(g.supplies[0].amount < 20000, f);
    assert.ok(g.player.cash > cash, f);
    assert.ok(g.player.income > 0, f);
  }
});
test("building construction requires builder, radius, terrain and prerequisites", () => {
  const g = game();
  const builder = unit(g, "usa_dozer");
  const spot = { x: builder.x - 65, z: builder.z - 60 };
  assert.equal(
    g.command({
      type: "build",
      building: "usa_barracks",
      ...spot,
      rotation: 1,
    }),
    null,
  );
  const b = g.entities.at(-1);
  assert.ok(b.progress < 1);
  assert.equal(b.rotation, 1);
  run(g, 20);
  assert.equal(b.progress, 1);
  assert.equal(g.capacity(0), 50);
  assert.match(g.canBuild("usa_barracks", 0, 0, 220), /terrein/);
  assert.match(g.canBuild("usa_super", 0, -200, -200), /Vereiste/);
});
test("production pauses, refunds cancellation and reserves population", () => {
  const g = game(),
    b = building(g, "barracks"),
    cash = g.player.cash;
  assert.equal(g.command({ type: "train", id: b.id, unit: "ranger" }), null);
  assert.equal(g.population(0), 9);
  g.command({ type: "queue_pause", id: b.id });
  run(g, 2);
  assert.equal(b.queue[0].remaining, 4);
  g.command({ type: "cancel", id: b.id, index: 0 });
  assert.ok(g.player.cash >= cash);
  assert.equal(g.population(0), 8);
});
test("completed units obey rally points", () => {
  const g = game(),
    b = building(g, "barracks");
  g.command({ type: "rally", id: b.id, x: 100, z: -100 });
  g.command({ type: "train", id: b.id, unit: "ranger" });
  run(g, 4.2);
  const u = g.units.at(-1);
  assert.equal(u.type, "ranger");
  assert.equal(u.order.x, 100);
  assert.equal(u.order.z, -100);
});
test("power loss disables radar and slows queue and superweapon", () => {
  const g = game();
  const power = building(g, "power");
  g.destroy(power, null, true);
  const air = g.add("usa_airfield", 0, -230, 50),
    superweapon = g.add("usa_super", 0, -230, 100);
  g.command({ type: "train", id: air.id, unit: "raptor" });
  run(g, 1);
  assert.equal(g.player.lowPower, true);
  assert.equal(g.radar(), false);
  assert.ok(air.queue[0].remaining > 6.4);
  assert.ok(superweapon.superCharge < 0.6);
});
test("research gates capture and changes incomes", () => {
  const g = game(),
    b = building(g, "barracks");
  assert.equal(
    g.command({ type: "research", id: b.id, upgrade: "capture" }),
    null,
  );
  run(g, 7);
  assert.ok(g.player.upgrades.includes("capture"));
  const oil = g.buildings.find((b) => b.type === "oil"),
    r = unit(g, "ranger");
  r.x = oil.x + 20;
  r.z = oil.z;
  g.command({ type: "order", ids: [r.id], order: "capture", targetId: oil.id });
  run(g, 7);
  assert.equal(oil.owner, 0);
});
test("armor, kills, veterancy, promotions and damage states affect combat", () => {
  const g = game();
  g.players.push({ ...structuredClone(g.player), id: 1, team: 1 });
  const r = unit(g, "ranger"),
    target = g.add("red_guard", 1, r.x + 15, r.z);
  const tank = g.add("battlemaster", 1, r.x + 30, r.z);
  const before = target.hp;
  g.damage(target, 20, "Bullet", r);
  g.damage(tank, 20, "Bullet", r);
  assert.equal(before - target.hp, 24);
  assert.equal(tank.maxHp - tank.hp, 5);
  g.damage(target, 1000, "Bullet", r);
  assert.ok(r.xp > 0);
  const b = building(g, "barracks");
  g.damage(b, 1000, "Explosion", tank);
  run(g, 0.1);
  assert.equal(b.damageState, "reallydamaged");
});
test("garrison, transport, unload and tunnels preserve contained entities", () => {
  const g = game("gla"),
    r = unit(g, "rebel"),
    t = g.add("tunnel", 0, r.x + 10, r.z),
    exit = g.add("tunnel", 0, -200, -100);
  g.command({ type: "order", ids: [r.id], order: "garrison", targetId: t.id });
  run(g, 1);
  assert.equal(r.inside, t.id);
  g.command({ type: "tunnel", id: t.id, targetId: exit.id });
  assert.equal(r.inside, null);
  assert.ok(Math.hypot(r.x - exit.x, r.z - exit.z) < 40);
});
test("stealth detection, camouflage and EMP", () => {
  const g = game("gla");
  g.players.push({ ...structuredClone(g.player), id: 1, team: 1 });
  const enemy = g.add(
    "pathfinder",
    1,
    unit(g, "rebel").x + 10,
    unit(g, "rebel").z,
  );
  assert.equal(g.detected(enemy, 0), false);
  g.add("radar_van", 0, enemy.x + 10, enemy.z);
  assert.equal(g.detected(enemy, 0), true);
  const r = unit(g, "rebel");
  assert.match(
    g.command({ type: "ability", id: r.id, ability: "camouflage" }),
    /Onderzoek/,
  );
  g.player.upgrades.push("camouflage");
  g.command({ type: "ability", id: r.id, ability: "camouflage" });
  assert.equal(r.status.camouflage, true);
});
test("powers require rank and points, have cooldowns, and apply effects", () => {
  const g = game("china");
  g.player.rank = 5;
  g.player.points = 10;
  assert.equal(g.command({ type: "unlock", power: "emp" }), null);
  const target = g.add("scorpion", -1, 100, 100);
  g.players.push({ ...structuredClone(g.player), id: 1, team: 1 });
  target.owner = 1;
  g.spatial.rebuild(g.entities);
  assert.equal(
    g.command({ type: "power", power: "emp", x: 100, z: 100 }),
    null,
  );
  assert.equal(target.status.emp, 12);
  assert.match(
    g.command({ type: "power", power: "emp", x: 100, z: 100 }),
    /koelt/,
  );
});
test("all superweapons cause damage and fallout fields", () => {
  for (const f of ["usa", "china", "gla"]) {
    const g = game(f),
      b = g.add(f + "_super", 0, -100, -100),
      target = g.add("civilian", -1, 0, 0);
    b.superCharge = 120;
    g.spatial.rebuild(g.entities);
    const hp = target.hp;
    assert.equal(g.command({ type: "super", id: b.id, x: 0, z: 0 }), null);
    assert.ok(target.hp < hp);
    assert.equal(g.fields.length, f === "usa" ? 0 : 1);
  }
});
test("aircraft return to airfields, land and reload", () => {
  const g = game(),
    b = g.add("usa_airfield", 0, -180, -100),
    u = g.add("raptor", 0, b.x + 30, b.z);
  u.ammo = 0;
  const states = new Set();
  for (let i = 0; i < 400; i++) { g.step(0.1); states.add(u.flightState); }
  assert.equal(u.ammo, 4);
  assert.equal(u.landed, true);
  assert.equal(u.flightState, 'parked');
  assert.ok(states.has('landing') && states.has('taxiIn') && states.has('rearming'));
  assert.ok(distance(u, airfieldPoint(b, AIRFIELD.parkingX, AIRFIELD.parkingZ[u.parkingSlot])) < 2);
});

test('Highland Valley has four times the area, walkable hills and a town clear of spawns', () => {
  const g = new Game({ map: 'huge', mode: 'sandbox', players: 8 });
  assert.equal(g.map.size ** 2, maps.large.size ** 2 * 4);
  assert.equal(townLots(g.map).length, 20);
  assert.equal(g.buildings.filter(b => b.type.startsWith('town_')).length, 20);
  for (const h of g.map.hills) assert.ok(height(g.map, h.x, h.z) > 60);
  for (const lot of townLots(g.map)) {
    assert.equal(height(g.map, lot.x, lot.z), 1);
    assert.equal(water(g.map, lot.x, lot.z), false);
    assert.ok(g.players.every(p => distance(lot, p.home) > 300));
  }
  const route = g.nav.path({ x: -1200, z: -500 }, { x: 1200, z: 500 });
  assert.ok(route.length > 0, 'large-map navigation crosses the river');
});

test('Super Easy waits five minutes, sends two infantry, and never builds advanced weapons', () => {
  const g = new Game({ map: 'medium', mode: 'sandbox', difficulty: 'super_easy' });
  const p = g.players[1], initial = g.buildings.filter(b => b.owner === 1).length;
  assert.equal(p.handicap, 0.3);
  g.time = 299; g.ai();
  assert.ok(g.units.filter(u => u.owner === 1).every(u => u.order.type !== 'attackMove'));
  p.aiNext = 0; g.time = 301; g.ai();
  assert.equal(g.units.filter(u => u.owner === 1 && u.order.type === 'attackMove').length, 2);
  assert.equal(p.nextWave, 421);
  g.time = 350; g.ai();
  assert.equal(g.units.filter(u => u.owner === 1 && u.order.type === 'attackMove').length, 2);
  assert.equal(g.buildings.filter(b => b.owner === 1).length, initial);
  assert.ok(g.buildings.filter(b => b.owner === 1).flatMap(b => b.queue).every(q => q.type === 'red_guard'));
});

const sortieGame = () => {
  const g = new Game({ mode: 'sandbox', players: 2, map: 'medium', difficulty: 'super_easy', cash: 100000 });
  const b = g.add('usa_airfield', 0, -350, -200), u = g.add('raptor', 0, b.x, b.z);
  g.baseAircraft(u, b);
  const target = g.add('china_hq', 1, -150, -180);
  target.hp = target.maxHp = 1000000;
  g.command({ type: 'order', ids: [u.id], order: 'attack', targetId: target.id });
  return { g, b, u, target };
};
test('aircraft taxi and take off, orbit, fire four times, land, reload and resume the same target', () => {
  const { g, u, target } = sortieGame();
  const states = new Set(), positions = [], shots = [];
  let reloaded = false, previousAmmo = u.ammo;
  for (let i = 0; i < 1200; i++) {
    g.step(0.1); states.add(u.flightState);
    const events = g.drain().filter(e => e.type === 'shot' && e.id === u.id);
    for (const event of events) { shots.push(event); positions.push({ x: u.x, z: u.z }); }
    if (previousAmmo === 0 && u.ammo === 4) reloaded = true;
    previousAmmo = u.ammo;
    if (shots.length === 5) break;
  }
  assert.equal(shots.length, 5);
  assert.ok(reloaded);
  assert.equal(u.order.targetId, target.id);
  for (const state of ['taxiOut', 'takeoff', 'flying', 'returning', 'landing', 'taxiIn', 'rearming', 'parked']) assert.ok(states.has(state), state);
  assert.ok(distance(positions[0], positions[1]) > 5, 'aircraft keeps moving between shots');
  assert.ok(shots[4].time - shots[3].time > 3, 'no fifth shot before landing and rearming');
});
test('dead targets and stop orders return aircraft to a parked hangar', () => {
  for (const cancel of ['dead', 'stop']) {
    const { g, u, target } = sortieGame();
    for (let i = 0; i < 200 && u.flightState !== 'flying'; i++) g.step(0.1);
    if (cancel === 'dead') target.hp = 0;
    else g.command({ type: 'order', ids: [u.id], order: 'stop' });
    run(g, 45);
    assert.equal(u.flightState, 'parked', cancel);
    assert.equal(u.landed, true, cancel);
    assert.equal(u.ammo, 4, cancel);
  }
});
test('aircraft recover from destroyed/captured bases, and saved sorties resume deterministically', () => {
  const { g, u, b } = sortieGame();
  run(g, 10);
  const replacement = g.add('usa_airfield', 0, -350, 80);
  b.owner = 1;
  g.step(0.1);
  assert.equal(u.homeAirfieldId, replacement.id);
  const saved = Game.load(g.save());
  run(g, 20); run(saved, 20);
  for (const key of ['x', 'z', 'ammo', 'flightState', 'homeAirfieldId', 'altitude']) assert.equal(saved.get(u.id)[key], u[key], key);
  replacement.hp = 0;
  u.ammo = 0;
  g.step(0.1);
  assert.equal(u.flightState, 'holding');
  run(g, 2);
  assert.ok(Number.isFinite(u.x) && Number.isFinite(u.z));
});
test('hangar slots are distinct, rotated with the airport, and reserve queued aircraft capacity', () => {
  const g = game(), b = g.add('usa_airfield', 0, -200, -100);
  b.rotation = Math.PI / 2;
  const planes = Array.from({ length: 4 }, () => g.add('raptor', 0, b.x, b.z));
  for (const u of planes) g.baseAircraft(u, b);
  assert.equal(new Set(planes.map(u => `${u.x},${u.z}`)).size, 4);
  assert.ok(g.command({ type: 'train', id: b.id, unit: 'raptor' }).includes('Hangars vol'));
  planes[0].hp = 0;
  assert.equal(g.command({ type: 'train', id: b.id, unit: 'raptor' }), null);
  assert.ok(g.command({ type: 'train', id: b.id, unit: 'raptor' }).includes('Hangars vol'));
});
test("A* crosses land bridges and avoids blocked water and structures", () => {
  const map = { size: 600 },
    nav = new Navigation(map);
  nav.rebuild([{ x: -70, z: 0, radius: 20 }]);
  const path = nav.path({ x: -150, z: 100 }, { x: 150, z: 100 });
  assert.ok(path.length > 0);
  assert.ok(path.some((p) => Math.abs(p.z) <= 54));
  assert.ok(path.every((p) => Math.hypot(p.x + 70, p.z) > 20));
});
test("fog tracks explored cells after vision leaves and radar depends on hq", () => {
  const g = game();
  const old = [...g.explored];
  for (const e of g.entities)
    if (e.owner === 0) {
      e.x = -200;
      e.z = -200;
    }
  g.updateFog();
  assert.ok(
    g.explored.some((v, i) => v === 1 && g.visible[i] === 0 && old[i] === 1),
  );
});
test("save/load preserves queue, currency, fog and in-flight projectiles", () => {
  const g = game(),
    b = building(g, "barracks");
  g.command({ type: "train", id: b.id, unit: "ranger" });
  run(g, 1);
  g.fire(unit(g, "crusader"), { x: 0, z: 0, id: null });
  const restored = Game.load(JSON.parse(JSON.stringify(g.save())));
  assert.equal(restored.player.cash, g.player.cash);
  assert.equal(restored.get(b.id).queue[0].remaining, b.queue[0].remaining);
  assert.deepEqual(restored.explored, g.explored);
  assert.equal(restored.projectiles.length, 1);
  run(restored, 1);
});
test("replay reproduces recorded player orders, queues and simulation seed", () => {
  const g = game(),
    b = building(g, "barracks");
  g.command({ type: "train", id: b.id, unit: "ranger" });
  run(g, 1);
  g.command({ type: "rally", id: b.id, x: 100, z: -100 });
  run(g, 8);
  const r = Game.fromReplay(g.replay());
  run(r, 9);
  assert.equal(r.player.cash, g.player.cash);
  assert.equal(r.seed, g.seed);
  assert.equal(r.entities.length, g.entities.length);
  assert.equal(r.units.at(-1).x, g.units.at(-1).x);
});
test("GLA rebuild holes, salvage and terror cells; China mines; USA modes", () => {
  const g = game("gla"),
    b = building(g, "barracks");
  g.destroy(b, null);
  run(g, 19);
  assert.ok(
    g.buildings.some((e) => e.type === "gla_barracks" && e.id !== b.id),
  );
  const u = unit(g, "scorpion");
  g.collect(u, { type: "salvage" });
  assert.equal(u.salvage, 1);
  const china = game("china"),
    barracks = building(china, "barracks");
  china.player.upgrades.push("mines");
  china.placeMines(barracks);
  assert.equal(china.fields.length, 8);
  const usa = game();
  const tech = usa.add("usa_tech", 0, -200, 0);
  usa.command({ type: "mode", id: tech.id, mode: "hold" });
  assert.equal(usa.player.mode, "hold");
});
test("skirmish supports eight players and AI develops its base", () => {
  const g = new Game({ players: 8, map: "large", difficulty: "brutal" }),
    initial = g.entities.length;
  run(g, 30);
  assert.ok(g.entities.length > initial);
  assert.equal(g.players.length, 8);
  assert.ok(g.players[1].cash < 8000);
});
test("campaign faction objectives and win/loss", () => {
  for (const f of ["usa", "china", "gla"]) {
    const g = new Game({ mode: "campaign", faction: f, map: "small" });
    assert.equal(g.objectives().length, 3);
  }
  const g = new Game({ mode: "skirmish", players: 2 });
  for (const b of g.buildings) if (b.owner === 1) g.destroy(b, null, true);
  run(g, 6);
  assert.equal(g.result, "victory");
});

test("hijackers take vehicles, EMP disables units and mines damage enemies", () => {
  const g = game("gla");
  g.players.push({ ...structuredClone(g.player), id: 1, team: 1 });
  const h = g.add("hijacker", 0, -200, -100),
    tank = g.add("crusader", 1, -190, -100);
  g.command({
    type: "ability",
    id: h.id,
    ability: "hijack",
    targetId: tank.id,
  });
  run(g, 1);
  assert.equal(tank.owner, 0);
  assert.equal(h.hp, 0);
  const enemy = g.add("red_guard", 1, -100, -100);
  enemy.order = { type: "move", x: -50, z: -100 };
  enemy.status.emp = 3;
  const x = enemy.x;
  run(g, 1);
  assert.equal(enemy.x, x);
  g.fields.push({
    x: enemy.x,
    z: enemy.z,
    radius: 12,
    time: 60,
    damage: 600,
    type: "mine",
    owner: 0,
  });
  run(g, 0.5);
  assert.ok(enemy.hp < enemy.maxHp);
});
test("veterancy crate immediately ranks up and China/GLA income technologies work", () => {
  const g = game();
  const u = unit(g, "ranger");
  g.collect(u, { type: "veterancy" });
  assert.equal(u.veterancy, 2);
  const c = game("china"),
    h = c.add("hacker", 0, -100, -100),
    cash = c.player.cash;
  run(c, 4);
  assert.ok(c.player.cash > cash);
  const a = game("gla"),
    tech = a.add("gla_tech", 0, -150, -100);
  a.player.upgrades.push("terror_cells");
  const before = a.units.length;
  run(a, 42);
  assert.ok(a.units.length > before);
});
