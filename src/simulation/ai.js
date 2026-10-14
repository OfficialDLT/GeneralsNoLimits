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
export const aiMethods = {
  ai() {
    for (const p of this.players.slice(1)) {
      if (p.eliminated) continue;
      const difficulty =
        { easy: 0.45, medium: 1, hard: 1.4, brutal: 2 }[
          this.settings.difficulty
        ] || 1;
      p.aiNext ??= 0;
      if (this.time < p.aiNext) continue;
      p.aiNext = this.time + 5 / difficulty;
      const bs = this.buildings.filter((b) => b.owner === p.id),
        ready = bs.filter((b) => b.progress === 1),
        builders = this.units.filter(
          (u) => u.owner === p.id && units[u.type]?.builder,
        ),
        role = bs.filter((b) => b.progress < 1).length
          ? null
          : !this.has(p.id, "power") && p.faction !== "gla"
            ? "power"
            : !this.has(p.id, "barracks")
              ? "barracks"
              : !this.has(p.id, "supply")
                ? "supply"
                : !this.has(p.id, "factory")
                  ? "factory"
                  : p.lowPower
                    ? "power"
                    : this.population(p.id) + 5 > this.capacity(p.id)
                      ? "barracks"
                      : !this.has(p.id, "tech")
                        ? "tech"
                        : !this.has(p.id, "income")
                          ? "income"
                          : !this.has(p.id, "airfield") && p.faction !== "gla"
                            ? "airfield"
                            : !this.has(p.id, "super")
                              ? "super"
                              : this.random() < 0.2
                                ? "defense"
                                : null;
      if (!builders.length) {
        const hq = ready.find((b) => buildings[b.type].role === "hq");
        if (hq)
          this.command(
            {
              type: "train",
              id: hq.id,
              unit: factions[p.faction].builder,
              owner: p.id,
            },
            false,
          );
      }
      if (role && buildings[p.faction + "_" + role] && builders.length) {
        for (let i = 0; i < 24; i++) {
          const angle = this.random() * Math.PI * 2,
            r = 90 + this.random() * 160,
            x = p.home.x + Math.cos(angle) * r,
            z = p.home.z + Math.sin(angle) * r;
          if (!this.canBuild(p.faction + "_" + role, p.id, x, z)) {
            this.command(
              {
                type: "build",
                building: p.faction + "_" + role,
                x,
                z,
                owner: p.id,
              },
              false,
            );
            break;
          }
        }
      }
      for (const b of ready) {
        const role = buildings[b.type].role;
        if (
          b.queue.length < 2 &&
          ["factory", "barracks", "airfield"].includes(role)
        ) {
          const available = this.availableUnits(p, role).filter(
            ([id, d]) => this.requirements(p.id, d) && !d.builder && !d.income,
          );
          const item = available[Math.floor(this.random() * available.length)];
          if (item)
            this.command(
              { type: "train", id: b.id, unit: item[0], owner: p.id },
              false,
            );
        }
        b.repair = b.hp < b.maxHp * 0.5;
      }
      const army = this.units.filter(
        (u) =>
          u.owner === p.id &&
          units[u.type]?.damage &&
          !units[u.type]?.collector,
      );
      const enemy = this.buildings
        .filter((e) => this.enemy(p.id, e.owner))
        .sort((a, b) => distance(a, p.home) - distance(b, p.home))[0];
      const count = this.settings.difficulty === "easy" ? 8 : 5;
      if (enemy && army.length >= count) {
        this.command(
          {
            type: "order",
            ids: army.map((e) => e.id),
            order: "attackMove",
            x: enemy.x,
            z: enemy.z,
            owner: p.id,
          },
          false,
        );
      }
      const depot = ready.find((b) => buildings[b.type].role === "supply");
      if (
        depot &&
        this.units.filter((u) => u.owner === p.id && units[u.type]?.collector)
          .length < 2
      ) {
        const producer =
          p.faction === "gla"
            ? ready.find((b) => buildings[b.type].role === "hq")
            : depot;
        if (producer)
          this.command(
            {
              type: "train",
              id: producer.id,
              unit: factions[p.faction].collector,
              owner: p.id,
            },
            false,
          );
      }
      if (
        this.time > 60 &&
        builders.length &&
        builders.every((u) => u.order.type !== "build") &&
        !this.supplies.some((s) => s.amount > 0 && distance(s, p.home) < 180)
      ) {
        const pile = this.supplies
          .filter((s) => s.amount > 0)
          .sort((a, b) => distance(a, p.home) - distance(b, p.home))[0];
        if (pile) {
          const spot = { x: pile.x + 65, z: pile.z };
          this.command(
            {
              type: "order",
              ids: [builders[0].id],
              order: "move",
              ...spot,
              owner: p.id,
            },
            false,
          );
          if (distance(builders[0], spot) < 250)
            this.command(
              {
                type: "build",
                building: p.faction + "_supply",
                ...spot,
                owner: p.id,
              },
              false,
            );
        }
      }
      if (army.length > 4 && this.random() < 0.3) {
        const target = this.buildings.find(
          (e) =>
            this.enemy(p.id, e.owner) && buildings[e.type].role === "supply",
        );
        if (target)
          this.command(
            {
              type: "order",
              ids: army.slice(0, 2).map((e) => e.id),
              order: "attackMove",
              x: target.x,
              z: target.z,
              owner: p.id,
            },
            false,
          );
      }
      if (p.cash > 2500) {
        for (const b of ready) {
          const research = Object.entries(upgrades).find(
            ([id, u]) =>
              (u.faction === "all" || u.faction === p.faction) &&
              u.building === buildings[b.type].role &&
              !p.upgrades.includes(id) &&
              !bs.some((b) => b.queue.some((q) => q.type === id)),
          );
          if (research) {
            this.command(
              { type: "research", id: b.id, upgrade: research[0], owner: p.id },
              false,
            );
            break;
          }
        }
      }
      if (p.points) {
        const choice = Object.entries(powers).find(
          ([id, d]) =>
            (d.faction === p.faction || d.faction === "all") &&
            d.rank <= p.rank &&
            !p.unlocked.includes(id),
        );
        if (choice)
          this.command(
            { type: "unlock", power: choice[0], owner: p.id },
            false,
          );
      }
      if (enemy) {
        for (const id of p.unlocked)
          if (!p.cooldowns[id]) this.power(p.id, id, enemy.x, enemy.z);
        for (const b of ready)
          if (
            buildings[b.type].role === "super" &&
            b.superCharge >= buildings[b.type].superTime
          )
            this.command(
              { type: "super", id: b.id, x: enemy.x, z: enemy.z, owner: p.id },
              false,
            );
      }
    }
  },
  objectives() {
    if (this.settings.mode !== "campaign") return [];
    const m = missions[this.player.faction];
    return m.objectives.map((id) => ({
      id,
      done:
        id === "supply"
          ? this.has(0, "supply")
          : id === "oil"
            ? this.has(0, "oil")
            : id === "tech"
              ? this.has(0, "tech")
              : id === "tanks"
                ? this.units.filter(
                    (u) => u.owner === 0 && units[u.type]?.kind === "tank",
                  ).length >= 5
                : id === "tunnels"
                  ? this.buildings.filter(
                      (b) => b.owner === 0 && b.type === "tunnel",
                    ).length >= 2
                  : id === "victory"
                    ? !this.buildings.some((b) => this.enemy(0, b.owner))
                    : false,
    }));
  },
  checkVictory() {
    if (this.time < 5) return;
    for (const p of this.players) {
      if (!p.eliminated && !this.buildings.some((b) => b.owner === p.id)) {
        p.eliminated = true;
        this.emit("eliminated", { owner: p.id });
      }
    }
    if (this.settings.mode === "sandbox") return;
    const allied = this.players.filter((p) => p.team === this.player.team),
      enemies = this.players.filter((p) => p.team !== this.player.team);
    if (allied.every((p) => p.eliminated)) {
      this.result = "defeat";
      this.emit("game_over", { result: this.result });
    } else if (
      enemies.length &&
      enemies.every((p) => p.eliminated) &&
      (this.settings.mode !== "campaign" ||
        this.objectives().every((o) => o.done))
    ) {
      this.result = "victory";
      this.emit("game_over", { result: this.result });
    }
  },
};
