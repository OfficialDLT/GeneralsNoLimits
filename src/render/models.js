import * as THREE from "three";
export function box(group, w, h, d, color, x = 0, y = h / 2, z = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
export function model(type) {
  const g = new THREE.Group();
  if (type === "soldier") {
    box(g, 1.4, 2.5, 1, 0x344c35, 0, 2.4);
    box(g, 1.2, 1.1, 1.2, 0xa6b98b, 0, 4.1);
    box(g, 0.45, 1.4, 0.5, 0x242f28, -0.4, 0.7);
    box(g, 0.45, 1.4, 0.5, 0x242f28, 0.4, 0.7);
    box(g, 0.35, 0.35, 2.2, 0x182322, 0.8, 2.6, -0.7);
  } else if (type === "tank") {
    box(g, 5, 1.8, 7, 0x667d4b, 0, 1.5);
    box(g, 1.2, 1.5, 7.5, 0x202c25, -2.6, 0.9);
    box(g, 1.2, 1.5, 7.5, 0x202c25, 2.6, 0.9);
    box(g, 3.3, 1.6, 3.5, 0x96ad6c, 0, 3);
    box(g, 0.6, 0.6, 6, 0x344938, 0, 3, -3.7);
  } else {
    const hq = type === "hq",
      factory = type === "factory";
    const w = hq ? 26 : factory ? 28 : 18,
      d = hq ? 24 : factory ? 25 : 14;
    box(g, w + 3, 1, d + 3, 0x5b6151);
    box(g, w, hq ? 13 : 8, d, 0xb7bba5, 0, hq ? 7 : 4.5);
    box(g, w + 1, 1.8, d + 1, 0x405847, 0, hq ? 14 : 9);
    box(g, w * 0.6, 0.7, 1, 0xbde979, 0, hq ? 10 : 6, -d / 2 - 0.1);
    box(
      g,
      factory ? 13 : 4,
      factory ? 6 : 5,
      1,
      0x243d32,
      0,
      factory ? 3.5 : 3,
      -d / 2 - 0.5,
    );
    if (hq) {
      box(g, 10, 5, 10, 0x7f9470, 0, 17);
      box(g, 0.5, 13, 0.5, 0xd7dfc8, 8, 20, 4);
      box(g, 5, 3, 0.2, 0xbde979, 10.5, 24, 4);
    }
    if (factory) {
      box(g, 3, 15, 3, 0x586252, 10, 8, 7);
    }
    if (type === "barracks") {
      for (let i = -1; i <= 1; i++) box(g, 3, 2, 0.5, 0x4b7063, i * 5, 5, 7.4);
    }
  }
  return g;
}
