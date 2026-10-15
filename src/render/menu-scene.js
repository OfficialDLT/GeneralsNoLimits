import * as THREE from "three";
import { box, entityModel, bake } from "./models.js";
export class MenuScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#10242e");
    this.scene.fog = new THREE.FogExp2("#18313e", 0.0025);
    this.camera = new THREE.PerspectiveCamera(43, 1, 1, 1800);
    this.time = 0;
    this.scene.add(new THREE.HemisphereLight(0x8fc7e5, 0x1c2229, 2));
    const sun = new THREE.DirectionalLight(0xffc27d, 3.2);
    sun.position.set(-80, 100, 40);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x8ad7ef, 2);
    rim.position.set(100, 40, -80);
    this.scene.add(rim);
    this.oceanMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec3 vWorld; uniform float time; void main(){vec3 p=position;p.y+=sin(p.x*.08+time*.9)*.5+sin(p.z*.14-time)*.3;vWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader: `varying vec3 vWorld;uniform float time;void main(){float waves=sin(vWorld.x*.15+vWorld.z*.25-time)*sin(vWorld.z*.2-time*.8);float foam=pow(max(0.,waves),7.);float glow=pow(max(0.,sin(vWorld.x*.025+vWorld.z*.02)),6.);vec3 c=mix(vec3(.025,.105,.14),vec3(.075,.25,.32),.5+.35*waves)+vec3(.12,.21,.24)*foam+vec3(.08,.11,.12)*glow;gl_FragColor=vec4(c,1.);}`,
    });
    const oceanGeometry = new THREE.PlaneGeometry(1400, 1400, 90, 90);
    oceanGeometry.rotateX(-Math.PI / 2);
    const ocean = new THREE.Mesh(oceanGeometry, this.oceanMaterial);
    ocean.position.y = -7;
    this.scene.add(ocean);
    const carrier = new THREE.Group();
    box(carrier, 38, 9, 131, 0x354650, 0, -1);
    box(carrier, 42, 2, 132, 0x69767a, 0, 4.5);
    box(carrier, 40, 0.3, 130, 0x313c43, 0, 5.7);
    for (const x of [-19, 19]) box(carrier, 0.4, 0.25, 125, 0xe0d4a7, x, 6, 0);
    for (let z = -58; z < 63; z += 10)
      box(carrier, 0.5, 0.2, 5, 0xe3e5d6, -7, 6, z);
    for (let z = -5; z < 45; z += 4)
      box(carrier, 22, 0.14, 0.45, 0xf1dfb3, -5, 6, z);
    for (const z of [-48, -36]) box(carrier, 18, 0.1, 0.35, 0xdfb45d, -5, 6, z);
    box(carrier, 9, 6, 28, 0x778487, 13, 9, -4);
    box(carrier, 8, 7, 16, 0x9ba4a1, 13, 15, -6);
    box(carrier, 10, 3, 11, 0x314957, 13, 20, -7);
    box(carrier, 10.5, 0.6, 12, 0x8f9995, 13, 22, -7);
    box(carrier, 0.5, 15, 0.5, 0x9ca7a4, 13, 28, -7);
    box(carrier, 13, 0.5, 0.7, 0x95a5a8, 13, 30, -7);
    box(carrier, 0.6, 7, 0.6, 0x586e73, 8, 25, -10);
    box(carrier, 6, 0.4, 2, 0x829fa7, 8, 28, -10);
    for (const x of [-18, 18])
      for (const z of [-50, 40]) {
        box(carrier, 3, 3, 4, 0x7b8989, x, 7, z);
        box(carrier, 0.5, 0.5, 5, 0x38494f, x, 9, z - 3);
      }
    for (let i = 0; i < 5; i++) {
      const jet = entityModel(
        "raptor",
        { kind: "air", faction: "usa", ammo: 4 },
        "#729cb1",
      );
      jet.scale.setScalar(0.65);
      jet.position.set(i % 2 ? 5 : -12, 6, -38 + i * 16);
      jet.rotation.y = i % 2 ? 0.2 : -0.2;
      carrier.add(jet);
    }
    carrier.position.set(32, 0, -5);
    carrier.rotation.y = -0.2;
    this.scene.add(bake(carrier));
    this.jets = [];
    for (let i = 0; i < 3; i++) {
      const jet = entityModel(
        "raptor",
        { kind: "air", faction: "usa", ammo: 4 },
        "#8cabbd",
      );
      jet.scale.setScalar(1.3);
      this.scene.add(jet);
      this.jets.push(jet);
    }
    this.ships = [];
    for (let i = 0; i < 2; i++) {
      const ship = new THREE.Group();
      box(ship, 10, 6, 46, 0x43545e, 0, -2);
      box(ship, 7, 9, 14, 0x7c8a8e, 0, 5);
      box(ship, 7, 2, 7, 0x364f5c, 0, 10);
      box(ship, 0.4, 13, 0.4, 0xabb5b4, 0, 14);
      box(ship, 5, 3, 4, 0x7f8988, 0, 4, -15);
      box(ship, 0.4, 0.4, 7, 0x53646b, 0, 5, -20);
      const baked = bake(ship);
      baked.position.set(i ? -44 : 110, -1, i ? -115 : 40);
      baked.rotation.y = i ? -0.1 : 0.15;
      this.scene.add(baked);
      this.ships.push(baked);
    }
    const smokeGeometry = new THREE.IcosahedronGeometry(1, 1);
    this.smoke = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(
        smokeGeometry,
        new THREE.MeshStandardMaterial({
          color: i < 7 ? 0xffa448 : 0x394650,
          transparent: true,
          opacity: i < 7 ? 0.8 : 0.42,
          roughness: 1,
        }),
      );
      this.scene.add(m);
      this.smoke.push(m);
    }
    this.fireLight = new THREE.PointLight(0xff8a38, 1200, 110);
    this.fireLight.position.set(54, 7, 44);
    this.scene.add(this.fireLight);
  }
  update(dt, renderer) {
    this.time += dt;
    const t = this.time;
    this.oceanMaterial.uniforms.time.value = t;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(
      143 + Math.sin(t * 0.04) * 7,
      91 + Math.sin(t * 0.05) * 3,
      159,
    );
    this.camera.lookAt(14, 3, 2);
    this.jets.forEach((jet, i) => {
      const phase = (t * 0.018 + i * 0.08) % 1;
      jet.position.set(
        75 - phase * 180 + i * 14,
        45 + i * 5,
        -85 + phase * 190,
      );
      jet.rotation.y = -2.4;
      jet.rotation.z = -0.13;
    });
    this.smoke.forEach((m, i) => {
      const phase = (t * 0.13 + i / 24) % 1;
      m.position.set(
        54 + Math.sin(i * 2.3 + phase) * 5 + phase * 12,
        7 + phase * 45,
        43 + Math.cos(i * 1.8) * 4 + phase * 5,
      );
      m.scale.setScalar(2 + phase * 9);
      m.material.opacity = (1 - phase) * (i < 7 ? 0.8 : 0.46);
    });
    this.fireLight.intensity = 900 + Math.sin(t * 11) * 180;
    renderer.render(this.scene, this.camera);
  }
}
