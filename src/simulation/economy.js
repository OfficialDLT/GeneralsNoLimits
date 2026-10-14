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
export const economyMethods = {
  availableUnits(p, role) {
    return Object.entries(units).filter(
      ([id, d]) =>
        d.faction === p.faction &&
        d.producer === role &&
        (!d.subfaction || d.subfaction === p.subfaction),
    );
  },
  has(owner, role) {
    return this.buildings.some(
      (e) =>
        e.owner === owner &&
        buildings[e.type].role === role &&
        e.progress === 1,
    );
  },
  requirements(owner, d) {
    return (d.prerequisites || []).every((role) => this.has(owner, role));
  },
  cost(owner, d) {
    const p = this.players[owner],
      sub = factions[p.faction].subs[p.subfaction] || {};
    return Math.round(
      d.cost *
        (d.kind === "air"
          ? sub.airCost || 1
          : d.kind === "tank"
            ? sub.tankCost || 1
            : 1) *
        (this.has(owner, "refinery") ? 0.9 : 1),
    );
  },
  population(owner) {
    return (
      this.units
        .filter((e) => e.owner === owner)
        .reduce((n, e) => n + (units[e.type]?.population || 0), 0) +
      this.buildings
        .filter((e) => e.owner === owner)
        .reduce(
          (n, b) =>
            n +
            b.queue
              .filter((q) => q.kind === "unit")
              .reduce((a, q) => a + units[q.type].population, 0),
          0,
        )
    );
  },
  capacity(owner) {
    return this.buildings
      .filter((e) => e.owner === owner && e.progress === 1)
      .reduce((n, e) => n + (buildings[e.type].population || 0), 0);
  },
  canBuild(type, owner, x, z) {
    const d = buildings[type];
    if (!d || d.faction !== this.players[owner].faction)
      return "Verkeerde factie";
    if (!this.requirements(owner, d)) return "Vereiste gebouwen ontbreken";
    if (this.players[owner].cash < this.cost(owner, d))
      return "Onvoldoende credits";
    if (
      Math.abs(x) > this.map.size / 2 - d.radius ||
      Math.abs(z) > this.map.size / 2 - d.radius ||
      water(this.map, x, z) ||
      cliff(this.map, x, z)
    )
      return "Ongeldig terrein";
    if (
      this.buildings.some(
        (b) => distance({ x, z }, b) < b.radius + d.radius + 5,
      )
    )
      return "Bouwplek geblokkeerd";
    const builders = this.units.filter(
      (e) =>
        e.owner === owner &&
        units[e.type]?.builder &&
        !e.inside &&
        !e.status.emp,
    );
    if (!builders.length) return "Bouw eerst een Dozer of Worker";
    if (!builders.some((e) => distance(e, { x, z }) < 320))
      return "Buiten bouwradius (320)";
    return null;
  },
  updatePower() {
    for (const p of this.players) {
      const bs = this.buildings.filter(
        (b) => b.owner === p.id && b.progress === 1,
      );
      p.power = bs.reduce((n, b) => n + buildings[b.type].power, 0);
      p.powerUse = bs.reduce((n, b) => n + buildings[b.type].powerUse, 0);
      const low = p.faction !== "gla" && p.power < p.powerUse;
      if (low && !p.lowPower) this.emit("low_power", { owner: p.id });
      p.lowPower = low;
    }
  },
  effects(owner) {
    const p = this.players[owner];
    const signature = (p?.upgrades || []).join("|");
    const cached = this.effectCache.get(owner);
    if (cached?.signature === signature) return cached.result;
    const result = {};
    for (const id of p?.upgrades || [])
      for (const [key, value] of Object.entries(upgrades[id].effects)) {
        result[key] =
          typeof value === "number" ? (result[key] || 1) * value : value;
      }
    this.effectCache.set(owner, { signature, result });
    return result;
  },
  income(owner, amount, e) {
    const p = this.players[owner];
    p.cash += amount;
    p.earned += amount;
    if (owner === 0) this.stats.income += amount;
    if (e)
      this.emit("income", {
        x: e.x,
        z: e.z,
        amount: Math.round(amount),
        owner,
      });
  },
  stepBuilding(e, dt) {
    const d = buildings[e.type],
      p = this.players[e.owner];
    if (e.progress < 1) {
      const builder = this.get(e.builder);
      if (
        builder &&
        builder.order.type === "build" &&
        builder.order.targetId === e.id &&
        distance(builder, e) < e.radius + 24 &&
        !builder.status.emp
      ) {
        e.progress = Math.min(1, e.progress + dt / d.seconds);
        e.hp = Math.min(e.maxHp, e.hp + (e.maxHp * 0.85 * dt) / d.seconds);
        if (e.progress === 1) {
          builder.order = { type: "guard" };
          if (this.players[e.owner].upgrades.includes("mines"))
            this.placeMines(e);
          this.emit("building_complete", { id: e.id, owner: e.owner });
        }
      }
      return;
    }
    if (e.status.emp) return;
    if (e.repair && p && e.hp < e.maxHp && p.cash > dt * 4) {
      p.cash -= dt * 4;
      e.hp = Math.min(e.maxHp, e.hp + dt * 35);
    }
    if (e.hp < e.maxHp * 0.25) this.damage(e, dt * 2, "Flame", null);
    if (p) {
      const speed = p.lowPower && d.powerUse ? 0.4 : 1;
      const q = e.queue[0];
      if (q && !e.queuePaused) {
        q.remaining -= dt * speed;
        if (q.remaining <= 0) {
          if (q.kind === "unit") {
            const u = this.add(
              q.type,
              e.owner,
              e.x + e.radius + 9,
              e.z - e.radius - 9,
            );
            if (e.rallyPoint) u.order = { type: "move", ...e.rallyPoint };
            if (units[q.type].collector && !e.rallyPoint)
              u.order = { type: "harvest" };
            this.emit("unit_complete", { id: u.id, owner: e.owner });
          } else {
            p.upgrades.push(q.type);
            if (q.type === "mines")
              for (const b of this.buildings.filter((b) => b.owner === p.id))
                this.placeMines(b);
            this.emit("upgrade_complete", {
              name: upgrades[q.type].name,
              owner: e.owner,
            });
          }
          e.queue.shift();
        }
      }
      if (d.role === "super") {
        const sub = factions[p.faction].subs[p.subfaction] || {};
        e.superCharge = Math.min(
          d.superTime,
          e.superCharge + (dt * speed) / (sub.superTime || 1),
        );
        if (!e.announced) {
          e.announced = true;
          this.emit("super_detected", { owner: e.owner, id: e.id });
        }
      }
      if (d.role === "tech" && this.effects(e.owner).terrorCells) {
        e.terrorClock = (e.terrorClock || 0) + dt;
        if (e.terrorClock > 40) {
          e.terrorClock = 0;
          this.add("terrorist", e.owner, e.x + 30, e.z);
        }
      }
      if (d.income) {
        e.incomeClock += dt;
        if (e.incomeClock > 3) {
          this.income(
            e.owner,
            d.income * e.incomeClock * (this.effects(e.owner).income || 1),
            e,
          );
          e.incomeClock = 0;
        }
      }
      if (d.role === "reinforcement") {
        e.reinforceClock = (e.reinforceClock || 0) + dt;
        if (e.reinforceClock > 30) {
          e.reinforceClock = 0;
          this.add(
            { usa: "crusader", china: "battlemaster", gla: "scorpion" }[
              p.faction
            ],
            p.id,
            e.x + 30,
            e.z,
          );
        }
      }
    }
    if (d.heal || d.role === "hospital" || d.role === "repair") {
      for (const u of this.spatial.query(e.x, e.z, 90))
        if (u.owner === e.owner && u.kind === "unit") {
          u.hp = Math.min(u.maxHp, u.hp + (d.heal || 10) * dt);
          if (this.players[e.owner]?.faction === "china")
            u.status.propaganda = 1;
        }
    }
    e.cooldown -= dt;
    const attackDamage =
      (d.damage || 0) +
      (d.role === "tech" && p?.faction === "usa" && p.mode === "bombard"
        ? 65
        : 0) +
      e.passengers.reduce(
        (n, id) => n + (units[this.get(id)?.type]?.damage || 0) * 0.7,
        0,
      );
    if (attackDamage && e.owner >= 0) {
      const target = this.findEnemy(e, d.range || 100, d.antiAir || false);
      if (target && e.cooldown <= 0) {
        if (d.suicide) {
          this.blast(
            e.x,
            e.z,
            d.splash || 40,
            attackDamage,
            "Explosion",
            e.owner,
            e,
          );
          this.destroy(e, e);
        } else this.fire(e, target, attackDamage);
        e.cooldown = (d.reload || 1.3) * (p?.lowPower ? 2.5 : 1);
      }
    }
  },
  harvest(e, dt) {
    const d = units[e.type];
    const depot = this.buildings
      .filter(
        (b) =>
          b.owner === e.owner &&
          buildings[b.type].role === "supply" &&
          b.progress === 1,
      )
      .sort((a, b) => distance(a, e) - distance(b, e))[0];
    if (!depot) return;
    if (e.cargo > 0) {
      this.go(e, depot, dt, depot.radius + 8);
      if (distance(e, depot) < depot.radius + 22) {
        this.income(
          e.owner,
          e.cargo * (this.effects(e.owner).income || 1),
          depot,
        );
        e.cargo = 0;
        e.path = [];
      }
      return;
    }
    const pile = this.supplies
      .filter((p) => p.amount > 0)
      .sort((a, b) => distance(a, e) - distance(b, e))[0];
    if (!pile) return;
    this.go(e, pile, dt);
    if (distance(e, pile) < 22) {
      e.harvestTime = (e.harvestTime || 0) + dt;
      if (e.harvestTime > 2) {
        e.harvestTime = 0;
        e.cargo = Math.min(pile.amount, d.cargo || 150);
        pile.amount -= e.cargo;
        e.path = [];
      }
    }
  },
  placeMines(e) {
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      this.fields.push({
        x: e.x + Math.cos(angle) * (e.radius + 8),
        z: e.z + Math.sin(angle) * (e.radius + 8),
        radius: 8,
        time: 240,
        damage: 500,
        type: "mine",
        owner: e.owner,
      });
    }
  },
};
