import * as THREE from "three";
import {
  definition as def,
  factions,
  units,
  buildings,
} from "../config/index.js";
import { height, water, cliff, clamp } from "../simulation/world.js";
import { model, box } from "./models.js";
export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#91a99a");
    this.camera = new THREE.PerspectiveCamera(48, 1, 1, 5000);
    this.focus = new THREE.Vector3();
    this.zoom = 200;
    this.yaw = 0;
    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.meshes = new Map();
    this.templates = new Map();
    this.effectMeshes = [];
    this.effectPool = [];
    this.selected = [];
    this.shake = 0;
    this.ghost = null;
    this.ambient = new THREE.HemisphereLight(0xdaf0ec, 0x545c38, 2.5);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffefd5, 3);
    this.sun.position.set(150, 250, 100);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, {
      left: -250,
      right: 250,
      top: 250,
      bottom: -250,
      far: 800,
    });
    this.scene.add(this.sun, this.sun.target);
    this.labels = document.querySelector("#world-labels");
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
  setGame(game) {
    this.game = game;
    this.meshes.clear();
    if (this.projectileRecords) {
      for (const m of this.projectileRecords.values()) {
        this.scene.remove(m);
        this.effectPool.push(m);
      }
      this.projectileRecords.clear();
    }
    if (this.fieldRecords) {
      this.fieldRecords.forEach((m) => {
        this.scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      });
      this.fieldRecords = [];
    }
    this.supplyMeshes = [];
    this.crateMeshes = [];
    this.fogTexture?.dispose();
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse((o) => {
        if (o.userData.owned) {
          o.geometry?.dispose();
          o.material?.dispose();
        }
      });
    }
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.effectMeshes.forEach((e) => {
      this.scene.remove(e.mesh);
      this.effectPool.push(e.mesh);
    });
    this.effectMeshes = [];
    const map = game.map;
    this.scene.fog = new THREE.Fog("#91a99a", 700, map.size * 2);
    const geometry = new THREE.PlaneGeometry(map.size, map.size, 128, 128);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors = [];
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        z = positions.getZ(i);
      positions.setY(i, height(map, x, z));
      const c = new THREE.Color(
        water(map, x, z)
          ? 0x416c7d
          : cliff(map, x, z)
            ? 0x756f5a
            : map.weather === "snow"
              ? 0x9ca693
              : 0x77875c,
      );
      c.multiplyScalar(0.9 + 0.1 * Math.sin(x * 0.1) * Math.cos(z * 0.1));
      colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    this.fogBytes = new Uint8Array(64 * 64 * 4);
    this.fogTexture = new THREE.DataTexture(this.fogBytes, 64, 64);
    this.fogTexture.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.rtsFog = { value: this.fogTexture };
      shader.uniforms.rtsMapSize = { value: map.size };
      shader.vertexShader =
        "varying vec2 rtsUv; uniform float rtsMapSize;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nrtsUv=(position.xz+rtsMapSize/2.0)/rtsMapSize;",
      );
      shader.fragmentShader =
        "varying vec2 rtsUv; uniform sampler2D rtsFog;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb *= texture2D(rtsFog,rtsUv).r;",
      );
    };
    this.ground = new THREE.Mesh(geometry, material);
    this.ground.userData.owned = true;
    this.ground.receiveShadow = true;
    this.root.add(this.ground);
    // Bridge decks connect the two banks; water and cliffs participate in navigation.
    for (const z of [-map.size * 0.065, 0, map.size * 0.065]) {
      const bridge = new THREE.Group();
      box(bridge, map.size * 0.09, 1, 14, 0x9a9981, 0, 2, z);
      box(bridge, map.size * 0.09, 1, 1, 0x585e53, 0, 3, z - 7);
      box(bridge, map.size * 0.09, 1, 1, 0x585e53, 0, 3, z + 7);
      this.root.add(bridge);
    }
    const count = Math.min(900, Math.round(map.size * 0.5));
    const forest = new THREE.InstancedMesh(
      new THREE.ConeGeometry(5, 15, 6),
      new THREE.MeshStandardMaterial({ color: 0x405e43 }),
      count,
    );
    forest.userData.owned = true;
    const dummy = new THREE.Object3D();
    let seed = map.seed;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      let x, z;
      do {
        x = (rand() - 0.5) * map.size;
        z = (rand() - 0.5) * map.size;
      } while (
        water(map, x, z) ||
        game.entities.some((e) => Math.hypot(e.x - x, e.z - z) < 70)
      );
      dummy.position.set(x, height(map, x, z) + 9, z);
      dummy.scale.setScalar(0.6 + rand() * 0.6);
      dummy.updateMatrix();
      forest.setMatrixAt(i, dummy.matrix);
    }
    this.forest = forest;
    this.forestMatrices = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Matrix4();
      forest.getMatrixAt(i, m);
      this.forestMatrices.push(m);
    }
    this.root.add(forest);
    const rainGeo = new THREE.BufferGeometry();
    const rain = [];
    for (let i = 0; i < 450; i++)
      rain.push((rand() - 0.5) * 600, rand() * 150, (rand() - 0.5) * 600);
    rainGeo.setAttribute("position", new THREE.Float32BufferAttribute(rain, 3));
    this.weather = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({
        color: map.weather === "snow" ? 0xffffff : 0x9bc4d5,
        size: map.weather === "snow" ? 1.8 : 0.6,
        transparent: true,
        opacity: 0.6,
      }),
    );
    this.weather.userData.owned = true;
    this.root.add(this.weather);
    this.weather.visible = map.weather !== "clear";
    this.focus.set(game.player.home.x, 0, game.player.home.z);
    this.zoom = 200;
    this.yaw = 0;
    this.sync();
  }
  template(e) {
    const d = def(e) || { kind: "infantry" },
      color =
        e.owner < 0
          ? "#aca58a"
          : this.game.players[e.owner].color ||
            factions[this.game.players[e.owner].faction].color;
    const key = e.type + "|" + color;
    if (this.templates.has(key)) return this.templates.get(key);
    let group;
    if (e.kind === "building") {
      const role = d.role;
      group = model(
        role === "hq" ? "hq" : role === "factory" ? "factory" : "barracks",
      );
      if (d.radius !== 14) group.scale.setScalar(d.radius / 18);
      if (
        [
          "power",
          "super",
          "airfield",
          "tech",
          "income",
          "defense",
          "oil",
        ].includes(role)
      ) {
        box(
          group,
          6,
          role === "super" ? 25 : 12,
          6,
          color,
          0,
          role === "super" ? 18 : 12,
        );
        if (role === "airfield") box(group, 40, 0.4, 10, 0x454f49, 0, 1, -20);
        if (role === "defense") box(group, 1, 1, 15, 0x29332a, 0, 15, -6);
        if (role === "oil") box(group, 1, 20, 1, 0x1f302a, 7, 14, 7);
        if (role === "power") {
          const dome = new THREE.Mesh(
            new THREE.SphereGeometry(7, 12, 8),
            new THREE.MeshStandardMaterial({
              color: 0xa5d9ec,
              metalness: 0.4,
              roughness: 0.4,
            }),
          );
          dome.position.y = 12;
          group.add(dome);
        }
      }
    } else {
      group = model(d.kind === "infantry" ? "soldier" : "tank");
      if (d.kind === "air") {
        group = model("tank");
        group.scale.set(1.8, 0.4, 1.8);
        box(group, 15, 0.4, 2, color, 0, 2, 0);
        if (!d.ammo) {
          box(group, 20, 0.15, 1, 0x29382c, 0, 5, 0);
          box(group, 1, 0.15, 20, 0x29382c, 0, 5, 0);
        }
      }
      if (d.kind === "vehicle") group.scale.set(0.8, 0.8, 0.8);
      if (d.builder) {
        box(group, 7, 1, 2, 0xcbbb62, 0, 1, -5);
      }
      if (d.kind === "boat") {
        box(group, 8, 2, 13, color, 0, 1, 0);
      }
    }
    group.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        const c = o.material.color;
        if (c.g > c.r * 0.95 && c.g > c.b * 1.05)
          c.lerp(new THREE.Color(color), 0.6);
        o.castShadow = true;
      }
    });
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
    );
    badge.rotation.x = -Math.PI / 2;
    badge.position.y = 0.25;
    group.add(badge);
    this.templates.set(key, group);
    return group;
  }
  sync() {
    const g = this.game;
    if (!g) return;
    const aliveIds = new Set();
    for (const e of g.entities) {
      if (
        e.hp <= 0 &&
        g.time - (this.meshes.get(e.id)?.rubbleTime ?? g.time) > 15
      )
        continue;
      aliveIds.add(e.id);
      let record = this.meshes.get(e.id);
      if (!record || record.owner !== e.owner) {
        if (record) this.root.remove(record.mesh);
        const mesh = this.template(e).clone(true);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(e.radius + 1, e.radius + 1.5, 32),
          new THREE.MeshBasicMaterial({
            color: 0xd1ff87,
            side: THREE.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.4;
        mesh.add(ring);
        this.root.add(mesh);
        record = {
          mesh,
          ring,
          owner: e.owner,
          baseScale: mesh.scale.clone(),
          rubbleTime: e.hp <= 0 ? g.time : null,
        };
        this.meshes.set(e.id, record);
      }
      if (e.hp <= 0 && record.rubbleTime === null) record.rubbleTime = g.time;
      const mesh = record.mesh,
        d = def(e) || {};
      mesh.position.set(
        e.x,
        height(g.map, e.x, e.z) +
          (d.kind === "air"
            ? 28 + (e.ammo === 0 ? 0 : Math.sin(g.time) * 0.5)
            : 0),
        e.z,
      );
      mesh.rotation.y = e.rotation;
      const damaged = e.hp / e.maxHp;
      mesh.scale.y =
        record.baseScale.y *
        (e.hp <= 0
          ? 0.15
          : e.kind === "building"
            ? Math.max(0.15, e.progress)
            : 1);
      mesh.rotation.z = e.hp <= 0 ? 0.2 : damaged < 0.3 ? 0.04 : 0;
      mesh.visible =
        !e.inside &&
        (e.owner === 0 ||
          g.isVisible(e) ||
          (e.kind === "building" &&
            g.explored[this.fogIndex(e.x, e.z)] &&
            g.detected(e, 0)));
      record.ring.visible = this.selected.includes(e.id) && e.hp > 0;
      record.ring.material.color.set(damaged < 0.3 ? 0xff7556 : 0xc6ef75);
    }
    for (const [id, r] of this.meshes)
      if (!aliveIds.has(id)) {
        this.root.remove(r.mesh);
        r.ring.geometry.dispose();
        r.ring.material.dispose();
        this.meshes.delete(id);
      }
    if (!this.supplyMeshes.length) {
      for (const p of g.supplies) {
        const b = new THREE.Group();
        for (let i = 0; i < 4; i++)
          box(b, 6, 4, 6, 0x958760, (i % 2) * 7, 2, Math.floor(i / 2) * 7);
        b.position.set(p.x, height(g.map, p.x, p.z), p.z);
        this.root.add(b);
        this.supplyMeshes.push(b);
      }
    }
    g.supplies.forEach((p, i) => {
      this.supplyMeshes[i].visible =
        p.amount > 0 && !!g.explored[this.fogIndex(p.x, p.z)];
    });
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.forestMatrices.length; i++) {
      const m = this.forestMatrices[i];
      this.forest.setMatrixAt(
        i,
        g.explored[this.fogIndex(m.elements[12], m.elements[14])] ? m : zero,
      );
    }
    this.forest.instanceMatrix.needsUpdate = true;
    for (const m of this.crateMeshes) this.root.remove(m);
    this.crateMeshes = [];
    for (const c of g.crates) {
      const m = new THREE.Mesh(
        (this.crateGeometry ??= new THREE.BoxGeometry(3, 3, 3)),
        (this.crateMaterial ??= new THREE.MeshStandardMaterial({
          color: 0xe1d289,
        })),
      );
      m.position.set(c.x, height(g.map, c.x, c.z) + 2, c.z);
      m.visible = g.isVisible({ ...c, owner: -1 });
      this.root.add(m);
      this.crateMeshes.push(m);
    }
    const b = g.get(this.selected[0]);
    if (b?.rallyPoint) {
      if (!this.flag) {
        this.flag = new THREE.Group();
        box(this.flag, 0.5, 12, 0.5, 0xdfe9c7, 0, 6);
        box(this.flag, 7, 4, 0.25, 0xc6ef75, 3.5, 10);
        this.scene.add(this.flag);
      }
      this.flag.visible = true;
      this.flag.position.set(
        b.rallyPoint.x,
        height(g.map, b.rallyPoint.x, b.rallyPoint.z),
        b.rallyPoint.z,
      );
    } else if (this.flag) this.flag.visible = false;
    for (let i = 0; i < 4096; i++) {
      const value = g.visible[i] ? 255 : g.explored[i] ? 95 : 5;
      this.fogBytes.set([value, value, value, 255], i * 4);
    }
    this.fogTexture.needsUpdate = true;
    this.labels.replaceChildren();
    let count = 0;
    for (const e of g.entities) {
      const record = this.meshes.get(e.id);
      if (
        !record?.mesh.visible ||
        e.hp <= 0 ||
        e.inside ||
        !(this.selected.includes(e.id) || e.hp < e.maxHp || e.progress < 1) ||
        count++ > 140
      )
        continue;
      const p = this.screen(e);
      if (!p.visible) continue;
      const div = document.createElement("div");
      div.className = "health";
      div.style.left = p.x + "px";
      div.style.top = p.y - 18 + "px";
      div.innerHTML = `<i style="width:${(100 * e.hp) / e.maxHp}%"></i><span>${e.veterancy ? "❯".repeat(e.veterancy) : ""}${e.progress < 1 ? " " + Math.floor(e.progress * 100) + "%" : ""}${e.status.emp ? " EMP" : ""}</span>`;
      this.labels.append(div);
    }
  }
  fogIndex(x, z) {
    return (
      clamp(
        Math.floor(((x + this.game.map.size / 2) / this.game.map.size) * 64),
        0,
        63,
      ) +
      clamp(
        Math.floor(((z + this.game.map.size / 2) / this.game.map.size) * 64),
        0,
        63,
      ) *
        64
    );
  }
  screen(e) {
    const p = new THREE.Vector3(
      e.x,
      height(this.game.map, e.x, e.z) + 3,
      e.z,
    ).project(this.camera);
    return {
      x: ((p.x + 1) * innerWidth) / 2,
      y: ((1 - p.y) * innerHeight) / 2,
      visible: p.z > -1 && p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1,
    };
  }
  world(e) {
    this.pointer.set(
      (e.clientX / innerWidth) * 2 - 1,
      (-e.clientY / innerHeight) * 2 + 1,
    );
    this.ray.setFromCamera(this.pointer, this.camera);
    return this.ray.intersectObject(this.ground)[0]?.point;
  }
  pick(event) {
    this.world(event);
    const hits = this.ray.intersectObjects(
      [...this.meshes.values()]
        .filter((r) => r.mesh.visible)
        .map((r) => r.mesh),
      true,
    );
    for (const hit of hits)
      for (const [id, r] of this.meshes) {
        if (hit.object === r.ring) continue;
        let n = hit.object;
        while (n) {
          if (n === r.mesh) return this.game.get(id);
          n = n.parent;
        }
      }
    return null;
  }
  setGhost(type) {
    this.clearGhost();
    if (!type) return;
    this.ghost = this.template({ type, kind: "building", owner: 0 }).clone(
      true,
    );
    this.ghost.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.45;
      }
    });
    this.scene.add(this.ghost);
    this.ghost.visible = false;
  }
  clearGhost() {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost.traverse((o) => {
        if (o.isMesh) o.material.dispose();
      });
      this.ghost = null;
    }
  }
  ghostAt(p, rotation, valid) {
    if (!this.ghost) return;
    this.ghost.visible = !!p;
    if (!p) return;
    this.ghost.position.set(p.x, height(this.game.map, p.x, p.z), p.z);
    this.ghost.rotation.y = rotation;
    this.ghost.traverse((o) => {
      if (o.isMesh) o.material.color.set(valid ? 0xbde979 : 0xe56e5e);
    });
  }
  effect(event) {
    if (
      ![
        "impact",
        "destroyed",
        "shot",
        "income",
        "superweapon",
        "under_attack",
        "power",
        "laser_intercept",
        "smoke",
        "fire",
        "dust",
        "track",
        "casing",
        "debris",
      ].includes(event.type)
    )
      return;
    if (
      event.x !== undefined &&
      event.owner !== 0 &&
      !this.game.visible[this.fogIndex(event.x, event.z)] &&
      !["superweapon", "under_attack", "power"].includes(event.type)
    )
      return;
    if (event.type === "income") {
      const el = document.createElement("div");
      el.className = "income-float";
      const p = this.screen(event);
      el.style.left = p.x + "px";
      el.style.top = p.y + "px";
      el.textContent = "+$" + event.amount;
      document.querySelector("#float-labels").append(el);
      setTimeout(() => el.remove(), 1600);
      return;
    }
    if (event.type === "under_attack") return;
    if (event.type === "shot")
      this.effect({ type: "casing", x: event.x + 2, z: event.z, radius: 0.2 });
    if (event.type === "destroyed")
      for (let i = 0; i < 4; i++)
        this.effect({
          type: "debris",
          x: event.x + (Math.random() - 0.5) * 12,
          z: event.z + (Math.random() - 0.5) * 12,
          radius: 1,
        });
    if (this.effectMeshes.length > 240) {
      const fx = this.effectMeshes.shift();
      this.scene.remove(fx.mesh);
      this.effectPool.push(fx.mesh);
    }
    const mesh =
      this.effectPool.pop() ||
      new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 6),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8 }),
      );
    const color =
      event.type === "smoke"
        ? 0x546058
        : event.type === "dust"
          ? 0xa89b75
          : event.type === "track"
            ? 0x4e553c
            : event.type === "casing"
              ? 0xc6b472
              : event.type === "debris"
                ? 0x6a6b58
                : event.damageType === "Toxin"
                  ? 0x9fff55
                  : event.damageType === "Radiation"
                    ? 0xc9ff38
                    : event.damageType === "Laser"
                      ? 0x69d9ff
                      : event.type === "shot"
                        ? 0xffec9c
                        : 0xff9a45;
    mesh.material.color.set(color);
    mesh.material.opacity = 0.8;
    mesh.position.set(
      event.x || 0,
      height(this.game.map, event.x || 0, event.z || 0) + 2,
      event.z || 0,
    );
    const radius =
      event.type === "casing"
        ? 0.25
        : event.type === "track"
          ? 1.5
          : event.type === "shot"
            ? 1
            : Math.min(35, event.radius || 8);
    mesh.scale.setScalar(radius);
    const life =
      event.type === "track"
        ? 6
        : event.type === "smoke"
          ? 2
          : event.type === "shot"
            ? 0.15
            : 0.65;
    this.scene.add(mesh);
    this.effectMeshes.push({
      mesh,
      remaining: life,
      total: life,
      radius,
      type: event.type,
    });
    if (radius > 18) this.shake = 0.8;
  }
  update(dt) {
    if (!this.game) return;
    const g = this.game,
      light = 0.7 + 0.3 * Math.cos(g.environment.day);
    this.sun.intensity = 2.5 * light;
    this.ambient.intensity = 1.8 * light;
    this.scene.background.setHSL(0.39, 0.1, 0.4 + 0.18 * light);
    const jitter = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 3 : 0;
    this.shake = Math.max(0, this.shake - dt);
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * this.zoom * 0.85 + jitter,
      this.zoom + height(g.map, this.focus.x, this.focus.z),
      this.focus.z + Math.cos(this.yaw) * this.zoom * 0.85,
    );
    this.camera.lookAt(
      this.focus.x,
      height(g.map, this.focus.x, this.focus.z),
      this.focus.z,
    );
    this.camera.updateMatrixWorld();
    this.sun.position.set(this.focus.x + 150, 250, this.focus.z + 100);
    this.sun.target.position.copy(this.focus);
    for (let i = this.effectMeshes.length - 1; i >= 0; i--) {
      const e = this.effectMeshes[i];
      e.remaining -= dt;
      e.mesh.material.opacity = Math.max(0, e.remaining / e.total) * 0.7;
      e.mesh.scale.setScalar(e.radius * (1 + (1 - e.remaining / e.total) * 2));
      if (e.type === "track" || e.type === "casing") e.mesh.scale.y = 0.08;
      if (e.type === "smoke") e.mesh.position.y += dt * 8;
      if (e.remaining <= 0) {
        this.scene.remove(e.mesh);
        this.effectPool.push(e.mesh);
        this.effectMeshes.splice(i, 1);
      }
    }
    for (const e of g.entities) {
      const r = this.meshes.get(e.id);
      if (!r) continue;
      r.mesh.position.x = e.x;
      r.mesh.position.z = e.z;
      r.mesh.position.y =
        height(g.map, e.x, e.z) +
        (units[e.type]?.kind === "air" ? (e.landed ? 3 : 28) : 0);
      r.mesh.rotation.y = e.rotation;
      if (r.mesh.visible && e.hp > 0) {
        r.trailClock = (r.trailClock || 0) + dt;
        if (r.trailClock > 0.7) {
          r.trailClock = 0;
          if (e.path.length && units[e.type]?.kind !== "air") {
            this.effect({
              type: units[e.type]?.kind === "tank" ? "track" : "dust",
              x: e.x,
              z: e.z,
              radius: 1.5,
            });
          }
          if (e.hp < e.maxHp * 0.5) {
            this.effect({
              type: e.hp < e.maxHp * 0.25 ? "fire" : "smoke",
              x: e.x,
              z: e.z,
              radius: 2,
            });
          }
        }
      }
    }
    if (this.weather) {
      this.weather.position.set(this.focus.x, 0, this.focus.z);
      const a = this.weather.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        a.setY(i, a.getY(i) - dt * (g.environment.weather === "snow" ? 8 : 55));
        if (a.getY(i) < 0) a.setY(i, 150);
      }
      a.needsUpdate = true;
      this.weather.visible = g.environment.weather !== "clear";
    }
    this.projectileRecords ??= new Map();
    const activeProjectiles = new Set();
    for (const p of g.projectiles) {
      activeProjectiles.add(p);
      let mesh = this.projectileRecords.get(p);
      if (!mesh) {
        mesh =
          this.effectPool.pop() ||
          new THREE.Mesh(
            new THREE.SphereGeometry(1, 6, 4),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 1 }),
          );
        mesh.material.color.set(p.damageType === "Laser" ? 0x65ddff : 0xffd580);
        mesh.material.opacity = 1;
        mesh.scale.setScalar(p.damageType === "Bullet" ? 0.2 : 0.6);
        this.scene.add(mesh);
        this.projectileRecords.set(p, mesh);
      }
      const t = 1 - p.remaining / p.total,
        x = p.x + (p.tx - p.x) * t,
        z = p.z + (p.tz - p.z) * t;
      mesh.position.set(
        x,
        height(g.map, x, z) + 3 + (p.arc ? Math.sin(t * Math.PI) * 35 : 0),
        z,
      );
      mesh.visible = !!g.visible[this.fogIndex(x, z)];
    }
    for (const [p, mesh] of this.projectileRecords)
      if (!activeProjectiles.has(p)) {
        this.scene.remove(mesh);
        this.effectPool.push(mesh);
        this.projectileRecords.delete(p);
      }
    this.fieldRecords ??= [];
    while (this.fieldRecords.length < g.fields.length) {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(1, 24),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      this.scene.add(mesh);
      this.fieldRecords.push(mesh);
    }
    this.fieldRecords.forEach((mesh, i) => {
      const f = g.fields[i];
      mesh.visible = !!f && !!g.visible[this.fogIndex(f.x, f.z)];
      if (f) {
        mesh.position.set(f.x, height(g.map, f.x, f.z) + 0.2, f.z);
        mesh.scale.setScalar(f.radius);
        mesh.material.color.set(
          f.type === "Toxin"
            ? 0x73ef3e
            : f.type === "Radiation"
              ? 0xc5e932
              : f.type === "mine"
                ? 0xffc454
                : f.type === "hole"
                  ? 0x18180e
                  : 0xff7f25,
        );
      }
    });
    this.renderer.render(this.scene, this.camera);
  }
  minimap(canvas) {
    const g = this.game,
      ctx = canvas.getContext("2d"),
      n = 64,
      w = canvas.width,
      cell = w / n;
    ctx.fillStyle = "#293526";
    ctx.fillRect(0, 0, w, w);
    if (!g.radar()) {
      ctx.fillStyle = "#e4bb68";
      ctx.font = "12px sans-serif";
      ctx.fillText("RADAR OFFLINE", 32, w / 2);
      return;
    }
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const i = x + z * n;
        ctx.fillStyle = g.visible[i]
          ? "#657854"
          : g.explored[i]
            ? "#333e30"
            : "#090f0c";
        ctx.fillRect(x * cell, z * cell, cell + 1, cell + 1);
      }
    for (const e of g.entities) {
      if (e.hp <= 0 || e.inside || (!g.isVisible(e) && e.owner !== 0)) continue;
      ctx.fillStyle =
        e.owner < 0
          ? "#c9c0a5"
          : g.players[e.owner].color ||
            factions[g.players[e.owner].faction].color;
      const size = e.kind === "building" ? 4 : 2;
      ctx.fillRect(
        (e.x / g.map.size + 0.5) * w - size / 2,
        (e.z / g.map.size + 0.5) * w - size / 2,
        size,
        size,
      );
    }
    if (g.lastAttack) {
      ctx.strokeStyle = "#ff6c5b";
      ctx.beginPath();
      ctx.arc(
        (g.lastAttack.x / g.map.size + 0.5) * w,
        (g.lastAttack.z / g.map.size + 0.5) * w,
        6,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(
      (this.focus.x / g.map.size + 0.5) * w,
      (this.focus.z / g.map.size + 0.5) * w,
    );
    ctx.rotate(-this.yaw);
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(
      (-this.zoom / g.map.size) * w * 0.6,
      (-this.zoom / g.map.size) * w * 0.4,
      (this.zoom / g.map.size) * w * 1.2,
      (this.zoom / g.map.size) * w * 0.8,
    );
    ctx.restore();
  }
}
