import * as THREE from 'three';

const vertex = `
attribute float size; attribute float opacity; attribute float seed; attribute vec3 tint;
varying float vOpacity; varying float vSeed; varying vec3 vTint;
uniform float pixelScale;
void main() {
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_PointSize = clamp(size * pixelScale / max(1.0, -p.z), 1.0, 180.0);
  vOpacity = opacity; vSeed = seed; vTint = tint;
}`;
const fragment = `
varying float vOpacity; varying float vSeed; varying vec3 vTint;
uniform float clock; uniform float flame;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float angle = vSeed * 6.283;
  uv = mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*uv;
  vec2 drift = vec2(vSeed*17.0, clock * (flame > 0.5 ? -1.8 : -0.18));
  float cloud = noise(uv*3.0+drift)*0.6 + noise(uv*7.0+drift)*0.28 + noise(uv*14.0+drift)*0.12;
  float edge = 1.0 - smoothstep(0.35, 1.0, length(uv) + (cloud-0.5)*0.25);
  float alpha = edge * (0.35 + cloud*0.65) * vOpacity;
  vec3 color = vTint * (0.65 + cloud*0.5);
  if (flame > 0.5) {
    float heat = max(0.0, 1.0-length(uv)*1.2) * (0.6+cloud);
    color = mix(vTint, vec3(1.0,0.88,0.38), heat);
    alpha *= 0.7 + heat;
  }
  if (alpha < 0.008) discard;
  gl_FragColor = vec4(color, alpha);
}`;
class Layer {
  constructor(scene, capacity, additive) {
    this.capacity = capacity; this.cursor = 0;
    this.items = Array.from({ length: capacity }, () => ({ life: 0 }));
    this.geometry = new THREE.BufferGeometry();
    for (const [name, count] of [['position', 3], ['tint', 3], ['size', 1], ['opacity', 1], ['seed', 1]])
      this.geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(capacity * count), count).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment,
      uniforms: { pixelScale: { value: 1000 }, clock: { value: 0 }, flame: { value: additive ? 1 : 0 } },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
    });
    this.mesh = new THREE.Points(this.geometry, this.material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 5 : 4;
    scene.add(this.mesh);
  }
  add(p) {
    Object.assign(this.items[this.cursor], p, { total: p.life, seed: Math.random() });
    this.cursor = (this.cursor + 1) % this.capacity;
  }
  update(dt, clock, pixelScale, visible) {
    this.material.uniforms.clock.value = clock;
    this.material.uniforms.pixelScale.value = pixelScale;
    const attributes = this.geometry.attributes;
    for (let i = 0; i < this.capacity; i++) {
      const p = this.items[i];
      p.life = Math.max(0, p.life - dt);
      if (p.life <= 0) { attributes.opacity.setX(i, 0); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= Math.exp(-dt * 0.7); p.vz *= Math.exp(-dt * 0.7);
      const progress = 1 - p.life / p.total;
      attributes.position.setXYZ(i, p.x, p.y, p.z);
      attributes.tint.setXYZ(i, p.color.r, p.color.g, p.color.b);
      attributes.size.setX(i, p.size * (1 + progress * p.growth));
      attributes.seed.setX(i, p.seed);
      attributes.opacity.setX(i, (p.global || visible(p.x, p.z)) ? p.alpha * Math.min(1, progress * 12) * (1 - progress) ** 1.4 : 0);
    }
    for (const attribute of Object.values(attributes)) attribute.needsUpdate = true;
  }
  clear() { for (const p of this.items) p.life = 0; this.geometry.attributes.opacity.array.fill(0); this.geometry.attributes.opacity.needsUpdate = true; }
}
export class BattlefieldParticles {
  constructor(scene) { this.smoke = new Layer(scene, 600, false); this.fire = new Layer(scene, 360, true); this.clock = 0; }
  clear() { this.smoke.clear(); this.fire.clear(); }
  emit(event, ground) {
    const explosion = ['impact', 'destroyed', 'superweapon', 'power'].includes(event.type);
    const fire = explosion || ['fire', 'shot', 'laser_intercept'].includes(event.type);
    const radius = Math.max(0.8, Math.min(32, event.radius || (event.type === 'shot' ? 1.2 : 5)));
    const count = explosion ? 24 : event.type === 'shot' ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, speed = (0.4 + Math.random()) * radius;
      const common = { x: event.x || 0, z: event.z || 0, y: ground + 1 + Math.random() * radius * 0.15,
        vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, global: event.type === 'superweapon' };
      if (event.type !== 'shot' && event.type !== 'laser_intercept') this.smoke.add({ ...common,
        life: explosion ? 2.5 + Math.random() * 2.8 : 1.8 + Math.random(),
        vy: event.type === 'dust' ? 0.6 : 2 + Math.random() * 5,
        size: radius * (0.4 + Math.random() * 0.5), growth: 3,
        color: new THREE.Color(event.type === 'dust' || (explosion && i % 3 === 0) ? 0xb29a74 : 0x51524d), alpha: explosion ? 0.65 : 0.3,
      });
      if (fire) this.fire.add({ ...common, life: event.type === 'shot' ? 0.12 : 0.35 + Math.random() * 1.2,
        vy: 2 + Math.random() * 8, size: radius * (0.2 + Math.random() * 0.5), growth: 1.3,
        color: new THREE.Color(event.damageType === 'Laser' ? 0x44b9e8 : event.damageType === 'Toxin' ? 0x6eb833 : 0xf86510), alpha: 0.8,
      });
    }
  }
  update(dt, pixelScale, visible) {
    this.clock += dt;
    this.smoke.update(dt, this.clock, pixelScale, visible); this.fire.update(dt, this.clock, pixelScale, visible);
  }
}
