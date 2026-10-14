export const MAP_SIZE = 2000;
export const RULES = {
  hq: { name: 'Hoofdkwartier', cost: 0, radius: 20, capacity: 10 },
  barracks: { name: 'Barracks', cost: 400, radius: 12, capacity: 20 },
  factory: { name: 'Tankfabriek', cost: 700, radius: 18, capacity: 0 },
  soldier: { name: 'Soldaat', cost: 100, population: 1, seconds: 3, producer: 'barracks', speed: 25 },
  tank: { name: 'Tank', cost: 300, population: 3, seconds: 6, producer: 'factory', speed: 17 },
};
export function capacity(buildings) { return buildings.reduce((sum, b) => sum + (RULES[b.type].capacity || 0), 0); }
export function population(units, buildings) { return units.reduce((sum, u) => sum + RULES[u.type].population, 0) + buildings.reduce((sum, b) => sum + b.queue.reduce((n, q) => n + RULES[q.type].population, 0), 0); }
export function canPlace(type, x, z, buildings) {
  const r = RULES[type].radius;
  return Math.abs(x) < MAP_SIZE / 2 - r && Math.abs(z) < MAP_SIZE / 2 - r && buildings.every(b => Math.hypot(b.x - x, b.z - z) > RULES[b.type].radius + r + 8);
}
export function enqueue(type, building, state) {
  const rule = RULES[type];
  if (building.type !== rule.producer) return 'Selecteer het juiste productiegebouw.';
  if (building.queue.length >= 5) return 'Productiewachtrij is vol.';
  if (state.money < rule.cost) return 'Onvoldoende credits.';
  if (population(state.units, state.buildings) + rule.population > capacity(state.buildings)) return 'Bouw meer barracks voor populatieruimte.';
  state.money -= rule.cost;
  building.queue.push({ type, remaining: rule.seconds });
  return null;
}
