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
