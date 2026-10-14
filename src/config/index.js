import factions from "./factions.json" with { type: "json" };
import units from "./units.json" with { type: "json" };
import buildings from "./buildings.json" with { type: "json" };
import upgrades from "./upgrades.json" with { type: "json" };
import powers from "./powers.json" with { type: "json" };
import combat from "./combat.json" with { type: "json" };
import maps from "./maps.json" with { type: "json" };
import missions from "./missions.json" with { type: "json" };
export { factions, units, buildings, upgrades, powers, combat, maps, missions };
export const definition = (e) =>
  e.kind === "building" ? buildings[e.type] : units[e.type];
