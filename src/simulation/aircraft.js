import { units, buildings } from '../config/index.js';
import { AIRFIELD, airfieldPoint } from '../config/airfield.js';
import { distance, clamp } from './world.js';

export const aircraftMethods = {
  aircraftBase(e) {
    let base = this.get(e.homeAirfieldId);
    const valid = b => b && b.owner === e.owner && b.progress === 1 && buildings[b.type]?.role === 'airfield';
    if (valid(base)) return base;
    e.homeAirfieldId = null;
    e.parkingSlot = null;
    base = this.buildings.filter(valid).sort((a, b) => distance(a, e) - distance(b, e))
      .find(b => this.units.filter(u => u.id !== e.id && u.homeAirfieldId === b.id && units[u.type]?.ammo != null).length < AIRFIELD.capacity);
    if (!base) return null;
    const used = new Set(this.units.filter(u => u.id !== e.id && u.homeAirfieldId === base.id).map(u => u.parkingSlot));
    e.homeAirfieldId = base.id;
    e.parkingSlot = AIRFIELD.parkingZ.findIndex((_, i) => !used.has(i));
    e.flightState = 'returning';
    e.landed = false;
    e.rearm = 0;
    return base;
  },
  baseAircraft(e, base) {
    e.homeAirfieldId = null;
    // Production puts each aircraft directly in a free hangar of its own airfield.
    const used = new Set(this.units.filter(u => u.id !== e.id && u.homeAirfieldId === base.id).map(u => u.parkingSlot));
    const slot = AIRFIELD.parkingZ.findIndex((_, i) => !used.has(i));
    if (slot < 0) return;
    e.homeAirfieldId = base.id;
    e.parkingSlot = slot;
    Object.assign(e, airfieldPoint(base, AIRFIELD.parkingX, AIRFIELD.parkingZ[slot]));
    e.flightState = 'parked';
    e.altitude = 1.2;
    e.landed = true;
    e.rotation = (base.rotation || 0) - Math.PI / 2;
  },
  flyTo(e, point, dt, speed) {
    const dx = point.x - e.x, dz = point.z - e.z, length = Math.hypot(dx, dz);
    const step = Math.min(length, speed * dt);
    if (length > 0.01) {
      e.rotation = Math.atan2(-dx, -dz);
      e.x = clamp(e.x + dx / length * step, -this.map.size / 2 + 4, this.map.size / 2 - 4);
      e.z = clamp(e.z + dz / length * step, -this.map.size / 2 + 4, this.map.size / 2 - 4);
    }
    e.path = length > 2 ? [{ ...point }] : [];
    return distance(e, point) < 2;
  },
  orbitAircraft(e, center, dt, radius, speed) {
    // A small point ahead on the circle gives continuous banking without teleporting.
    const angle = Math.atan2(e.z - center.z, e.x - center.x) + speed * dt / radius;
    this.flyTo(e, { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius }, dt, speed);
    e.bank = -0.2;
  },
  stepAircraft(e, dt) {
    const d = units[e.type], speed = d.speed * (this.effects(e.owner).speed || 1);
    const previousBase = e.homeAirfieldId;
    const base = this.aircraftBase(e);
    e.altitude ??= e.landed ? 1.2 : 28;
    e.bank = 0;
    let order = e.order, target = this.get(order.targetId);
    if (order.type === 'attack' && (!target || !this.enemy(e.owner, target.owner) || !this.detected(target, e.owner))) {
      e.order = order = { type: 'guard' };
      target = null;
    }
    const mission = ['attack', 'attackMove', 'move', 'patrol', 'forceFire', 'scatter'].includes(order.type);
    if (previousBase && previousBase !== e.homeAirfieldId) {
      e.flightState = 'returning'; e.landed = false; e.rearm = 0;
    }
    if (!e.flightState) e.flightState = 'flying';
    if (!base && (e.ammo === 0 || !mission || e.flightState !== 'flying')) {
      e.flightState = 'holding'; e.landed = false;
      e.altitude = Math.min(28, e.altitude + dt * 8);
      this.orbitAircraft(e, this.players[e.owner].home, dt, 70, speed);
      return;
    }
    const start = base && airfieldPoint(base, AIRFIELD.runwayX, AIRFIELD.runwayStart);
    const end = base && airfieldPoint(base, AIRFIELD.runwayX, AIRFIELD.runwayEnd);
    const parking = base && airfieldPoint(base, AIRFIELD.parkingX, AIRFIELD.parkingZ[e.parkingSlot]);
    const runwayBusy = base && this.units.some(u => u.id !== e.id && u.homeAirfieldId === base.id && ['takeoff', 'landing'].includes(u.flightState));
    if (base && e.flightState === 'holding') e.flightState = 'returning';
    if (base && e.flightState === 'parked') {
      e.path = []; e.landed = true; e.altitude = 1.2;
      if (e.ammo < 4) { e.flightState = 'rearming'; e.rearm = 0; }
      else if (mission) { e.flightState = 'taxiOut'; e.taxiStage = 0; }
      return;
    }
    if (base && e.flightState === 'rearming') {
      e.landed = true; e.altitude = 1.2; e.path = [];
      e.rearm = (e.rearm || 0) + dt;
      if (e.rearm >= 3) {
        e.ammo = 4; e.rearm = 0; e.hp = Math.min(e.maxHp, e.hp + 100);
        e.flightState = 'parked';
      }
      return;
    }
    if (base && e.flightState === 'taxiOut') {
      if (!mission) { e.flightState = 'taxiIn'; e.taxiStage = 0; return; }
      e.landed = true; e.altitude = 1.2;
      const taxi = airfieldPoint(base, 0, AIRFIELD.parkingZ[e.parkingSlot]);
      if (this.flyTo(e, e.taxiStage ? start : taxi, dt, 18)) {
        if (e.taxiStage && !runwayBusy) { e.flightState = 'takeoff'; e.landed = false; }
        else e.taxiStage = 1;
      }
      return;
    }
    if (base && e.flightState === 'takeoff') {
      const ready = this.flyTo(e, end, dt, speed * 0.65);
      e.altitude = 1.2 + 26.8 * clamp(1 - distance(e, end) / 96, 0, 1);
      if (ready) e.flightState = 'flying';
      return;
    }
    if (base && (e.ammo === 0 || !mission) && e.flightState === 'flying') e.flightState = 'returning';
    if (base && e.flightState === 'returning') {
      e.landed = false; e.altitude = Math.min(28, e.altitude + dt * 10);
      if (runwayBusy) this.orbitAircraft(e, base, dt, 95, speed);
      else if (this.flyTo(e, end, dt, speed)) e.flightState = 'landing';
      return;
    }
    if (base && e.flightState === 'landing') {
      const ready = this.flyTo(e, start, dt, speed * 0.5);
      e.altitude = 1.2 + 26.8 * clamp(distance(e, start) / 96, 0, 1);
      if (ready) { e.flightState = 'taxiIn'; e.taxiStage = 0; e.landed = true; }
      return;
    }
    if (base && e.flightState === 'taxiIn') {
      e.altitude = 1.2; e.landed = true;
      const taxi = airfieldPoint(base, 0, AIRFIELD.parkingZ[e.parkingSlot]);
      if (this.flyTo(e, e.taxiStage ? parking : taxi, dt, 18)) {
        if (e.taxiStage) { e.flightState = e.ammo < 4 ? 'rearming' : 'parked'; e.rearm = 0; }
        else e.taxiStage = 1;
      }
      return;
    }
    e.flightState = 'flying'; e.landed = false; e.altitude = 28;
    if (e.ammo === 0) return;
    if (order.type === 'forceFire') target = { x: order.x, z: order.z, kind: 'ground', id: null };
    if (!target && ['attackMove', 'patrol'].includes(order.type)) target = this.findEnemy(e, d.range + 90, d.antiAir);
    if (target) {
      const radius = Math.max(25, Math.min(d.range * 0.65, 70));
      if (distance(e, target) > d.range * 0.95) this.flyTo(e, target, dt, speed);
      else {
        this.orbitAircraft(e, target, dt, radius, speed);
        if (e.cooldown <= 0 && distance(e, target) <= d.range) {
          this.fire(e, target);
          e.cooldown = d.reload / (1 + e.veterancy * 0.15);
          if (e.ammo === 0) e.flightState = 'returning';
        }
      }
      return;
    }
    if (['move', 'attackMove', 'scatter', 'patrol'].includes(order.type)) {
      if (this.flyTo(e, order, dt, speed)) {
        if (order.type === 'patrol') {
          const previous = { x: order.x, z: order.z };
          Object.assign(order, order.origin); order.origin = previous;
        } else if (e.waypoints?.length) e.order = { type: 'move', ...e.waypoints.shift() };
        else e.order = { type: 'guard' };
      }
    } else if (base) e.flightState = 'returning';
  },
};
