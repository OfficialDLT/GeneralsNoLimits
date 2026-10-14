export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function water(map, x, z) {
  return Math.abs(x) < map.size * 0.035 && Math.abs(z) > map.size * 0.09;
}
export function cliff(map, x, z) {
  return (
    x > map.size * 0.12 &&
    x < map.size * 0.2 &&
    z > map.size * 0.12 &&
    z < map.size * 0.26
  );
}
export function height(map, x, z) {
  if (water(map, x, z)) return -3;
  if (cliff(map, x, z)) return 24;
  return 2 * Math.sin(x / 100) * Math.sin(z / 110);
}
export class Navigation {
  constructor(map) {
    this.map = map;
    this.cell = 12;
    this.n = Math.ceil(map.size / this.cell);
    this.blocked = new Set();
  }
  pos(x, z) {
    return [
      clamp(Math.floor((x + this.map.size / 2) / this.cell), 0, this.n - 1),
      clamp(Math.floor((z + this.map.size / 2) / this.cell), 0, this.n - 1),
    ];
  }
  point(i, j) {
    return {
      x: (i + 0.5) * this.cell - this.map.size / 2,
      z: (j + 0.5) * this.cell - this.map.size / 2,
    };
  }
  rebuild(buildings) {
    this.blocked.clear();
    for (const b of buildings) {
      if (b.hp <= 0) continue;
      const [i, j] = this.pos(b.x, b.z),
        r = Math.ceil(b.radius / this.cell);
      for (let x = i - r; x <= i + r; x++)
        for (let z = j - r; z <= j + r; z++)
          if (distance(this.point(x, z), b) < b.radius + 3)
            this.blocked.add(x + z * this.n);
    }
  }
  free(i, j, amphibious = false) {
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return false;
    const p = this.point(i, j);
    return (
      !this.blocked.has(i + j * this.n) &&
      !cliff(this.map, p.x, p.z) &&
      (amphibious || !water(this.map, p.x, p.z))
    );
  }
  path(start, end, amphibious = false) {
    let [si, sj] = this.pos(start.x, start.z),
      [ti, tj] = this.pos(end.x, end.z);
    if (!this.free(ti, tj, amphibious)) {
      let found = false;
      for (let r = 1; r < 12 && !found; r++)
        for (let a = -r; a <= r && !found; a++)
          for (let b = -r; b <= r; b++)
            if (this.free(ti + a, tj + b, amphibious)) {
              ti += a;
              tj += b;
              found = true;
              break;
            }
      if (!found) return [];
    }
    const key = (i, j) => i + j * this.n,
      startKey = key(si, sj),
      goal = key(ti, tj);
    const open = [{ i: si, j: sj, key: startKey, f: 0 }],
      g = new Map([[startKey, 0]]),
      parents = new Map(),
      closed = new Set();
    let iterations = 0;
    while (open.length && iterations++ < 10000) {
      let best = 0;
      for (let i = 1; i < open.length; i++)
        if (open[i].f < open[best].f) best = i;
      const cur = open.splice(best, 1)[0];
      if (cur.key === goal) {
        const route = [];
        let k = goal;
        while (k !== startKey) {
          route.push(this.point(k % this.n, Math.floor(k / this.n)));
          k = parents.get(k);
          if (k === undefined) return [];
        }
        return route.reverse();
      }
      if (closed.has(cur.key)) continue;
      closed.add(cur.key);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const i = cur.i + dx,
          j = cur.j + dz,
          k = key(i, j);
        if (
          !this.free(i, j, amphibious) ||
          closed.has(k) ||
          (dx &&
            dz &&
            (!this.free(cur.i + dx, cur.j, amphibious) ||
              !this.free(cur.i, cur.j + dz, amphibious)))
        )
          continue;
        const score = g.get(cur.key) + (dx && dz ? 1.414 : 1);
        if (score < (g.get(k) ?? Infinity)) {
          g.set(k, score);
          parents.set(k, cur.key);
          open.push({ i, j, key: k, f: score + Math.hypot(ti - i, tj - j) });
        }
      }
    }
    return [];
  }
}
