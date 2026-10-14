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
export const combatMethods = {
  detected(e, owner) {
    if (
      e.owner === owner ||
      e.status.revealed > 0 ||
      (!units[e.type]?.stealth &&
        !e.status.camouflage &&
        !e.status.disguise &&
        !buildings[e.type]?.stealth)
    )
      return true;
    return this.entities.some(
      (u) =>
        alive(u) &&
        u.owner === owner &&
        !u.inside &&
        (def(u)?.detector || this.effects(owner).detector) &&
        distance(e, u) < 120,
    );
  },
  findEnemy(e, r, antiAir = false) {
    return this.spatial
      .query(e.x, e.z, r)
      .filter(
        (t) =>
          this.enemy(e.owner, t.owner) &&
          this.detected(t, e.owner) &&
          (units[t.type]?.kind !== "air" || antiAir),
      )
      .sort((a, b) => distance(a, e) - distance(b, e))[0];
  },
  fire(e, target, damage = null) {
    const d = def(e),
      p = this.players[e.owner],
      effects = this.effects(e.owner),
      sub = factions[p.faction].subs[p.subfaction] || {};
    let amount = damage ?? d.damage;
    amount *= 1 + e.veterancy * 0.2;
    amount *= p.handicap;
    amount *= effects.damage || 1;
    amount *= sub.damage || 1;
    if (d.kind === "infantry") amount *= sub.infantryDamage || 1;
    if (d.damageType === "Explosion") amount *= sub.explosionDamage || 1;
    amount *= 1 + e.salvage * 0.15;
    if (e.status.propaganda) amount *= 1.15;
    if (e.attachments.includes("overlord_gatling")) amount += 30;
    if (p.faction === "usa" && p.mode === "bombard") amount *= 1.2;
    if (
      p.faction === "china" &&
      this.spatial
        .query(e.x, e.z, 45)
        .filter((u) => u.owner === e.owner && u.type === e.type).length >= 3
    )
      amount *= effects.horde || 1.2;
    e.status.revealed = 3;
    e.status.camouflage = false;
    e.status.disguise = false;
    const type =
      effects.damageType || sub.damageType || d.damageType || "Bullet";
    const duration = Math.max(
      0.12,
      distance(e, target) / (type === "Bullet" || type === "Laser" ? 600 : 150),
    );
    this.projectiles.push(
      this.pool.take({
        source: e.id,
        owner: e.owner,
        targetId: target.id,
        x: e.x,
        z: e.z,
        tx: target.x,
        tz: target.z,
        remaining: duration,
        total: duration,
        damage: amount,
        damageType: type,
        splash:
          d.splash ||
          (target.kind === "ground" ? (d.kind === "tank" ? 10 : 3) : 0),
        homing: type === "Missile",
        arc: !!d.artillery,
      }),
    );
    if (e.ammo !== null) e.ammo--;
    this.emit("shot", { id: e.id, x: e.x, z: e.z, damageType: type });
  },
  damage(e, amount, type, source) {
    if (!alive(e)) return;
    if (
      type === "Missile" &&
      (def(e)?.laserDefense ||
        (e.owner >= 0 && this.effects(e.owner).laserDefense)) &&
      this.random() < 0.5
    ) {
      this.emit("laser_intercept", { x: e.x, z: e.z });
      return;
    }
    const armor =
      e.kind === "building" ? "Structure" : units[e.type]?.armor || "Infantry";
    amount *= combat.armor[type]?.[armor] ?? 1;
    if (e.owner >= 0) {
      amount *= this.effects(e.owner).armor || 1;
      if (
        this.players[e.owner].faction === "usa" &&
        this.players[e.owner].mode === "hold"
      )
        amount *= 0.8;
    }
    if (
      source &&
      source.owner >= 0 &&
      this.effects(source.owner).garrisonDamage &&
      e.passengers.length &&
      source.type === "ranger"
    ) {
      for (const id of [...e.passengers]) {
        const u = this.get(id);
        if (u)
          this.damage(
            u,
            amount * this.effects(source.owner).garrisonDamage,
            "Flame",
            source,
          );
      }
    }
    e.hp -= amount;
    if (e.owner === 0 && amount > 5 && this.time - (e.alertTime ?? -10) > 5) {
      e.alertTime = this.time;
      this.lastAttack = { x: e.x, z: e.z };
      this.emit("under_attack", { x: e.x, z: e.z });
    }
    if (e.hp <= 0) this.destroy(e, source);
  },
  blast(x, z, radius, amount, type, owner, source) {
    for (const e of this.spatial.query(x, z, radius))
      if (e.owner !== owner)
        this.damage(
          e,
          amount * (1 - distance(e, { x, z }) / (radius * 1.5)),
          type,
          source,
        );
    this.emit("impact", { x, z, radius, damageType: type });
  },
  destroy(e, source, sold = false) {
    if (e.destroyed) return;
    e.hp = 0;
    e.destroyed = true;
    e.damageState = "rubble";
    this.emit("destroyed", {
      id: e.id,
      x: e.x,
      z: e.z,
      kind: e.kind,
      owner: e.owner,
      sold,
    });
    if (e.owner === 0 && !sold) this.stats.losses++;
    if (source && source.owner >= 0 && this.enemy(source.owner, e.owner)) {
      const xp =
        e.kind === "building" ? 150 : Math.max(30, (def(e)?.cost || 100) / 3);
      source.xp += xp;
      source.veterancy =
        combat.veterancy.filter((n) => source.xp >= n).length - 1;
      const p = this.players[source.owner];
      p.xp += xp;
      const rank = combat.rankXP.filter((n) => p.xp >= n).length;
      if (rank > p.rank) {
        p.points += rank - p.rank;
        p.rank = rank;
        this.emit("promotion", { owner: p.id, rank });
      }
      if (source.owner === 0) this.stats.kills++;
    }
    this.unload(e);
    if (
      e.owner >= 0 &&
      e.kind === "building" &&
      !this.buildings.some((b) => b.owner === e.owner)
    )
      this.players[e.owner].eliminated = true;
    if (!sold && e.kind === "unit" && units[e.type]?.kind !== "infantry")
      this.crates.push({ id: this.nextId++, type: "salvage", x: e.x, z: e.z });
    if (
      !sold &&
      e.kind === "building" &&
      e.owner >= 0 &&
      this.players[e.owner].faction === "gla" &&
      e.type !== "gla_hq"
    )
      this.fields.push({
        x: e.x,
        z: e.z,
        radius: 5,
        time: 18,
        damage: 0,
        type: "hole",
        owner: e.owner,
        building: e.type,
      });
  },
  collect(e, c) {
    if (c.type === "cash") this.income(e.owner, 500, e);
    if (c.type === "heal") e.hp = e.maxHp;
    if (c.type === "veterancy") {
      e.xp += 500;
      e.veterancy = combat.veterancy.filter((n) => e.xp >= n).length - 1;
    }
    if (c.type === "upgrade" || c.type === "salvage") {
      e.salvage = Math.min(3, e.salvage + 1);
      const gain = 75 * (this.effects(e.owner).salvage || 1);
      e.maxHp += gain;
      e.hp += gain;
      e.xp += 150;
      e.veterancy = combat.veterancy.filter((n) => e.xp >= n).length - 1;
    }
    if (c.type === "reveal") {
      this.players[e.owner].revealUntil = this.time + 12;
    }
    this.emit("crate", { owner: e.owner, name: c.type, x: e.x, z: e.z });
  },
  ability(e, ability, targetId) {
    const d = units[e.type],
      t = this.get(targetId);
    if (!d) return "Geen eenheid";
    if (
      ability === "camouflage" &&
      !this.players[e.owner].upgrades.includes("camouflage")
    )
      return "Onderzoek Camouflage";
    if (
      ["camouflage", "disguise"].includes(ability) &&
      d.abilities?.includes(ability)
    ) {
      e.status[ability] = true;
      return null;
    }
    if (ability.startsWith("overlord_") && d.abilities?.includes(ability)) {
      const p = this.players[e.owner];
      if (p.cash < 500) return "Onvoldoende credits";
      if (e.attachments.includes(ability)) return "Al geïnstalleerd";
      p.cash -= 500;
      e.attachments.push(ability);
      return null;
    }
    if (
      ["disable", "snipe", "sabotage", "hijack", "cash_hack"].includes(
        ability,
      ) &&
      d.abilities?.includes(ability)
    ) {
      if (ability === "cash_hack") {
        if (e.abilityCooldown > this.time) return "Ability koelt af";
        e.abilityCooldown = this.time + 20;
        this.income(e.owner, 300, e);
        return null;
      }
      if (!t) return "Kies een doelwit";
      e.order = { type: ability, targetId };
      return null;
    }
    return "Niet beschikbaar";
  },
  power(owner, id, x, z) {
    const p = this.players[owner],
      d = powers[id];
    if (!p.unlocked.includes(id) || !d) return "Power niet ontgrendeld";
    if (p.cooldowns[id] > 0) return "Power koelt af";
    p.cooldowns[id] = d.cooldown;
    const enemies = this.spatial
      .query(x, z, d.radius)
      .filter((e) => this.enemy(owner, e.owner));
    if (["strike", "toxin"].includes(d.effect)) {
      this.blast(
        x,
        z,
        d.radius,
        d.damage,
        d.effect === "toxin" ? "Toxin" : "Explosion",
        owner,
        null,
      );
      if (d.effect === "toxin")
        this.fields.push({
          x,
          z,
          radius: d.radius,
          time: 20,
          damage: 12,
          type: "Toxin",
          owner,
        });
    }
    if (d.effect === "repair")
      for (const e of this.spatial.query(x, z, d.radius))
        if (e.owner === owner) e.hp = Math.min(e.maxHp, e.hp + 500);
    if (d.effect === "emp") for (const e of enemies) e.status.emp = 12;
    if (d.effect === "cash") {
      const enemy = this.players.find(
        (e) => this.enemy(owner, e.id) && !e.eliminated,
      );
      const cash = Math.min(1000, enemy?.cash || 0);
      if (enemy) enemy.cash -= cash;
      this.income(owner, cash);
    }
    if (d.effect === "reveal") p.revealUntil = this.time + 15;
    if (d.effect === "spawn")
      for (let i = 0; i < 5; i++)
        this.add(
          p.faction === "gla"
            ? "terrorist"
            : p.faction === "china"
              ? "red_guard"
              : "ranger",
          owner,
          x + i * 6,
          z,
        );
    if (d.effect === "tunnel") this.add("tunnel", owner, x, z, true);
    if (d.effect === "mines")
      for (let i = 0; i < 8; i++)
        this.fields.push({
          x: x + (this.random() - 0.5) * d.radius,
          z: z + (this.random() - 0.5) * d.radius,
          radius: 12,
          time: 180,
          damage: 600,
          type: "mine",
          owner,
        });
    this.emit("power", { name: d.name, x, z, owner });
    return null;
  },
};
