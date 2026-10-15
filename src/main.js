import "./style.css";
import { Game } from "./simulation/engine.js";
import { MenuScene } from "./render/menu-scene.js";
import { View } from "./render/view.js";
import { Controls } from "./ui/controls.js";
import { Interface } from "./ui/interface.js";
import { Audio } from "./ui/audio.js";
const audio = new Audio();
const menuScene = new MenuScene();
document.addEventListener("pointerdown", (e) => {
  if (!audio.unlocked && !e.target.closest("#music-toggle")) audio.unlock();
});
const view = new View(document.querySelector("#world"));
const ui = new Interface(audio);
const controls = new Controls(view, ui);
let game = null;
function activate(g) {
  game = g;
  ui.gameOverShown = false;
  view.setGame(game);
  ui.showGame(game);
  controls.setGame(game);
}
ui.connect(
  controls,
  view,
  (settings) => activate(new Game(settings)),
  (kind, data) =>
    activate(kind === "replay" ? Game.fromReplay(data) : Game.load(data)),
);
let last = performance.now(),
  accumulator = 0,
  hudTimer = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  audio.update(
    !game || ui.screen === "menu" ? "menu" : game.player.faction,
    !!game &&
      !game.paused &&
      game.units.some((e) => e.owner === 0 && e.path.length),
  );
  if (!game || ui.screen === "menu") {
    menuScene.update(dt, view.renderer);
    return;
  }
  controls.update(dt);
  if (!game.paused) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= 0.1 && steps++ < 5) {
      game.step(0.1);
      accumulator -= 0.1;
    }
  } else accumulator = 0;
  for (const event of game.drain()) {
    view.effect(event);
    audio.event(event, game.player.faction, game.get(event.id)?.type);
    if (event.type === "replay_complete") ui.toast("Replay afgelopen");
    if (
      [
        "low_power",
        "super_detected",
        "promotion",
        "building_complete",
        "captured",
        "power",
      ].includes(event.type) &&
      (event.owner === 0 || event.type === "super_detected")
    )
      ui.toast(
        {
          low_power:
            "Low power: radar offline, defenses en superwapens vertraagd",
          super_detected: "Superweapon detected!",
          promotion: "Promotie! Nieuwe General Points beschikbaar",
          building_complete: "Building complete",
          captured: "Gebouw gecaptured",
          power: event.name,
        }[event.type],
      );
  }
  hudTimer += dt;
  if (hudTimer > 0.2) {
    hudTimer = 0;
    view.sync();
    ui.update();
  }
  view.update(dt);
}
requestAnimationFrame(frame);
