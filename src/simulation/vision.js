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
export const visionMethods = {
  radar(owner = 0) {
    return (
      !this.players[owner].lowPower &&
      (this.has(owner, "hq") ||
        this.units.some((e) => e.owner === owner && units[e.type]?.radar))
    );
  },
  updateFog() {
    this.visible.fill(0);
    if (this.player.revealUntil > this.time) {
      this.visible.fill(1);
      this.explored.fill(1);
      this.rememberBuildings();
      return;
    }
    const n = this.fogSize,
      cell = this.map.size / n;
    for (const e of this.entities) {
      if (
        !alive(e) ||
        e.inside ||
        e.owner < 0 ||
        this.players[e.owner].team !== this.player.team
      )
        continue;
      const d = def(e) || { sight: 0 };
      const cx = Math.floor((e.x + this.map.size / 2) / cell),
        cz = Math.floor((e.z + this.map.size / 2) / cell),
        r = Math.ceil((d.sight || 100) / cell);
      for (let x = Math.max(0, cx - r); x <= Math.min(n - 1, cx + r); x++)
        for (let z = Math.max(0, cz - r); z <= Math.min(n - 1, cz + r); z++)
          if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) {
            this.visible[x + z * n] = 1;
            this.explored[x + z * n] = 1;
          }
    }
    this.rememberBuildings();
  },
  rememberBuildings() {
    for (const b of this.buildings) {
      if (b.owner !== 0 && !this.isVisible(b)) continue;
      this.knownBuildings[b.id] = { id: b.id, kind: 'building', type: b.type, owner: b.owner,
        x: b.x, z: b.z, rotation: b.rotation, hp: b.hp, maxHp: b.maxHp,
        radius: b.radius, progress: b.progress, veterancy: b.veterancy,
        inside: null, status: {}, passengers: [], attachments: [] };
    }
    for (const [id, b] of Object.entries(this.knownBuildings)) {
      const index = clamp(Math.floor((b.x / this.map.size + 0.5) * 64), 0, 63) +
        clamp(Math.floor((b.z / this.map.size + 0.5) * 64), 0, 63) * 64;
      if (this.visible[index] && !this.get(Number(id))) delete this.knownBuildings[id];
    }
  },
  renderEntities() {
    const result = this.entities.filter(e => e.kind !== 'building' || e.owner === 0 || this.isVisible(e));
    for (const b of Object.values(this.knownBuildings)) {
      const current = this.get(b.id);
      if (current?.owner === 0 || (current && this.isVisible(current))) continue;
      result.push({ ...b, memory: true });
    }
    return result;
  },
  isVisible(e) {
    const x = clamp(
        Math.floor(((e.x + this.map.size / 2) / this.map.size) * 64),
        0,
        63,
      ),
      z = clamp(
        Math.floor(((e.z + this.map.size / 2) / this.map.size) * 64),
        0,
        63,
      );
    return !!this.visible[x + z * 64] && (e.owner < 0 || this.detected(e, 0));
  },
};
