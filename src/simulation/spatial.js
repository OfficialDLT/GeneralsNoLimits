export class SpatialHash {
  constructor(cell = 64) {
    this.cell = cell;
    this.cells = new Map();
  }
  key(x, z) {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
  }
  rebuild(entities) {
    this.cells.clear();
    for (const e of entities) {
      if (e.hp <= 0 || e.inside) continue;
      const key = this.key(e.x, e.z);
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(e);
    }
  }
  query(x, z, r) {
    const out = [];
    for (
      let a = Math.floor((x - r) / this.cell);
      a <= Math.floor((x + r) / this.cell);
      a++
    )
      for (
        let b = Math.floor((z - r) / this.cell);
        b <= Math.floor((z + r) / this.cell);
        b++
      )
        for (const e of this.cells.get(`${a},${b}`) || [])
          if ((e.x - x) ** 2 + (e.z - z) ** 2 <= r * r) out.push(e);
    return out;
  }
}
export class Pool {
  constructor(create) {
    this.create = create;
    this.free = [];
  }
  take(values) {
    return Object.assign(this.free.pop() || this.create(), values);
  }
  release(item) {
    for (const key of Object.keys(item)) delete item[key];
    this.free.push(item);
  }
}
