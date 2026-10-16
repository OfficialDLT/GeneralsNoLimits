import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5179",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
let browser;
try {
  const url = "http://127.0.0.1:5179";
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, serverLog);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400 && /\/(art|audio)\//.test(response.url()))
      errors.push(`Missing asset: ${response.status()} ${response.url()}`);
  });
  // A development-only route adds probes to test actual UI commands without shipping debug globals.
  await page.route("**/src/main.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        "\nwindow.__probe={get game(){return game;},view,ui,controls,activate,Game};",
    });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('.main-menu') && document.fonts.status === 'loaded');
  await page.screenshot({ path: 'docs/menu-assets.png' });
  if (!process.env.PRESENTATION_ONLY) {
  await page.getByRole("button", { name: "Sandbox" }).click();
  await page.locator("#map").selectOption("small");
  await page.getByRole("button", { name: "Start operatie" }).click();
  await page.waitForFunction(() => window.__probe?.game);
  await page.waitForFunction(() => window.__probe.view.terrainTexture.image?.complete);
  await page.waitForFunction(() => window.__probe.view.foliageTexture.image?.complete);
  const audioCheck = await page.evaluate(async () => {
    const audio = window.__probe.ui.audio;
    audio.unlock();
    const manifest = await (await fetch('audio/elevenlabs-manifest.json')).json();
    let count = 0;
    for (const path of Object.keys(manifest)) {
      const response = await fetch(path);
      if (!response.ok) throw Error(`Missing audio: ${path}`);
      const buffer = await audio.context.decodeAudioData(await response.arrayBuffer());
      if (buffer.duration <= 0 || buffer.numberOfChannels < 1) throw Error(`Invalid audio: ${path}`);
      count++;
    }
    await audio.voice('select', 'usa', 'ranger');
    if (!audio.playingVoice) throw Error('Unit voice failed to start');
    await audio.voice('promotion', 'usa', 'announcer');
    if (!audio.playingVoice || !audio.buffers.has('announcer-promotion')) throw Error('Announcer failed to start');
    for (const name of ['gunfire', 'cannon', 'missile', 'explosion', 'engine', 'laser'])
      await audio.effect(name);
    for (const name of ['gunfire', 'cannon', 'missile', 'explosion', 'engine', 'laser'])
      if (!audio.buffers.has(`effect:${name}`)) throw Error(`Effect failed: ${name}`);
    return { count, activeEffects: audio.activeEffects };
  });
  assert.equal(audioCheck.count, 176);
  assert.ok(audioCheck.activeEffects <= 12);
  await page.screenshot({ path: 'docs/game-assets.png' });
  await page.mouse.move(700, 350);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(810, 350, { steps: 6 });
  await page.mouse.up({ button: "middle" });
  assert.ok(await page.evaluate(() => Math.abs(window.__probe.view.yaw) > 0.5));
  const before = await page.evaluate(() => ({
    x: window.__probe.view.focus.x,
    z: window.__probe.view.focus.z,
  }));
  await page.mouse.move(1438, 300);
  await page.waitForFunction(
    (b) =>
      Math.hypot(
        window.__probe.view.focus.x - b.x,
        window.__probe.view.focus.z - b.z,
      ) > 3,
    before,
  );
  await page.mouse.move(700, 350);
  await page.evaluate(() => {
    window.__probe.view.yaw = 0;
    window.__probe.controls.center(window.__probe.game.player.home);
  });
  await page.waitForFunction(() => {
    const v = window.__probe.view;
    return (
      Math.abs(v.camera.position.x - v.focus.x) < 0.01 &&
      Math.abs(v.camera.position.z - v.focus.z - v.zoom * 0.85) < 0.01
    );
  });
  const points = await page.evaluate(() =>
    window.__probe.game.units
      .filter((u) => u.owner === 0 && u.type === "ranger")
      .map((u) => window.__probe.view.screen(u)),
  );
  const left = Math.min(...points.map((p) => p.x)) - 10,
    top = Math.min(...points.map((p) => p.y)) - 10,
    right = Math.max(...points.map((p) => p.x)) + 10,
    bottom = Math.max(...points.map((p) => p.y)) + 10;
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 6 });
  await page.mouse.up();
  if (
    (await page.evaluate(() => window.__probe.controls.selected.length)) !== 3
  ) {
    console.log(
      "selection diagnostic",
      points,
      await page.evaluate(() => ({
        focus: window.__probe.view.focus.toArray(),
        camera: window.__probe.view.camera.position.toArray(),
        selected: window.__probe.controls.selected,
        drag: window.__probe.controls.drag,
      })),
    );
    await page.screenshot({ path: "/tmp/generals-selection-failure.png" });
  }
  assert.equal(
    await page.evaluate(() => window.__probe.controls.selected.length),
    3,
  );
  await page.mouse.dblclick(points[0].x, points[0].y - 3);
  assert.equal(
    await page.evaluate(() => window.__probe.controls.selected.length),
    3,
  );
  await page.keyboard.press("Control+1");
  await page.evaluate(() => window.__probe.controls.select([]));
  await page.keyboard.press("1");
  assert.equal(
    await page.evaluate(() => window.__probe.controls.selected.length),
    3,
  );
  await page.keyboard.down("Control");
  await page.mouse.click(850, 310, { button: "right" });
  await page.keyboard.up("Control");
  assert.ok(
    await page.evaluate(() =>
      window.__probe.controls.selected.every(
        (id) => window.__probe.game.get(id).order.type === "forceFire",
      ),
    ),
  );
  await page.evaluate(() => {
    const b = window.__probe.game.buildings.find(
      (b) => b.owner === 0 && b.type === "usa_barracks",
    );
    window.__probe.controls.select([b.id]);
  });
  await page.getByRole("button", { name: /^Ranger / }).click();
  await page.locator("#production").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.querySelectorAll("#queue button").length === 1,
  );
  assert.equal(await page.locator("#queue button").count(), 1);
  await page
    .getByRole("button", { name: "Productie pauzeren", exact: true })
    .click();
  assert.ok(
    await page.evaluate(
      () =>
        window.__probe.game.get(window.__probe.controls.selected[0])
          .queuePaused,
    ),
  );
  await page
    .getByRole("button", { name: "Productie hervatten", exact: true })
    .click();
  await page.mouse.click(930, 350, { button: "right" });
  assert.ok(
    await page.evaluate(
      () =>
        window.__probe.game.get(window.__probe.controls.selected[0]).rallyPoint,
    ),
  );
  await page.waitForFunction(
    () =>
      window.__probe.game.units.filter(
        (e) => e.owner === 0 && e.type === "ranger",
      ).length === 4,
    null,
    { timeout: 30000 },
  );
  const n = await page.evaluate(() => window.__probe.game.buildings.length);
  const spot = await page.evaluate(() => {
    const u = window.__probe.game.units.find((u) => u.type === "usa_dozer");
    window.__probe.controls.select([u.id]);
    return window.__probe.view.screen({ x: u.x - 65, z: u.z - 60 });
  });
  await page.getByRole("button", { name: /^Barracks / }).click();
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  await page.mouse.move(spot.x + 70, spot.y, { steps: 6 });
  assert.ok(
    await page.evaluate(
      () => Math.abs(window.__probe.view.ghost.rotation.y) > 0.3,
    ),
  );
  await page.mouse.up();
  assert.equal(
    await page.evaluate(() => window.__probe.game.buildings.length),
    n + 1,
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Verder spelen", exact: true })
    .click();
  assert.equal(await page.evaluate(() => window.__probe.game.paused), false);
  await page.evaluate(() => {
    const p = window.__probe;
    const saved = p.game.save();
    p.activate(p.Game.load(saved));
  });
  assert.ok(await page.locator("#resources").textContent());
  for (const faction of ["china", "gla"]) {
    await page.evaluate(
      (f) =>
        window.__probe.activate(
          new window.__probe.Game({
            mode: "sandbox",
            faction: f,
            players: 1,
            map: "small",
          }),
        ),
      faction,
    );
    await page.waitForTimeout(400);
    assert.ok(
      await page
        .getByRole("button", {
          name: faction === "china" ? "Dozer" : "Worker",
          exact: false,
        })
        .count(),
    );
  }
  await page.evaluate(() =>
    window.__probe.activate(
      new window.__probe.Game({
        mode: "skirmish",
        players: 8,
        map: "large",
        difficulty: "brutal",
      }),
    ),
  );
  await page.waitForTimeout(800);
  assert.equal(
    await page.evaluate(() => window.__probe.game.players.length),
    8,
  );
  await page.getByRole("button", { name: "COMMANDOBALK INKLAPPEN" }).click();
  assert.equal(
    await page.locator("#deck-toggle").getAttribute("aria-expanded"),
    "false",
  );
  assert.equal(await page.locator("#deck-content").isVisible(), false);
  await page.getByRole("button", { name: "COMMANDOBALK UITKLAPPEN" }).click();
  await page.locator("#powers-tab").click();
  assert.equal(await page.locator("#powers-panel").isVisible(), true);
  assert.equal(await page.locator("#command").isVisible(), false);
  await page.locator("#orders-tab").click();
  await page.evaluate(() => {
    const p = window.__probe;
    p.activate(
      new p.Game({ mode: "sandbox", faction: "usa", players: 1, map: "small" }),
    );
    const target = p.game.buildings.find((e) => e.type === "oil");
    for (const e of p.game.entities)
      if (e.owner === 0) {
        e.x = target.x + 20;
        e.z = target.z + 20;
      }
    p.game.updateFog();
    p.view.sync();
  });
  assert.ok(
    await page.evaluate(() => {
      const p = window.__probe,
        b = p.game.buildings.find((e) => e.type === "oil");
      return p.view.meshes.get(b.id).mesh.visible;
    }),
  );
  await page.evaluate(() => {
    const p = window.__probe;
    for (const e of p.game.entities)
      if (e.owner === 0) {
        e.x = 250;
        e.z = 250;
      }
    p.game.updateFog();
    p.view.sync();
  });
  assert.ok(
    await page.evaluate(() => {
      const p = window.__probe,
        b = p.game.buildings.find((e) => e.type === "oil");
      return (
        p.game.explored[p.view.fogIndex(b.x, b.z)] &&
        !p.game.isVisible(b) &&
        p.view.meshes.get(b.id).mesh.visible && p.view.meshes.get(b.id).memory &&
        p.view.meshes.get(b.id).materials[0].color.r < 0.4
      );
    }),
  );
  const expansion = await page.evaluate(() => {
    const p = window.__probe;
    p.activate(new p.Game({ mode: 'sandbox', faction: 'usa', players: 2, map: 'huge', difficulty: 'super_easy' }));
    const g = p.game;
    const b = g.add('usa_airfield', 0, g.player.home.x + 220, g.player.home.z + 180);
    const u = g.add('raptor', 0, b.x, b.z);
    g.baseAircraft(u, b);
    const target = g.add('china_hq', 1, b.x - 240, b.z + 160);
    target.hp = target.maxHp = 1000000;
    p.controls.select([u.id]); p.ui.update();
    g.command({ type: 'order', ids: [u.id], order: 'attack', targetId: target.id });
    const states = new Set();
    let shots = 0;
    let liveAmmo = false;
    for (let i = 0; i < 1000 && shots < 5; i++) {
      g.step(0.1); states.add(u.flightState);
      shots += g.drain().filter(e => e.type === 'shot' && e.id === u.id).length;
      if (shots === 1) { p.ui.update(); liveAmmo ||= document.querySelector('#description').textContent.includes('Munitie 3/4'); }
    }
    g.command({ type: 'order', ids: [u.id], order: 'stop' });
    for (let i = 0; i < 600 && u.flightState !== 'parked'; i++) { g.step(0.1); g.drain(); }
    p.controls.select([u.id]);
    p.view.focus.set(b.x - 10, 0, b.z + 15); p.view.zoom = 170; p.view.yaw = -0.55;
    g.updateFog(); p.view.sync();
    let runwayLength = 0;
    p.view.template(b).traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      runwayLength = Math.max(runwayLength, bounds.max.z - bounds.min.z);
    });
    window.__airportPreview = { b, u };
    return { size: g.map.size, town: g.buildings.filter(b => b.type.startsWith('town_')).length,
      shots, states: [...states], landed: u.landed, ammo: u.ammo, runwayLength, liveAmmo,
      clearedTrees: p.view.forestMatrices.every((m, i) =>
        (m.elements[12] - b.x) ** 2 + (m.elements[14] - b.z) ** 2 >= (b.radius + 8) ** 2 || p.view.forestCleared[i]) };
  });
  assert.equal(expansion.size, 4000);
  assert.equal(expansion.town, 20);
  assert.equal(expansion.shots, 5);
  assert.equal(expansion.landed, true);
  assert.equal(expansion.ammo, 4);
  assert.equal(expansion.liveAmmo, true);
  assert.equal(expansion.clearedTrees, true);
  assert.ok(expansion.runwayLength >= 110);
  for (const state of ['takeoff', 'landing', 'rearming']) assert.ok(expansion.states.includes(state), state);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/airport-update.png' });
  await page.evaluate(() => {
    const p = window.__probe, town = p.game.map.town;
    p.view.focus.set(town.x, 0, town.z + 60); p.view.zoom = 430; p.view.yaw = 0;
    // Reveal only for the development screenshot; the shipped game retains fog of war.
    p.game.explored.fill(1); p.game.visible.fill(1); p.view.sync(); p.game.paused = true;
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'docs/highland-town.png' });
  } else {
    await page.getByRole('button', { name: 'Sandbox' }).click();
    await page.evaluate(() => { const p = window.__probe; p.activate(new p.Game({ mode: 'sandbox', faction: 'usa', players: 1, map: 'medium' })); });
  }
  const mixedIds = await page.evaluate(() => {
    const p = window.__probe; p.game.paused = false;
    const ids = [p.game.buildings.find(b => b.owner === 0).id, p.game.units.find(u => u.owner === 0).id];
    p.controls.select(ids); return ids;
  });
  await page.keyboard.press('Shift+2');
  await page.evaluate(() => window.__probe.controls.select([]));
  await page.keyboard.press('2');
  assert.deepEqual(await page.evaluate(() => window.__probe.controls.selected), mixedIds);
  await page.evaluate(() => {
    const p = window.__probe;
    p.controls.select(p.game.units.filter(u => u.owner === 0).slice(0, 3).map(u => u.id));
  });
  await page.getByRole('button', { name: /^Linie/ }).click();
  assert.equal(await page.evaluate(() => window.__probe.controls.formation), 'line');
  const presentation = await page.evaluate(async () => {
    const p = window.__probe, audio = p.ui.audio;
    const score = await audio.context.decodeAudioData(await (await fetch('audio/music/steel-tempest.wav')).arrayBuffer());
    await audio.effect('takeoff'); await audio.effect('landing');
    const portraits = ['ranger', 'pathfinder', 'crusader', 'overlord', 'raptor', 'mig'].map(id => p.view.portrait(id, 'unit'));
    p.activate(new p.Game({ mode: 'sandbox', players: 1, faction: 'usa', map: 'medium' }));
    const g = p.game, b = g.add('usa_airfield', 0, -350, -200), u = g.add('raptor', 0, b.x, b.z);
    g.baseAircraft(u, b);
    g.command({ type: 'order', ids: [u.id], order: 'move', x: -100, z: 200 });
    for (let i = 0; i < 350; i++) { g.step(0.1); g.drain(); }
    const guard = u.order.type === 'airGuard' && u.flightState === 'flying';
    const bridges = p.view.root.children.filter(o => o.name === 'fogged-bridge');
    const bridgeFog = bridges.length === 3 && bridges.every(bridge => {
      const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>' };
      bridge.children[0].material.onBeforeCompile(shader);
      return shader.uniforms.rtsFog?.value === p.view.fogTexture;
    });
    g.paused = true;
    const types = ['raptor', 'mig', 'b52', 'aurora', 'stealth_fighter', 'crusader', 'overlord', 'scud_launcher', 'comanche', 'chinook', 'ranger', 'pathfinder', 'burton', 'worker'];
    types.forEach((type, i) => {
      const model = g.add(type, 0, -300 + (i % 5 - 2) * 30, 200 + (Math.floor(i / 5) - 1) * 34);
      model.landed = true; model.altitude = 1.2;
    });
    g.updateFog(); p.view.focus.set(-300, 0, 225); p.view.zoom = 155; p.view.yaw = -0.2; p.view.sync();
    p.view.effect({ type: 'destroyed', owner: 0, x: -225, z: 195, radius: 16 });
    return { guard, bridgeFog, duration: score.duration, portraits: new Set(portraits).size,
      flightSounds: audio.buffers.has('effect:takeoff') && audio.buffers.has('effect:landing') };
  });
  assert.equal(presentation.guard, true);
  assert.equal(presentation.bridgeFog, true);
  assert.ok(presentation.duration > 50);
  assert.equal(presentation.portraits, 6);
  assert.equal(presentation.flightSounds, true);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'docs/unit-and-effects-update.png' });
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser: 176 audio assets and original score, mixed Shift groups, formations, unique portraits, remembered buildings, particles, aircraft guard and full sortie/rearm cycle",
  );
} finally {
  await browser?.close();
  server.kill();
}
