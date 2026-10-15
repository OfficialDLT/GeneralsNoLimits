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
  assert.equal(audioCheck.count, 174);
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
        !p.view.meshes.get(b.id).mesh.visible
      );
    }),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser: menus, 3 factions, 8-player start, camera/edge movement, group/double-click/control groups, Force Fire, queues/pause, rally, rotated placement, save-load and UI",
  );
} finally {
  await browser?.close();
  server.kill();
}
