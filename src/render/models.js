import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyWeathering } from './materials.js';
const neutralMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.78,
  metalness: 0.16,
});
// Node-based catalog validation can import models without a browser or GPU.
if (typeof document !== 'undefined') {
  const surface = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/weathered-steel.png`);
  surface.wrapS = surface.wrapT = THREE.RepeatWrapping;
  surface.colorSpace = THREE.SRGBColorSpace;
  applyWeathering(neutralMaterial, surface);
}
export function box(g, w, h, d, color, x = 0, y = h / 2, z = 0) {
  return part(g, new THREE.BoxGeometry(w, h, d), color, x, y, z);
}
function part(g, geometry, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
  );
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function cylinder(g, r, h, color, x = 0, y = h / 2, z = 0, r2 = r, n = 10) {
  return part(g, new THREE.CylinderGeometry(r2, r, h, n), color, x, y, z);
}
function sphere(g, r, color, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = part(g, new THREE.SphereGeometry(r, 10, 7), color, x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}
function barrel(g, r, length, color, x, y, z) {
  const m = cylinder(g, r, length, color, x, y, z);
  m.rotation.x = Math.PI / 2;
  return m;
}
function wedge(g, w, h, d, color, x = 0, y = h / 2, z = 0) {
  const v = [
    -w / 2,
    -h / 2,
    -d / 2,
    w / 2,
    -h / 2,
    -d / 2,
    w / 2,
    -h / 2,
    d / 2,
    -w / 2,
    -h / 2,
    d / 2,
    -w * 0.44,
    h / 2,
    -d / 2 + 0.7,
    w * 0.44,
    h / 2,
    -d / 2 + 0.7,
    w * 0.44,
    h / 2,
    d / 2 - 0.3,
    -w * 0.44,
    h / 2,
    d / 2 - 0.3,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  geo.setIndex([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2,
    3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
  ]);
  geo.computeVertexNormals();
  return part(g, geo, color, x, y, z);
}
function fin(g, points, color, y = 0) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) =>
    i ? shape.lineTo(x, -z) : shape.moveTo(x, -z),
  );
  shape.closePath();
  const mesh = part(
    g,
    new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }),
    color,
    0,
    y,
    0,
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
// Merge vertex-coloured parts into a single draw call; colours are baked into the geometry.
export function bake(group) {
  group.updateMatrixWorld(true);
  const parts = [],
    dynamic = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.dynamic) {
      dynamic.push(o);
      return;
    }
    const geo = o.geometry.index
      ? o.geometry.toNonIndexed()
      : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    const c = o.material.color,
      colors = [];
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const shade = 0.96 + 0.04 * Math.sin(i * 2.11);
      colors.push(c.r * shade, c.g * shade, c.b * shade);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.deleteAttribute("uv");
    parts.push(geo);
  });
  const result = new THREE.Group();
  if (parts.length) {
    const merged = mergeGeometries(parts, false);
    const mesh = new THREE.Mesh(merged, neutralMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    result.add(mesh);
    parts.forEach((p) => p.dispose());
  }
  for (const o of dynamic) {
    o.parent.remove(o);
    o.position.setFromMatrixPosition(o.matrixWorld);
    o.castShadow = true;
    result.add(o);
  }
  group.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      if (o.material !== neutralMaterial) o.material.dispose();
    }
  });
  return result;
}
function palette(faction, color) {
  return {
    body:
      faction === "usa"
        ? 0xb2aa8b
        : faction === "china"
          ? 0x747a48
          : faction === "gla"
            ? 0xa1936b
            : 0x9f9b8f,
    light:
      faction === "usa" ? 0xd5d0b5 : faction === "china" ? 0x9a9d66 : 0xc9ba92,
    dark: 0x333b3b,
    track: 0x20282a,
    glass: 0x367d89,
    trim: new THREE.Color(color).getHex(),
    red: 0x965146,
  };
}
function tracks(g, p, w = 6, d = 8) {
  for (const x of [-w / 2, w / 2]) {
    box(g, 1.25, 1.65, d, p.track, x, 1.0, 0);
    for (let z = -d / 2 + 0.8; z < d / 2; z += 1.25) {
      const wheel = cylinder(
        g,
        0.65,
        0.25,
        0x737568,
        x + Math.sign(x) * 0.67,
        1,
        z,
        0.65,
        8,
      );
      wheel.rotation.z = Math.PI / 2;
    }
    box(g, 1.4, 0.35, d + 0.2, p.body, x, 1.95, 0);
  }
}
function wheels(g, p, w = 5, d = 7, axles = 2) {
  for (let i = 0; i < axles; i++)
    for (const x of [-w / 2, w / 2]) {
      const z = -d / 2 + 1.2 + (i * (d - 2.4)) / (axles - 1);
      const m = cylinder(g, 0.95, 0.7, p.track, x, 1, z, 0.95, 10);
      m.rotation.z = Math.PI / 2;
      const hub = cylinder(g, 0.42, 0.74, 0x858677, x, 1, z, 0.42, 8);
      hub.rotation.z = Math.PI / 2;
    }
}
function infantry(type, d, p) {
  const g = new THREE.Group(),
    hero = d.hero;
  const worker = d.builder,
    hacker = type === "hacker";
  const suit = worker
    ? 0xc2af7c
    : type === "lotus"
      ? 0x303b44
      : type === "jarmen"
        ? 0x77775c
        : p.body;
  box(g, 0.52, 1.65, 0.65, p.dark, -0.42, 0.9);
  box(g, 0.52, 1.65, 0.65, p.dark, 0.42, 0.9);
  box(g, 0.7, 0.35, 1, p.track, -0.42, 0.2, -0.15);
  box(g, 0.7, 0.35, 1, p.track, 0.42, 0.2, -0.15);
  wedge(g, 1.7, 1.85, 1.0, suit, 0, 2.5);
  box(g, 1.05, 1.0, 0.2, p.trim, 0, 2.6, -0.54);
  box(g, 1.1, 1.3, 0.6, p.dark, 0, 2.6, 0.7);
  sphere(g, 0.52, 0xc6a789, 0, 4.0, 0, 0.86, 1.1, 0.85);
  if (type === "lotus") {
    sphere(g, 0.55, 0x232b30, 0, 4.25, 0.1, 1, 1, 0.9);
    box(g, 0.8, 0.65, 0.12, 0xc6a789, 0, 4.05, -0.42);
  } else if (type === "jarmen" || type.includes("rebel") || type === "rpg") {
    sphere(g, 0.58, p.light, 0, 4.25, 0.04, 1, 0.65, 1);
    box(g, 1.02, 0.25, 1.0, p.trim, 0, 4.31);
  } else if (!worker) {
    sphere(g, 0.62, hero ? 0x59664c : p.body, 0, 4.32, 0, 1, 0.65, 1);
    box(g, 1.25, 0.16, 1.3, p.dark, 0, 4.13, -0.08);
  }
  const left = box(g, 0.45, 1.5, 0.5, suit, -1, 2.75, -0.15);
  left.rotation.x = -0.45;
  const right = box(g, 0.45, 1.5, 0.5, suit, 0.9, 2.75, -0.4);
  right.rotation.x = -0.8;
  if (worker) {
    barrel(g, 0.09, 3.2, 0x6b573c, 1.1, 1.8, -0.3);
    box(g, 0.7, 0.8, 0.15, 0x838b8a, 1.1, 1.0, -1.5);
  } else if (hacker) {
    box(g, 1.8, 0.12, 1.1, p.dark, 0, 2.0, -1.1);
    const laptop = box(g, 1.8, 1.1, 0.1, p.dark, 0, 2.55, -1.65);
    box(g, 1.5, 0.8, 0.12, 0x66b9b7, 0, 2.6, -1.72);
  } else if (d.damageType === "Missile") {
    barrel(g, 0.32, 2.9, p.dark, 0.85, 3.05, -0.8);
    barrel(g, 0.38, 0.5, p.trim, 0.85, 3.05, -2.25);
  } else {
    box(g, 0.28, 0.4, 2.5, p.dark, 0.8, 2.7, -1.0);
    box(
      g,
      0.12,
      0.18,
      d.hero || type === "pathfinder" ? 2.2 : 0.7,
      0x1d272b,
      0.8,
      2.8,
      d.hero ? -2.8 : -2.1,
    );
  }
  if (hero) box(g, 0.3, 0.2, 0.2, 0xdfc56b, -0.45, 3.1, -0.58);
  if (type === "terrorist")
    for (let x = -0.6; x <= 0.6; x += 0.4)
      box(g, 0.26, 0.8, 0.26, 0x8c4e3c, x, 2.2, -0.65);
  if (type === "angry_mob") {
    const mob = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const member = g.clone();
      member.position.set(
        ((i % 2) - 0.5) * 2.4,
        0,
        (Math.floor(i / 2) - 0.5) * 2.4,
      );
      mob.add(member);
    }
    return mob;
  }
  return g;
}
function vehicle(type, d, p) {
  const g = new THREE.Group(),
    heavy = ["overlord", "emperor"].includes(type),
    truck = ["supply_truck", "bomb_truck", "troop_crawler"].includes(type),
    artillery = ["tomahawk", "scud_launcher"].includes(type),
    tracked = d.kind === "tank" || artillery || d.builder;
  if (d.kind === "boat") {
    wedge(g, 7, 2.5, 14, p.dark, 0, 1.8);
    wedge(g, 6, 1, 12, p.body, 0, 3.2);
    box(g, 3, 2, 4, p.light, 0, 4.3, 1);
    box(g, 2, 0.5, 3, p.trim, 0, 5.5, 1);
    barrel(g, 0.3, 5, p.dark, 0, 4, -4);
    return g;
  }
  if (type === "demo_bike") {
    wheels(g, p, 1.2, 4, 2);
    box(g, 1.2, 1.5, 3, p.body, 0, 1.6);
    box(g, 0.8, 0.8, 1.5, p.dark, 0, 2.7);
    barrel(g, 0.5, 2.5, 0x9e5643, 0, 2, -2);
    return g;
  }
  if (tracked) tracks(g, p, heavy ? 8 : 6, heavy ? 11 : 8);
  else wheels(g, p, truck ? 6 : 5, truck ? 10 : 7, truck ? 3 : 2);
  wedge(
    g,
    heavy ? 8 : truck ? 6 : 5.5,
    1.6,
    heavy ? 10 : truck ? 10 : 7,
    p.body,
    0,
    2.2,
  );
  box(g, tracked ? 5.5 : 5, 0.3, 1, p.trim, 0, 3.1, -2.4);
  box(g, 4, 0.25, 1, p.dark, 0, 3.1, 2.7);
  if (d.builder) {
    box(g, 3, 3, 3, 0xb7a965, 0, 3.7, 1);
    box(g, 2.7, 1.5, 0.15, p.glass, 0, 4, -0.6);
    for (const x of [-2.3, 2.3]) box(g, 0.35, 1, 5, p.dark, x, 1.4, -3);
    wedge(g, 8, 2, 1, 0xaeb0a4, 0, 1.2, -5);
    box(g, 3, 0.5, 2, p.trim, 0, 5.4, 1);
  } else if (artillery) {
    const launcher = new THREE.Group();
    for (const x of [-1.2, 1.2]) {
      box(launcher, 1.6, 1.5, 7, p.dark, x, 3.8, -0.6);
      barrel(launcher, 0.45, 5, p.light, x, 4.4, -1);
      sphere(launcher, 0.45, p.trim, x, 4.4, -3.6, 1, 1, 1.8);
    }
    g.add(launcher);
    box(g, 4, 1.4, 2, p.body, 0, 3.7, 2.5);
  } else if (d.kind === "tank") {
    wedge(g, heavy ? 6 : 3.8, 1.4, heavy ? 5.5 : 4, p.light, 0, 3.65);
    const count = heavy ? 2 : type === "gatling_tank" ? 4 : 1;
    for (let i = 0; i < count; i++)
      barrel(
        g,
        type === "dragon_tank" ? 0.6 : 0.28,
        heavy ? 8 : 6,
        p.dark,
        (i - (count - 1) / 2) * 0.6,
        4,
        -5,
      );
    cylinder(g, 0.9, 0.35, p.dark, 0.8, 4.5, 1);
    box(g, 1.4, 0.25, 1.7, p.trim, -1.1, 4.45, 0);
    if (heavy) {
      box(g, 2, 2, 2, p.body, 0, 5.3, 1.2);
      cylinder(g, 0.7, 1, p.trim, 0, 6.5, 1.2);
    }
    if (d.laserDefense || type === "laser_crusader") {
      sphere(g, 0.5, 0x68e8f6, 1.4, 4.8, -1);
      barrel(g, 0.18, 2, p.trim, 1.4, 4.8, -2);
    }
  } else {
    box(
      g,
      truck ? 5 : 4.3,
      2.4,
      truck ? 3 : 5,
      p.light,
      0,
      3.6,
      truck ? -3 : 0,
    );
    box(g, truck ? 4.6 : 3.9, 1.1, 0.15, p.glass, 0, 4, -(truck ? 4.55 : 2.6));
    for (const x of [-2, 2]) box(g, 0.1, 1, 2, p.glass, x, 4, -1);
    if (truck) {
      box(
        g,
        5.6,
        2.8,
        5.5,
        type === "bomb_truck" ? 0x887657 : p.body,
        0,
        3.8,
        2,
      );
      for (const z of [0, 1.5, 3]) box(g, 5.8, 0.22, 0.3, p.dark, 0, 5.3, z);
    }
    if (type === "ambulance") {
      box(g, 1.4, 0.25, 0.45, 0xe2d9b9, 0, 5.0, 0);
      box(g, 0.45, 0.25, 1.4, 0xd27259, 0, 5.04, 0);
    } else if (type === "radar_van") {
      const dish = cylinder(g, 1.6, 0.45, p.light, 0, 6.5, 1, 0.3, 12);
      dish.rotation.x = 0.5;
      box(g, 0.18, 2, 0.18, p.dark, 0, 5.8, 1);
    } else if (d.damage > 0 && !truck) {
      box(g, 1.4, 0.6, 2, p.dark, 0, 5.0, 0);
      barrel(g, 0.18, 3, p.dark, 0, 5.4, -2);
    }
  }
  for (const x of [-1.8, 1.8]) {
    box(g, 0.5, 0.35, 0.15, 0xf3e5b2, x, 2.6, -(truck ? 5.1 : 3.6));
    box(g, 0.45, 0.25, 0.15, p.red, x, 2.3, truck ? 5.1 : 3.6);
  }
  box(g, 0.1, 3, 0.1, p.dark, -2, 4.2, 2.4);
  return g;
}
function aircraft(type, d, p) {
  const g = new THREE.Group(),
    helicopter = ["comanche", "chinook", "helix"].includes(type);
  if (helicopter) {
    const cargo = type === "chinook" || type === "helix";
    sphere(
      g,
      1,
      p.body,
      0,
      3,
      0,
      cargo ? 3.3 : 1.7,
      cargo ? 2.2 : 1.4,
      cargo ? 6 : 4.2,
    );
    sphere(
      g,
      1,
      p.glass,
      0,
      3,
      -(cargo ? 4.2 : 3.0),
      cargo ? 2.9 : 1.5,
      1.4,
      2,
    );
    box(g, cargo ? 4 : 2, 0.4, 2, p.trim, 0, 4.8, 0);
    if (type !== "chinook") {
      box(g, 0.5, 0.6, 8, p.body, 0, 3, 5);
      box(g, 4, 0.18, 1, p.dark, 0, 3, 8);
      box(g, 0.3, 2, 2, p.body, 0, 4, 8);
    }
    for (const z of type === "chinook" ? [-3.5, 3.5] : [0]) {
      cylinder(g, 0.3, 2, p.dark, 0, 5, z);
      const rotor = new THREE.Group();
      rotor.position.set(0, 0, 0);
      for (const angle of [0, Math.PI / 2]) {
        const blade = box(rotor, 17, 0.12, 0.7, 0x273337, 0, 0, 0);
        blade.rotation.y = angle;
      }
      rotor.name = "rotor";
      const baked = bake(rotor);
      for (const child of baked.children) {
        child.userData.dynamic = true;
        child.name = "rotor";
        child.position.y = 6;
        child.position.z = z;
        g.add(child);
      }
    }
    for (const x of [-2, 2]) {
      box(g, 0.18, 1, 0.18, p.dark, x, 1.1, 0);
      box(g, 0.25, 0.25, 7, p.dark, x, 0.6, 0);
      if (!cargo) barrel(g, 0.4, 3, p.dark, x, 2.7, -2);
    }
    return g;
  }
  const bomber = ["b52", "aurora", "alpha_aurora"].includes(type),
    stealth = type === "stealth_fighter";
  const span = bomber ? 19 : 15,
    length = bomber ? 20 : 14;
  sphere(g, 1, p.body, 0, 1, 0, 1.7, 1, length / 2);
  sphere(g, 0.9, p.glass, 0, 2, -length * 0.22, 0.7, 0.5, 1.5);
  fin(
    g,
    [
      [-span / 2, 3],
      [-1, -length * 0.28],
      [0, -length * 0.48],
      [1, -length * 0.28],
      [span / 2, 3],
      [span / 2 - 1, 4],
      [2, 2],
      [1, length * 0.42],
      [-1, length * 0.42],
      [-2, 2],
      [-span / 2 + 1, 4],
    ],
    stealth ? p.dark : p.light,
    1,
  );
  for (const x of [-1.5, 1.5]) {
    box(g, 0.4, 2.5, 3, p.body, x, 2.3, length * 0.3);
    barrel(g, 0.6, 5, p.dark, x, 0.8, length * 0.1);
    barrel(g, 0.42, 0.6, 0x80b9d6, x, 0.8, length * 0.3);
    box(g, 1, 0.15, 2, p.trim, x * 3.6, 1.35, 1.8);
    if (!stealth) barrel(g, 0.22, 3, p.light, x * 3.6, 0.55, -1);
  }
  if (bomber) for (const x of [-5.5, 5.5]) barrel(g, 0.6, 3, p.dark, x, 0.4, 1);
  return g;
}
function windows(g, p, w, d, y = 5) {
  for (let x = -w / 2 + 2; x < w / 2; x += 3.5) {
    box(g, 1.8, 1.5, 0.15, p.glass, x, y, -d / 2 - 0.05);
    box(g, 2, 0.2, 0.3, p.dark, x, y - 1, -d / 2 - 0.1);
  }
}
function building(type, d, p) {
  const g = new THREE.Group(),
    f = d.faction,
    role = d.role;
  const w = ["hq", "factory", "airfield", "tech", "super"].includes(role)
      ? 29
      : 21,
    depth = role === "factory" ? 26 : role === "hq" ? 25 : 18;
  box(g, w + 4, 1, depth + 4, 0x777b73);
  for (let x = -w / 2; x < w / 2; x += 5)
    box(g, 0.15, 0.04, depth + 3, 0x5c625d, x, 0.54);
  box(g, w + 3, 0.6, 1, p.trim, 0, 1, -depth / 2 - 1);
  box(g, w + 3, 0.5, 1, p.dark, 0, 1, depth / 2 + 1);
  const wall = f === "gla" ? 0xb3a082 : f === "china" ? 0xaca88c : 0xd0cbb4;
  box(g, w, 7, depth, wall, 0, 4);
  box(g, w + 1, 0.8, depth + 1, p.dark, 0, 7.9);
  box(g, w, 0.4, depth, p.light, 0, 8.6);
  // Roof access, ventilation and masonry joints keep silhouettes readable at RTS scale.
  for (const x of [-w / 2 + 3, w / 2 - 3]) {
    box(g, 4, 1.6, 3, 0x73796e, x, 9.4, 2);
    for (let n = -1; n <= 1; n++) box(g, 0.25, 0.08, 2.5, p.dark, x + n, 10.25, 2);
    cylinder(g, 0.4, 2.2, 0x727569, x, 9.8, depth / 2 - 2, 0.4, 8);
  }
  for (let x = -w / 2 + 4; x < w / 2; x += 5) {
    box(g, 0.16, 6.4, 0.14, 0x8c8a79, x, 4.2, -depth / 2 - 0.12);
    box(g, 0.16, 6.4, 0.14, 0x8c8a79, x, 4.2, depth / 2 + 0.12);
  }
  box(g, 2.5, 4.8, 0.18, p.dark, -w / 2 + 4, 3.4, depth / 2 + 0.2);
  box(g, 2.1, 0.35, 0.25, 0xc8b98c, -w / 2 + 4, 6, depth / 2 + 0.3);
  for (let y = 2; y < 8; y += 1) box(g, 1.6, 0.12, 0.2, p.dark, w / 2 + 0.15, y, 1);
  for (const z of [0.3, 1.7]) box(g, 0.18, 7, 0.18, p.dark, w / 2 + 0.15, 4.5, z);
  windows(g, p, w, depth);
  for (const x of [-w / 2 + 1, w / 2 - 1])
    box(g, 1, 7, 1, p.light, x, 4, -depth / 2 - 0.1);
  if (f === "china") {
    const roof = box(g, w + 3, 1, depth + 3, 0x744842, 0, 9);
    roof.rotation.z = 0.02;
    box(g, w, 0.6, depth, 0xb3a05b, 0, 9.8);
    box(g, 4, 0.4, 4, p.trim, 0, 10.3);
  }
  if (f === "gla") {
    const dome = sphere(g, 5, 0xa99a70, w / 2 - 5, 9, depth / 2 - 5, 1, 0.6, 1);
    box(g, 8, 0.2, 6, 0x52654a, -w / 2 + 5, 10, -depth / 2 + 4);
    box(g, 0.2, 4, 0.2, p.dark, -w / 2 + 2, 9, -depth / 2 + 2);
  }
  if (role === "hq") {
    box(g, 11, 5, 9, wall, 0, 11);
    windows(g, p, 11, 9, 12);
    box(g, 12, 0.6, 10, p.trim, 0, 14);
    box(g, 0.3, 13, 0.3, p.dark, w / 2 - 4, 15, depth / 2 - 3);
    box(g, 5.5, 3, 0.12, p.trim, w / 2 - 1.2, 19, depth / 2 - 3);
    const radar = cylinder(g, 3.6, 0.4, p.light, -7, 12, 3, 0.8, 16);
    radar.rotation.x = 0.8;
    box(g, 0.4, 3, 0.4, p.dark, -7, 10, 3);
    box(g, 6, 0.5, 3, p.dark, 7, 9, 4);
  } else if (role === "factory") {
    box(g, 18, 6, 0.4, p.dark, 0, 3.6, -depth / 2 - 0.2);
    for (let z = 0; z < 5; z++)
      box(g, 18, 0.2, 0.6, 0x777a6c, 0, 1.3 + z, -depth / 2 - 0.5);
    for (const x of [-10, 10]) box(g, 1, 7, 1, p.trim, x, 4, -depth / 2 - 0.8);
    box(g, 19, 0.2, 8, 0x646b63, 0, 0.8, -depth / 2 - 4);
    for (let x = -8; x <= 8; x += 4)
      box(g, 2, 0.05, 3, 0xc4ad67, x, 0.95, -depth / 2 - 3);
    for (const x of [8, 11]) cylinder(g, 1.2, 10, p.dark, x, 13, 6);
    box(g, 5, 1, 6, p.trim, -8, 9, 4);
  } else if (role === "barracks") {
    box(g, 5, 5, 0.3, p.dark, 0, 3, -depth / 2 - 0.4);
    box(g, 10, 0.5, 4, p.body, 0, 6, -depth / 2 - 1.5);
    for (const x of [-w / 2 + 3, w / 2 - 3])
      for (const z of [-depth / 2 - 3, depth / 2 - 1])
        box(g, 3, 1.4, 2, 0x8a8062, x, 1.5, z);
    box(g, 0.2, 9, 0.2, p.dark, w / 2 + 1, 5, -depth / 2);
    box(g, 4, 2.5, 0.12, p.trim, w / 2 + 3, 8, -depth / 2);
  } else if (role === "power") {
    for (const x of [-5, 5]) {
      cylinder(g, 4, 10, 0xa6a696, x, 12, 0, 3.1, 16);
      cylinder(g, 4.4, 0.5, p.trim, x, 15, 0, 4.3, 16);
      cylinder(g, 3, 1, p.dark, x, 17, 0);
      if (f === "usa") sphere(g, 3, 0x70bec4, x, 11, 0, 1, 1, 1);
    }
  } else if (role === "supply" || role === "income") {
    for (const x of [-7, 1, 7]) {
      box(g, 5, 4, 4, 0x8a815c, x, 3, -depth / 2 - 3);
      box(g, 5.1, 0.35, 0.3, p.dark, x, 3, -depth / 2 - 5.1);
    }
    if (role === "income") {
      const dish = cylinder(g, 5, 0.5, p.light, 0, 14, 0, 0.6, 16);
      dish.rotation.x = 0.7;
      box(g, 0.5, 5, 0.5, p.dark, 0, 11, 0);
    } else {
      box(g, 1, 14, 1, p.dark, -9, 8, 1);
      box(g, 18, 1, 1, p.trim, -1, 15, 1);
    }
  } else if (role === "airfield") {
    box(g, w + 5, 0.2, 12, 0x525b5c, 0, 1, -depth / 2 - 6);
    for (let x = -12; x <= 12; x += 6)
      box(g, 3, 0.04, 0.25, 0xe3d8b0, x, 1.12, -depth / 2 - 6);
    box(g, 7, 12, 7, wall, w / 2 - 4, 11, depth / 2 - 4);
    box(g, 8, 3, 8, p.glass, w / 2 - 4, 17, depth / 2 - 4);
    box(g, 9, 0.5, 9, p.dark, w / 2 - 4, 19, depth / 2 - 4);
  } else if (role === "super") {
    if (f === "usa") {
      cylinder(g, 4, 9, p.dark, 0, 12);
      for (const x of [-5, 5]) {
        box(g, 2, 14, 2, p.light, x, 17);
        box(g, 1, 8, 1, 0x73dce1, x, 18);
      }
      sphere(g, 3, 0x75cbd0, 0, 21, 0);
    } else if (f === "china") {
      cylinder(g, 7, 1, p.dark, 0, 9);
      cylinder(g, 5, 0.5, p.trim, 0, 9.8);
      barrel(g, 1.8, 13, p.light, 0, 15, 0).rotation.x = 0;
      for (let x = -1.5; x < 2; x += 3) box(g, 0.2, 17, 0.2, p.dark, x, 15, 2);
    } else {
      for (const x of [-7, 0, 7]) {
        barrel(g, 0.8, 14, p.dark, x, 12, 0);
        sphere(g, 0.9, p.light, x, 12, -7, 1, 1, 2);
      }
      box(g, 24, 2, 10, p.trim, 0, 10);
    }
  } else if (role === "defense") {
    const base = cylinder(g, 6, 1, p.dark, 0, 9);
    if (type === "bunker" || type === "tunnel") {
      box(g, 12, 3, 10, p.body, 0, 10);
      for (const x of [-4, 0, 4]) box(g, 2, 1, 0.2, p.dark, x, 10, -5.1);
    } else {
      box(g, 8, 2, 8, p.body, 0, 10);
      for (const x of [-3, -1, 1, 3])
        barrel(g, type.includes("china") ? 0.18 : 0.5, 9, p.dark, x, 12, -2);
      box(g, 6, 0.3, 2, p.trim, 0, 12.7, 1);
    }
  } else if (
    ["tech", "hospital", "repair", "refinery", "reinforcement"].includes(role)
  ) {
    box(g, 12, 4, 10, wall, 0, 11);
    box(g, 13, 0.6, 11, p.trim, 0, 13);
    if (role === "tech") {
      const dish = cylinder(g, 4, 0.5, p.light, 0, 17, 0, 0.5, 16);
      dish.rotation.x = 0.8;
    }
    if (role === "hospital") {
      box(g, 5, 0.2, 1, 0xa34d44, 0, 13.5);
      box(g, 1, 0.2, 5, 0xa34d44, 0, 13.6);
    }
  } else if (role === "oil") {
    for (const x of [-4, 4]) {
      const leg = box(g, 0.8, 15, 0.8, p.dark, x, 15);
      leg.rotation.z = x > 0 ? 0.2 : -0.2;
    }
    box(g, 14, 0.8, 1, p.dark, 0, 21);
    cylinder(g, 2, 10, p.body, 8, 8, 0);
  }
  return g;
}
export function entityModel(type, d, color = "#63b9ff") {
  const p = palette(d.faction, color);
  let g = d.role
    ? building(type, d, p)
    : d.kind === "air"
      ? aircraft(type, d, p)
      : d.kind === "infantry" || type === "civilian_unit"
        ? infantry(type, d, p)
        : vehicle(type, d, p);
  if (d.role) g.rotation.y = Math.PI;
  return bake(g);
}
// Retained primitive API for scenery and older prototype integrations.
export function model(type) {
  return entityModel(
    type,
    type === "soldier"
      ? { kind: "infantry", faction: "usa" }
      : type === "tank"
        ? { kind: "tank", faction: "usa", damage: 55 }
        : { role: type, faction: "usa" },
  );
}
