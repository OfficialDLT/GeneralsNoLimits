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
import { distance, clamp, water, cliff, height } from "./world.js";
const alive = (e) => e.hp > 0;
export const ordersMethods = {
  stepUnit(e, dt) {
    const d = units[e.type];
    if (!d) {
      if (e.type === "civilian_unit") {
        if (!e.path.length)
          e.path = [
            {
              x: e.x + (this.random() - 0.5) * 30,
              z: e.z + (this.random() - 0.5) * 30,
            },
          ];
        this.move(e, dt, { speed: 8, kind: "infantry" });
      }
      return;
    }
    if (e.status.emp) return;
    const p = this.players[e.owner],
      effects = this.effects(e.owner);
    e.cooldown -= dt;
    if (d.income && ["guard", "stop"].includes(e.order.type)) {
      e.incomeClock += dt;
      if (e.incomeClock > 3) {
        this.income(
          e.owner,
          d.income *
            e.incomeClock *
            (effects.income || 1) *
            (this.has(e.owner, "income") ? 1.5 : 1),
          e,
        );
        e.incomeClock = 0;
      }
    }
    if (
      d.heal ||
      e.attachments.includes("overlord_speaker") ||
      (effects.heal && d.kind !== "infantry")
    )
      for (const u of this.spatial.query(e.x, e.z, 60))
        if (u.owner === e.owner) {
          u.hp = Math.min(u.maxHp, u.hp + (d.heal || effects.heal || 6) * dt);
          if (p.faction === "china") u.status.propaganda = 1;
        }
    if (e.veterancy === 3) e.hp = Math.min(e.maxHp, e.hp + 3 * dt);
    if (d.kind === 'air' && d.ammo != null) {
      this.stepAircraft(e, dt);
      return;
    }
    const o = e.order,
      target = this.get(o.targetId);
    let fighting = null;
    if (
      [
        "attack",
        "capture",
        "garrison",
        "enter",
        "hijack",
        "disable",
        "snipe",
        "sabotage",
      ].includes(o.type) &&
      target
    ) {
      if (o.type === "attack") {
        if (this.detected(target, e.owner)) fighting = target;
        else {
          e.order = { type: "guard" };
          return;
        }
      } else {
        this.go(e, target, dt, target.radius + 8);
        if (distance(e, target) <= target.radius + 14) {
          if (o.type === "capture") {
            if (!d.capture || (!p.upgrades.includes("capture") && !d.hero)) {
              e.order = { type: "guard" };
              return;
            }
            if (target.kind === "building" && target.owner !== e.owner) {
              target.captureProgress += dt;
              if (target.captureProgress > 5) {
                target.owner = e.owner;
                target.captureProgress = 0;
                target.queue = [];
                target.builder = null;
                e.order = { type: "guard" };
                this.emit("captured", { id: target.id, owner: e.owner });
              }
            }
          } else if (["garrison", "enter"].includes(o.type)) {
            const t = def(target);
            if (
              (t.capacity || 0) +
                (target.attachments.includes("overlord_bunker") ? 5 : 0) >
                target.passengers.length &&
              (target.owner === e.owner || target.owner < 0) &&
              d.kind === "infantry"
            ) {
              if (target.owner < 0) target.owner = e.owner;
              e.inside = target.id;
              target.passengers.push(e.id);
              e.order = { type: "guard" };
            }
          } else if (
            o.type === "hijack" &&
            d.abilities?.includes("hijack") &&
            target.kind === "unit" &&
            units[target.type]?.kind !== "infantry" &&
            this.enemy(e.owner, target.owner)
          ) {
            target.owner = e.owner;
            target.order = { type: "guard" };
            this.destroy(e, null, true);
          } else if (o.type === "disable") {
            target.status.emp = 8;
            e.order = { type: "guard" };
          } else if (o.type === "snipe" && this.enemy(e.owner, target.owner)) {
            this.damage(target, 500, "Bullet", e);
            e.order = { type: "guard" };
          } else if (
            o.type === "sabotage" &&
            this.enemy(e.owner, target.owner)
          ) {
            this.damage(target, 800, "Explosion", e);
            e.order = { type: "guard" };
          }
        }
        return;
      }
    }
    if (o.type === "harvest" && d.collector) {
      this.harvest(e, dt);
      return;
    }
    if (o.type === "build" && target) {
      this.go(e, target, dt, target.radius + 18);
      return;
    }
    if (o.type === "forceFire") {
      fighting = { x: o.x, z: o.z, id: null, kind: "ground" };
    }
    if (
      !fighting &&
      ["guard", "attackMove", "patrol", "stop", "waypoint"].includes(o.type) &&
      d.damage
    )
      fighting = this.findEnemy(
        e,
        d.range + (o.type === "attackMove" ? 90 : 0),
        d.antiAir || e.attachments.includes("overlord_gatling"),
      );
    if (fighting && d.damage) {
      const range =
        (d.range || 60) *
        (p.mode === "search" && p.faction === "usa" ? 1.15 : 1);
      if (distance(e, fighting) > range) {
        if (o.type !== "stop") this.go(e, fighting, dt, range * 0.8);
      } else if (e.cooldown <= 0) {
        e.rotation = Math.atan2(e.x - fighting.x, e.z - fighting.z);
        if (d.suicide) {
          this.blast(
            e.x,
            e.z,
            d.splash || 25,
            d.damage,
            d.damageType,
            e.owner,
            e,
          );
          this.destroy(e, e);
        } else this.fire(e, fighting);
        e.cooldown = d.reload / (1 + e.veterancy * 0.15);
      }
      return;
    }
    if (["move", "attackMove", "scatter", "patrol"].includes(o.type)) {
      if (distance(e, o) > 8) this.go(e, o, dt);
      else if (o.type === "patrol") {
        const previous = { x: o.x, z: o.z };
        o.x = o.origin.x;
        o.z = o.origin.z;
        o.origin = previous;
        e.path = [];
      } else if (e.waypoints?.length) {
        const next = e.waypoints.shift();
        e.order = { type: "move", ...next };
      } else e.order = { type: "guard" };
    }
    if (d.kind === "tank") {
      for (const target of this.spatial.query(e.x, e.z, 6))
        if (
          target.kind === "unit" &&
          units[target.type]?.kind === "infantry" &&
          this.enemy(e.owner, target.owner)
        )
          this.damage(target, 200 * dt, "Crush", e);
    }
    for (let i = this.crates.length - 1; i >= 0; i--)
      if (distance(e, this.crates[i]) < 10) {
        this.collect(e, this.crates[i]);
        this.crates.splice(i, 1);
      }
  },
  go(e, target, dt, standoff = 0) {
    if (distance(e, target) <= standoff) return;
    const d = units[e.type] || { speed: 8 };
    if (d.kind === "air") {
      e.path = [{ x: target.x, z: target.z }];
    } else if (
      !e.pathGoal ||
      distance(e.pathGoal, target) > 20 ||
      !e.path.length
    ) {
      const dx = e.x - target.x,
        dz = e.z - target.z,
        length = Math.hypot(dx, dz) || 1,
        goal = {
          x: target.x + (dx / length) * standoff,
          z: target.z + (dz / length) * standoff,
        };
      e.path = this.nav.path(e, goal, d.amphibious);
      e.pathGoal = { x: target.x, z: target.z };
      if (!e.path.length) return;
    }
    this.move(e, dt, d);
  },
  move(e, dt, d) {
    const next = e.path[0];
    if (!next) return;
    let dx = next.x - e.x,
      dz = next.z - e.z,
      len = Math.hypot(dx, dz);
    if (len < 3) {
      e.path.shift();
      return;
    }
    let speed = d.speed || 24;
    const p = this.players[e.owner],
      sub = p ? factions[p.faction].subs[p.subfaction] || {} : {};
    speed *= sub.speed || 1;
    if (e.status.propaganda) speed *= 1.15;
    speed *= p ? this.effects(e.owner).speed || 1 : 1;
    const step = Math.min(len, speed * dt);
    let nx = e.x + (dx / len) * step,
      nz = e.z + (dz / len) * step;
    if (d.kind !== "air") {
      for (const n of this.spatial.query(e.x, e.z, 14))
        if (
          n.id !== e.id &&
          n.kind === "unit" &&
          !n.inside &&
          units[n.type]?.kind !== "air"
        ) {
          const separation = distance(e, n),
            r = e.radius + n.radius;
          if (separation < r && separation > 0.01) {
            nx += ((e.x - n.x) / separation) * (r - separation) * dt * 3;
            nz += ((e.z - n.z) / separation) * (r - separation) * dt * 3;
          }
        }
      const [i, j] = this.nav.pos(nx, nz);
      if (!this.nav.free(i, j, d.amphibious)) {
        e.path = [];
        return;
      }
    }
    e.rotation = Math.atan2(-dx, -dz);
    e.x = clamp(nx, -this.map.size / 2 + 4, this.map.size / 2 - 4);
    e.z = clamp(nz, -this.map.size / 2 + 4, this.map.size / 2 - 4);
  },
  unload(e) {
    for (const id of e.passengers) {
      const u = this.get(id);
      if (u) {
        u.inside = null;
        u.x = e.x + e.radius + 12 + this.random() * 8;
        u.z = e.z + this.random() * 10;
        u.order = { type: "guard" };
      }
    }
    e.passengers = [];
  },
};
