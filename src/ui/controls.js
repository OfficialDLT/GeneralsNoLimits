import { units, buildings, definition as def } from "../config/index.js";
import { clamp, distance } from "../simulation/world.js";
export const defaultHotkeys = {
  attackMove: "x",
  guard: "g",
  stop: "k",
  scatter: "f",
  patrol: "p",
  waypoint: "q",
  base: "home",
  lastAttack: "space",
  all: "e",
};
export class Controls {
  constructor(view, ui) {
    this.view = view;
    this.ui = ui;
    this.canvas = view.canvas;
    this.keys = new Set();
    this.groups = {};
    this.view.groups = this.groups;
    this.formation = 'box';
    this.selected = [];
    this.pointer = null;
    this.drag = null;
    this.orbit = null;
    this.placement = null;
    this.placing = null;
    this.targetAction = null;
    this.hotkeys = { ...defaultHotkeys };
    this.box = document.querySelector("#selection-box");
    const c = this.canvas;
    window.addEventListener(
      "pointermove",
      (e) => (this.pointer = { clientX: e.clientX, clientY: e.clientY }),
    );
    document.addEventListener("pointerleave", () => (this.pointer = null));
    c.addEventListener("pointermove", (e) => this.pointerMove(e));
    c.addEventListener("pointerdown", (e) => this.pointerDown(e));
    c.addEventListener("pointerup", (e) => this.pointerUp(e));
    c.addEventListener("pointercancel", () => this.cancelGesture());
    c.addEventListener("lostpointercapture", () => this.cancelGesture());
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("auxclick", (e) => {
      if (e.button === 1) e.preventDefault();
    });
    c.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        view.zoom = clamp(view.zoom + e.deltaY * 0.15, 60, 900);
      },
      { passive: false },
    );
    c.addEventListener("dblclick", (e) => {
      if (this.placing || !this.game || this.game.paused) return;
      const hit = view.pick(e);
      if (hit?.kind === "unit" && hit.owner === 0) {
        const same = this.game.units
          .filter(
            (u) =>
              u.owner === 0 &&
              u.type === hit.type &&
              view.screen(u).visible &&
              !u.inside,
          )
          .map((u) => u.id);
        this.select(
          e.shiftKey ? [...new Set([...this.selected, ...same])] : same,
        );
      }
    });
    window.addEventListener("keydown", (e) => this.keyDown(e));
    window.addEventListener("keyup", (e) =>
      this.keys.delete(e.key.toLowerCase()),
    );
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.pointer = null;
      this.cancel();
    });
    document.querySelector("#minimap").addEventListener("pointerdown", (e) => {
      if (!this.game || !this.game.radar()) return;
      const r = e.currentTarget.getBoundingClientRect(),
        x = ((e.clientX - r.left) / r.width - 0.5) * this.game.map.size,
        z = ((e.clientY - r.top) / r.height - 0.5) * this.game.map.size;
      if (e.button === 2) this.order("move", { x, z });
      else {
        view.focus.x = x;
        view.focus.z = z;
      }
    });
    document
      .querySelector("#minimap")
      .addEventListener("contextmenu", (e) => e.preventDefault());
  }
  setGame(g) {
    this.game = g;
    this.groups = {};
    this.view.groups = this.groups;
    this.cancel();
    this.select([
      g.buildings.find((b) => b.owner === 0 && buildings[b.type].role === "hq")
        .id,
    ]);
  }
  select(ids) {
    this.selected = [...new Set(ids)].filter((id) => this.game.get(id));
    this.view.selected = this.selected;
    this.ui.selection(this.selected);
    if (this.selected.length)
      this.ui.audio.voice(
        "select",
        this.game.player.faction,
        this.game.get(this.selected[0])?.type,
      );
  }
  dispatch(c) {
    if (!this.game || this.game.replayCommands) return;
    const error = this.game.command(c);
    if (error) this.ui.toast(error);
    this.ui.refreshActions();
    return error;
  }
  build(type) {
    this.cancel();
    this.placing = type;
    this.view.setGhost(type);
    this.ui.toast(
      "Houd links vast en sleep om te draaien; laat los om te bouwen. Bouwradius: 320.",
    );
  }
  target(action) {
    this.cancel();
    this.targetAction = action;
    this.canvas.style.cursor = "crosshair";
    this.ui.toast("Kies een doel op de kaart · Esc annuleert");
  }
  cancelGesture() {
    this.drag = null;
    this.orbit = null;
    this.placement = null;
    this.box.style.display = "none";
  }
  cancel() {
    this.cancelGesture();
    this.placing = null;
    this.targetAction = null;
    this.view.clearGhost();
    this.canvas.style.cursor = "default";
  }
  pointerMove(e) {
    if (!this.game) return;
    const p = this.view.world(e);
    if (this.orbit) {
      this.view.yaw -= (e.clientX - this.orbit.x) * 0.008;
      this.orbit.x = e.clientX;
      return;
    }
    if (this.placement) {
      if (
        p &&
        Math.hypot(
          e.clientX - this.placement.screenX,
          e.clientY - this.placement.screenY,
        ) > 8
      )
        this.placement.rotation = Math.atan2(
          p.x - this.placement.x,
          p.z - this.placement.z,
        );
      return;
    }
    if (this.drag) {
      const d = this.drag;
      d.moved ||= Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5;
      if (d.moved)
        Object.assign(this.box.style, {
          display: "block",
          left: Math.min(d.x, e.clientX) + "px",
          top: Math.min(d.y, e.clientY) + "px",
          width: Math.abs(e.clientX - d.x) + "px",
          height: Math.abs(e.clientY - d.y) + "px",
        });
    }
  }
  pointerDown(e) {
    if (!this.game || this.game.paused || this.game.result) return;
    this.ui.audio.unlock();
    this.pointer = { clientX: e.clientX, clientY: e.clientY };
    if (e.button === 1) {
      e.preventDefault();
      this.cancelGesture();
      this.orbit = { x: e.clientX };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    const p = this.view.world(e);
    if (!p) return;
    const hit = this.view.pick(e);
    if (e.button === 2) {
      if (this.placing || this.targetAction) {
        this.cancel();
        return;
      }
      const first = this.game.get(this.selected[0]);
      if (
        this.selected.length === 1 &&
        first?.kind === "building" &&
        first.owner === 0 &&
        !e.ctrlKey
      ) {
        this.dispatch({ type: "rally", id: first.id, x: p.x, z: p.z });
        this.ui.toast("Verzamelvlag geplaatst");
        return;
      }
      if (e.ctrlKey) {
        this.order("forceFire", p);
        return;
      }
      if (e.shiftKey) {
        this.order("waypoint", p);
        return;
      }
      if (hit && this.game.enemy(0, hit.owner)) {
        this.order("attack", p, hit.id);
      } else if (
        hit?.kind === "building" &&
        hit.owner !== 0 &&
        this.selected.some((id) => units[this.game.get(id)?.type]?.capture)
      ) {
        this.order("capture", p, hit.id);
      } else if (hit && (def(hit)?.capacity || 0) > 0 && hit.owner === 0) {
        this.order(hit.kind === "building" ? "garrison" : "enter", p, hit.id);
      } else if (this.game.supplies.some((s) => distance(s, p) < 25)) {
        this.order("harvest", p);
      } else this.order("move", p);
      return;
    }
    if (e.button !== 0) return;
    if (this.targetAction) {
      const a = this.targetAction;
      this.targetAction = null;
      this.canvas.style.cursor = "default";
      if (a.power)
        this.dispatch({ type: "power", power: a.power, x: p.x, z: p.z });
      else if (a.super)
        this.dispatch({ type: "super", id: a.super, x: p.x, z: p.z });
      else if (a.ability)
        this.dispatch({
          type: "ability",
          id: a.id,
          ability: a.ability,
          targetId: hit?.id,
        });
      else if (a.tunnel)
        this.dispatch({ type: "tunnel", id: a.tunnel, targetId: hit?.id });
      else this.order(a.order, p, hit?.id);
      return;
    }
    if (this.placing) {
      this.placement = {
        x: p.x,
        z: p.z,
        rotation: this.view.ghost?.rotation.y || 0,
        screenX: e.clientX,
        screenY: e.clientY,
      };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    this.drag = { x: e.clientX, y: e.clientY, shift: e.shiftKey, moved: false };
    this.canvas.setPointerCapture(e.pointerId);
  }
  pointerUp(e) {
    if (e.button === 1) {
      this.orbit = null;
      this.release(e);
      return;
    }
    if (e.button !== 0) return;
    if (this.placement) {
      const p = this.placement;
      this.placement = null;
      const type = this.placing;
      this.release(e);
      if (type) {
        const error = this.dispatch({
          type: "build",
          building: type,
          x: p.x,
          z: p.z,
          rotation: p.rotation,
        });
        if (!error) {
          const b = this.game.entities.at(-1);
          this.cancel();
          this.select([b.id]);
        }
      }
      return;
    }
    if (!this.drag) return;
    const d = this.drag;
    if (d.moved) {
      const minX = Math.min(d.x, e.clientX),
        maxX = Math.max(d.x, e.clientX),
        minY = Math.min(d.y, e.clientY),
        maxY = Math.max(d.y, e.clientY);
      const ids = this.game.units
        .filter(
          (u) => u.owner === 0 && !u.inside && this.view.screen(u).visible,
        )
        .filter((u) => {
          const p = this.view.screen(u);
          return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
        })
        .map((u) => u.id);
      this.select(d.shift ? [...new Set([...this.selected, ...ids])] : ids);
    } else {
      const hit = this.view.pick(e);
      if (hit) {
        if (d.shift && hit.owner === 0) {
          this.select(
            this.selected.includes(hit.id)
              ? this.selected.filter((id) => id !== hit.id)
              : [...this.selected, hit.id],
          );
        } else this.select([hit.id]);
      } else if (!d.shift) this.select([]);
    }
    this.cancelGesture();
    this.release(e);
  }
  release(e) {
    if (this.canvas.hasPointerCapture(e.pointerId))
      this.canvas.releasePointerCapture(e.pointerId);
  }
  order(order, p = {}, targetId) {
    this.dispatch({
      type: "order",
      ids: this.selected,
      order,
      x: p.x,
      z: p.z,
      targetId,
      formation: this.formation,
    });
    this.ui.audio.voice(
      ["attack", "forceFire", "attackMove"].includes(order) ? "attack" : "move",
      this.game.player.faction,
      this.game.get(
        this.selected.find(
          (id) =>
            this.game.get(id)?.owner === 0 &&
            this.game.get(id)?.kind === "unit",
        ),
      )?.type,
    );
  }
  keyDown(e) {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (e.key === "Escape") {
      if (this.placing || this.targetAction || this.drag) {
        this.cancel();
        return;
      }
      this.ui.pause();
      return;
    }
    if (!this.game || this.game.paused) return;
    const key = e.key.toLowerCase();
    this.keys.add(key);
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key))
      e.preventDefault();
    const number = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || '')?.[1] || (/^[0-9]$/.test(key) ? key : null);
    if (number !== null) {
      e.preventDefault();
      if (e.repeat) return;
      if (e.ctrlKey || e.shiftKey) {
        this.groups[number] = this.selected.filter(id => this.game.get(id)?.owner === 0);
        this.ui.toast(`Groep ${number} opgeslagen · ${this.groups[number].length} objecten`);
      } else if (this.groups[number]) {
        this.select(this.groups[number].filter(id => this.game.get(id)?.owner === 0));
        if (this.lastGroup === number && performance.now() - this.groupTime < 350)
          this.center(this.game.get(this.selected[0]));
        this.lastGroup = number;
        this.groupTime = performance.now();
      }
      return;
    }
    const first = this.game.get(this.selected[0]),
      d = first && def(first);
    if (first?.owner === 0 && (d?.builder || d?.role === "hq")) {
      const entry = Object.entries(buildings).find(
        ([id, b]) => b.faction === this.game.player.faction && b.hotkey === key,
      );
      if (entry) {
        e.preventDefault();
        this.build(entry[0]);
        return;
      }
    }
    if (first?.owner === 0 && first.kind === "building") {
      const entry = this.game
        .availableUnits(this.game.player, d.role)
        .find(([id, u]) => u.hotkey === key);
      if (entry) {
        e.preventDefault();
        this.dispatch({ type: "train", id: first.id, unit: entry[0] });
        return;
      }
    }
    const action = Object.entries(this.hotkeys).find(
      ([action, k]) => k === key,
    )?.[0];
    if (action === "all")
      this.select(
        this.game.units
          .filter((u) => u.owner === 0 && !u.inside)
          .map((u) => u.id),
      );
    else if (action === "base") this.center(this.game.player.home);
    else if (action === "lastAttack") this.center(this.game.lastAttack);
    else if (["guard", "stop", "scatter"].includes(action)) this.order(action);
    else if (action) this.target({ order: action });
  }
  center(e) {
    if (e) {
      this.view.focus.x = e.x;
      this.view.focus.z = e.z;
    }
  }
  update(dt) {
    if (!this.game || this.game.paused || this.game.result) return;
    const v = this.view;
    let x =
        Number(this.keys.has("d") || this.keys.has("arrowright")) -
        Number(this.keys.has("a") || this.keys.has("arrowleft")),
      z =
        Number(this.keys.has("s") || this.keys.has("arrowdown")) -
        Number(this.keys.has("w") || this.keys.has("arrowup"));
    if (this.pointer && !this.orbit && !this.placement && document.hasFocus()) {
      const p = this.pointer;
      if (
        p.clientX >= 0 &&
        p.clientX < innerWidth &&
        p.clientY >= 0 &&
        p.clientY < innerHeight
      ) {
        x += p.clientX < 20 ? -1 : p.clientX > innerWidth - 20 ? 1 : 0;
        z += p.clientY < 20 ? -1 : p.clientY > innerHeight - 20 ? 1 : 0;
      }
    }
    const len = Math.max(1, Math.hypot(x, z)),
      speed = v.zoom * 0.8 * dt;
    v.focus.x = clamp(
      v.focus.x + ((x * Math.cos(v.yaw) + z * Math.sin(v.yaw)) / len) * speed,
      -this.game.map.size / 2 + 20,
      this.game.map.size / 2 - 20,
    );
    v.focus.z = clamp(
      v.focus.z + ((-x * Math.sin(v.yaw) + z * Math.cos(v.yaw)) / len) * speed,
      -this.game.map.size / 2 + 20,
      this.game.map.size / 2 - 20,
    );
    if (this.placing) {
      const p = this.placement || (this.pointer && v.world(this.pointer));
      v.ghostAt(
        p,
        this.placement?.rotation || v.ghost.rotation.y,
        !p ? false : !this.game.canBuild(this.placing, 0, p.x, p.z),
      );
    }
    const ids = this.selected.filter((id) => this.game.get(id));
    if (ids.length !== this.selected.length) this.select(ids);
  }
}
