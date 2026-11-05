// The walkable world: a first-person view you move through, with the spots
// you can put a sound on, everyone's sounds, and a figure making each one.
// The live place and the memory replay both use it; only the live place
// makes the spots clickable.
//
// The spots and sound markers are ordinary buttons laid over the canvas at
// their projected positions, so they can be tabbed to, read by a screen
// reader, and clicked, exactly like the photo version's anchors.
import * as THREE from "three";
import { SOUNDS, type Anchor, type Pose, type Scene, type SoundId } from "../shared/catalog.js";
import type { Placement } from "../shared/protocol.js";
import { figureSvg, passerSvg } from "./figures.js";
import { BEFORE_DAWN, lightFor, mixLight, type Light } from "./sky.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { cafeKit } from "./cafe.js";
import type { PlaceKit } from "./places.js";
import { campusKit, canStand, type Built } from "./world-build.js";

const KITS: Record<string, PlaceKit> = { campus: campusKit, cafe: cafeKit };

export interface WorldDrawOptions {
  interactive: boolean;
  mineId: string | null;
  choosing: SoundId | null;
  selected: string | null;
  onAnchor?: (shotId: string, anchorId: string) => void;
  onMarker?: (placementId: string) => void;
}

export interface Listener {
  x: number;
  y: number;
  z: number;
  yaw: number;
  inside: boolean;
}

interface Options {
  startZone: string;
  onZone?: (zoneId: string) => void;
  onListen?: (l: Listener) => void;
}

interface Spot {
  shotId: string;
  anchor: Anchor;
  el: HTMLButtonElement;
  at: THREE.Vector3;
  inside: boolean;
}

interface Figure {
  key: string;
  sprite: THREE.Sprite;
  base: THREE.Vector3;
  bounce: number;
}

interface Passer {
  sprite: THREE.Sprite;
  path: THREE.Vector3[];
  t: number;
  speed: number;
  flipped: boolean;
}

const EYE = 1.62;
const WALK = 3.2;
const RUN = 5.6;
const reduced = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;


// The SVG figures as sprite textures, drawn once per look.
const textureCache = new Map<string, THREE.Texture>();
function svgTexture(key: string, svg: string): THREE.Texture {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const sized = svg.replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="600" `);
  const img = new Image();
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  img.onload = () => (tex.needsUpdate = true);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  textureCache.set(key, tex);
  return tex;
}

// figureSvg's viewBox is 60 × 200 (umbrella: 88 × 206); sprites are 1.75 m
function figureSprite(key: string, svg: string, umbrella: boolean, tint: number): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({ map: svgTexture(key, svg), color: tint, transparent: true, alphaTest: 0.05, depthWrite: true });
  const s = new THREE.Sprite(mat);
  s.center.set(0.5, 0.03);
  const h = 1.75;
  s.scale.set(umbrella ? (h * 88) / 206 : (h * 60) / 200, h, 1);
  return s;
}

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FRAG = `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float glow;
varying vec3 vDir;
void main(){
  float h = vDir.y;
  vec3 c = h > 0.0 ? mix(horizon, top, pow(min(h * 1.6, 1.0), 0.7)) : mix(horizon, bottom, min(-h * 4.0, 1.0));
  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  c += sunColor * glow * (pow(s, 8.0) * 0.45 + pow(s, 600.0) * 1.6);
  gl_FragColor = vec4(c, 1.0);
}`;

export class WorldView {
  private renderer: THREE.WebGLRenderer;
  private scene3 = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private built: Built;
  private kit: PlaceKit;
  private sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private sun = new THREE.DirectionalLight();
  private hemi = new THREE.HemisphereLight();
  private overlay: HTMLDivElement;
  private spots: Spot[] = [];
  private markers = new Map<string, { el: HTMLButtonElement; at: THREE.Vector3; inside: boolean }>();
  private figures = new Map<string, Figure>();
  private passers: Passer[] = [];
  private rain: THREE.LineSegments | null = null;
  private raycaster = new THREE.Raycaster();
  private light: Light;

  // where you are
  private x = 0;
  private z = 0;
  private yaw = 0;
  private pitch = -0.04;
  private bob = 0;
  private keys = new Set<string>();
  private stick = { x: 0, y: 0 };
  private target: THREE.Vector3 | null = null;
  private stuck = 0;
  private zone: string;
  private last = performance.now();
  private occlusionAt = 0;
  private drawOpts: WorldDrawOptions = { interactive: false, mineId: null, choosing: null, selected: null };
  private placements: Placement[] = [];
  private sunrise: { from: number; ms: number } | null = null;
  // with a photographed sky lighting the models, the drawn fill light is less
  private hemiScale = 1;
  // frames counted to decide whether this device needs a lighter picture
  private perf = { frames: 0, since: 0, lowered: 0 };
  private bornAt = performance.now();
  // zone changes are only reported once the page has its view
  private ready = false;

  constructor(
    private host: HTMLElement,
    private scene: Scene,
    private mode: string,
    private opts: Options,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.className = "world-canvas";
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      `${scene.title}, drawn in 3D from Wen's photos. Walk with the arrow keys or W A S D, drag to look around, or use the Go to buttons.`,
    );
    host.append(canvas);

    this.overlay = document.createElement("div");
    this.overlay.className = "world-overlay";
    host.append(this.overlay);

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.08, 600);
    this.camera.rotation.order = "YXZ";

    this.kit = KITS[scene.id] ?? campusKit;
    this.built = this.kit.build();
    this.scene3.add(this.built.root);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(450, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color() },
          horizon: { value: new THREE.Color() },
          bottom: { value: new THREE.Color() },
          sunDir: { value: new THREE.Vector3() },
          sunColor: { value: new THREE.Color() },
          glow: { value: 0 },
        },
      }),
    );
    this.scene3.add(this.sky);

    const small = Math.min(innerWidth, innerHeight) < 700;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -42;
    sc.right = 42;
    sc.top = 42;
    sc.bottom = -42;
    sc.near = 1;
    sc.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.target.position.set(...this.kit.sunTarget);
    this.scene3.add(this.sun, this.sun.target, this.hemi);
    this.scene3.fog = new THREE.Fog(0xffffff, 20, 120);

    const base = lightFor(mode);
    const sunDir = this.kit.sunDirs?.[mode];
    this.light = sunDir ? { ...base, sunDir } : base;
    if (mode === "morning" && !reduced()) this.sunrise = { from: performance.now(), ms: 3800 };
    this.applyLight(this.sunrise ? BEFORE_DAWN : this.light);

    this.buildSpots();
    this.buildPassers();
    if (mode === "rainy-dusk") this.buildRain();

    this.zone = opts.startZone;
    this.placeAt(opts.startZone);
    this.bindControls();
    void this.loadSky();
    void this.furnish();

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
    this.ready = true;
  }

  // ---- public ------------------------------------------------------------

  draw(placements: Placement[], opts: WorldDrawOptions): void {
    this.placements = placements;
    this.drawOpts = opts;
    this.host.classList.toggle("choosing", opts.choosing !== null);
    this.syncFigures();
    this.syncMarkers();
    for (const s of this.spots) {
      const accepts = opts.choosing !== null && s.anchor.sounds.includes(opts.choosing);
      s.el.classList.toggle("accepts", accepts);
      s.el.classList.toggle("dim", opts.choosing !== null && !accepts);
      s.el.disabled = !opts.interactive;
      s.el.setAttribute("aria-label", accepts ? `Put ${SOUNDS[opts.choosing!].label.toLowerCase()} at ${s.anchor.label.toLowerCase()}` : s.anchor.label);
    }
    this.layoutOverlay(true);
  }

  goTo(zoneId: string): void {
    const shot = this.scene.shots.find((s) => s.id === zoneId);
    if (!shot?.spawn) return;
    if (reduced()) return this.placeAt(zoneId);
    this.host.classList.add("fading");
    setTimeout(() => {
      this.placeAt(zoneId);
      this.host.classList.remove("fading");
    }, 260);
  }

  currentZone(): string {
    return this.zone;
  }

  // Where a placement is heard from, and whether it's indoors.
  where(p: Pick<Placement, "id" | "shotId" | "anchorId">): { pos: [number, number, number]; inside: boolean } | null {
    const m = this.markers.get(p.id);
    if (m) return { pos: [m.at.x, m.at.y, m.at.z], inside: m.inside };
    const spot = this.spots.find((s) => s.shotId === p.shotId && s.anchor.id === p.anchorId);
    return spot ? { pos: [spot.at.x, spot.at.y, spot.at.z], inside: spot.inside } : null;
  }

  pulse(placementId: string): void {
    const m = this.markers.get(placementId);
    if (m) {
      m.el.classList.remove("pulse");
      void m.el.offsetWidth;
      m.el.classList.add("pulse");
    }
    const f = this.figures.get(placementId);
    if (f) f.bounce = 1;
  }

  focusCanvas(): void {
    this.renderer.domElement.focus();
  }

  // ---- loading -----------------------------------------------------------

  // A photographed sky: the background, and the light the models reflect.
  private async loadSky(): Promise<void> {
    const sky = this.kit.skies?.[this.mode];
    if (!sky) return;
    try {
      const tex = await new RGBELoader().loadAsync(sky.url);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      this.scene3.background = tex;
      this.scene3.backgroundIntensity = sky.intensity;
      this.scene3.environment = tex;
      this.scene3.environmentIntensity = sky.intensity * 0.8;
      this.sky.visible = false;
      this.hemiScale = 0.45;
      this.applyLight(this.sunrise ? BEFORE_DAWN : this.light);
    } catch {
      // the drawn sky stays
    }
  }

  private async furnish(): Promise<void> {
    if (!this.kit.furnish) return;
    const label = document.createElement("p");
    label.className = "world-loading";
    label.setAttribute("role", "status");
    label.textContent = "Setting out the furniture…";
    this.host.append(label);
    try {
      await this.kit.furnish(this.built, (f) => (label.textContent = `Setting out the furniture… ${Math.round(f * 100)}%`));
      label.remove();
      // figures were placed before the furniture's solids existed
      this.layoutOverlay(true);
    } catch {
      label.textContent = "Some furniture didn't load. Everything else still works.";
      setTimeout(() => label.remove(), 6000);
    }
  }

  // ---- light -------------------------------------------------------------

  private applyLight(l: Light): void {
    const u = this.sky.material.uniforms;
    (u.top.value as THREE.Color).setHex(l.skyTop);
    (u.horizon.value as THREE.Color).setHex(l.skyHorizon);
    (u.bottom.value as THREE.Color).setHex(l.skyBottom);
    (u.sunDir.value as THREE.Vector3).set(...l.sunDir).normalize();
    (u.sunColor.value as THREE.Color).setHex(l.sunColor);
    u.glow.value = l.sunGlow;

    const dir = new THREE.Vector3(...l.sunDir).normalize();
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 90);
    this.sun.color.setHex(l.sunColor);
    this.sun.intensity = l.sunIntensity;
    this.sun.castShadow = l.shadows;
    this.hemi.color.setHex(l.hemiSky);
    this.hemi.groundColor.setHex(l.hemiGround);
    this.hemi.intensity = l.hemiIntensity * this.hemiScale;
    const fog = this.scene3.fog as THREE.Fog;
    fog.color.setHex(l.fog);
    fog.near = l.fogNear;
    fog.far = l.fogFar;

    const b = this.built;
    b.ceilingStrips.emissive.setHex(l.ceiling);
    b.ceilingStrips.emissiveIntensity = 0.3 + l.ceilingIntensity;
    for (const c of b.ceilingLights) {
      c.color.setHex(l.ceiling);
      c.intensity = l.ceilingIntensity * 9;
    }
    b.lamp.color.setHex(l.lamp || 0xffffff);
    b.lamp.intensity = l.lampIntensity;
    b.lampHead.emissive.setHex(l.lamp || 0x000000);
    b.lampHead.emissiveIntensity = l.lampIntensity > 0 ? 2.5 : 0;
    b.windows.emissiveIntensity = l.windowGlow * 0.32;
    b.paving.roughness = l.wet ? 0.22 : 0.8;
    b.paving.metalness = l.wet ? 0.18 : 0;
    b.paving.color.setHex(l.wet ? 0x8f8d90 : 0xffffff);
    this.renderer.toneMappingExposure = l.exposure;
    for (const f of this.figures.values()) (f.sprite.material as THREE.SpriteMaterial).color.setHex(l.figureTint);
    for (const p of this.passers) (p.sprite.material as THREE.SpriteMaterial).color.setHex(l.figureTint);
  }

  // ---- spots, markers, figures ------------------------------------------

  private buildSpots(): void {
    const ring = new THREE.RingGeometry(0.32, 0.42, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0.55, depthWrite: false });
    for (const shot of this.scene.shots) {
      for (const anchor of shot.anchors) {
        if (!anchor.at) continue;
        const el = document.createElement("button");
        el.type = "button";
        el.className = "anchor world-spot";
        el.dataset.anchor = `${shot.id}/${anchor.id}`;
        el.hidden = true;
        el.innerHTML = `<span class="spot-dot" aria-hidden="true"></span><span class="spot-label"></span>`;
        el.querySelector(".spot-label")!.textContent = anchor.label;
        el.onclick = () => this.drawOpts.onAnchor?.(shot.id, anchor.id);
        this.overlay.append(el);
        const at = new THREE.Vector3(anchor.at.x, anchor.at.y, anchor.at.z);
        this.spots.push({ shotId: shot.id, anchor, el, at, inside: shot.inside ?? false });
        // a faint ring on the floor under the spot
        if (anchor.foot) {
          const r = new THREE.Mesh(ring, ringMat);
          r.rotation.x = -Math.PI / 2;
          r.position.set(anchor.foot.x, (anchor.foot.y ?? 0) + 0.03, anchor.foot.z);
          this.built.root.add(r);
        }
      }
    }
  }

  private spotOf(p: Placement): Spot | undefined {
    return this.spots.find((s) => s.shotId === p.shotId && s.anchor.id === p.anchorId);
  }

  // The nth sound at one spot sits a little to the side of the others.
  private offset(p: Placement): number {
    const same = this.placements.filter((q) => q.shotId === p.shotId && q.anchorId === p.anchorId);
    const i = same.indexOf(p);
    return [0, 0.75, -0.75, 1.5, -1.5, 0.4][i % 6] ?? 0;
  }

  private syncMarkers(): void {
    const seen = new Set<string>();
    for (const p of this.placements) {
      const spot = this.spotOf(p);
      if (!spot) continue;
      seen.add(p.id);
      let m = this.markers.get(p.id);
      if (!m) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "marker world-marker";
        el.dataset.placement = p.id;
        el.innerHTML = `<span class="marker-ring" aria-hidden="true"></span><span class="marker-label"></span>`;
        el.onclick = () => this.drawOpts.onMarker?.(p.id);
        this.overlay.append(el);
        m = { el, at: new THREE.Vector3(), inside: spot.inside };
        this.markers.set(p.id, m);
      }
      const dx = this.offset(p);
      m.at.set(spot.at.x + dx * 0.6, spot.at.y + 0.5, spot.at.z + dx * 0.25);
      const mine = p.ownerId === this.drawOpts.mineId;
      m.el.classList.toggle("mine", mine);
      m.el.classList.toggle("selected", p.id === this.drawOpts.selected);
      m.el.style.setProperty("--level", String(0.4 + p.gain * 0.6));
      m.el.querySelector(".marker-label")!.textContent = SOUNDS[p.soundId].label;
      m.el.setAttribute("aria-label", `${SOUNDS[p.soundId].label} at ${spot.anchor.label.toLowerCase()}, ${mine ? "yours" : `by ${p.ownerName}`}, volume ${Math.round(p.gain * 100)}%`);
    }
    for (const [id, m] of this.markers) {
      if (seen.has(id)) continue;
      m.el.remove();
      this.markers.delete(id);
    }
  }

  private syncFigures(): void {
    const seen = new Set<string>();
    for (const p of this.placements) {
      const spot = this.spotOf(p);
      const foot = spot?.anchor.foot;
      if (!spot || !foot) continue;
      seen.add(p.id);
      const pose: Pose = spot.anchor.stand.pose ?? SOUNDS[p.soundId].pose;
      const key = `${p.ownerAvatar}:${pose}:${p.ownerId}`;
      let f = this.figures.get(p.id);
      if (f && f.key !== key) {
        this.built.root.remove(f.sprite);
        f = undefined;
      }
      if (!f) {
        const sprite = figureSprite(key, figureSvg(p.ownerAvatar, pose, p.ownerId), pose === "umbrella", this.light.figureTint);
        f = { key, sprite, base: new THREE.Vector3(), bounce: 0 };
        this.built.root.add(sprite);
        this.figures.set(p.id, f);
      }
      const dx = this.offset(p);
      // sitting figures sit on the tier: their feet hang to the one below
      const y = foot.y ? foot.y - 0.5 : 0;
      f.base.set(foot.x + dx, y, foot.z + Math.abs(dx) * 0.2);
      f.sprite.position.copy(f.base);
    }
    for (const [id, f] of this.figures) {
      if (seen.has(id)) continue;
      this.built.root.remove(f.sprite);
      this.figures.delete(id);
    }
  }

  // Passers-by who make no sound: they only show how busy the hour is.
  private buildPassers(): void {
    const count = this.mode === "weekday" ? 9 : this.mode === "morning" ? 2 : this.mode === "rainy-dusk" ? 3 : 0;
    const paths = this.kit.passerPaths.map((p) => p.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    for (let i = 0; i < count; i++) {
      const path = paths[i % paths.length];
      // people indoors have put their umbrellas away
      const umbrella = this.mode === "rainy-dusk" && !this.kit.isInside(path[0].x, path[0].z);
      const sprite = figureSprite(`passer-${this.mode}-${i}`, passerSvg(`passer-${this.mode}-${i}`, umbrella), umbrella, this.light.figureTint);
      const mat = sprite.material as THREE.SpriteMaterial;
      mat.map = mat.map!.clone();
      mat.map.needsUpdate = true;
      mat.opacity = 0.92;
      this.built.root.add(sprite);
      this.passers.push({ sprite, path, t: (i * 0.37) % 1, speed: (this.mode === "weekday" ? 1.3 : 0.9) + (i % 3) * 0.15, flipped: false });
    }
  }

  private buildRain(): void {
    const n = reduced() ? 600 : 2400;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const [x, z] = this.kit.rainAt(Math.random);
      const y = Math.random() * 14 - 2;
      pos.set([x, y, z, x - 0.03, y + 0.45, z], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8cc, transparent: true, opacity: 0.38 }));
    this.rain.frustumCulled = false;
    this.scene3.add(this.rain);
  }

  // ---- moving ------------------------------------------------------------

  private placeAt(zoneId: string): void {
    const shot = this.scene.shots.find((s) => s.id === zoneId) ?? this.scene.shots[0];
    const s = shot.spawn ?? { x: 0, z: 0, yaw: 0 };
    this.x = s.x;
    this.z = s.z;
    this.yaw = s.yaw;
    this.pitch = -0.04;
    this.target = null;
    this.setZone(this.kit.zoneAt(this.x, this.z));
  }

  private setZone(z: string): void {
    if (z === this.zone) return;
    this.zone = z;
    if (this.ready) this.opts.onZone?.(z);
  }

  private bindControls(): void {
    const canvas = this.renderer.domElement;
    const typing = (e: KeyboardEvent): boolean => {
      const t = e.target as HTMLElement | null;
      if (!t || t === document.body || t === canvas) return false;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
      // tabs use the arrows to move between kinds of sound
      return t.getAttribute("role") === "tab" || e.key.startsWith("Arrow");
    };
    const MOVE = new Set(["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"]);
    addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (!MOVE.has(k) || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (k.startsWith("arrow")) e.preventDefault();
      this.keys.add(k);
      this.target = null;
    });
    addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener("blur", () => this.keys.clear());

    // Drag to look; a tap or click without dragging walks to that spot of
    // floor.
    let look: { id: number; x: number; y: number; moved: number; at: number } | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (look) return;
      look = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, at: performance.now() };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!look || e.pointerId !== look.id) return;
      const dx = e.clientX - look.x;
      const dy = e.clientY - look.y;
      look.moved += Math.abs(dx) + Math.abs(dy);
      look.x = e.clientX;
      look.y = e.clientY;
      if (look.moved < 5) return;
      this.yaw += dx * 0.0042;
      this.pitch = Math.max(-0.9, Math.min(0.75, this.pitch + dy * 0.0034));
    });
    const end = (e: PointerEvent): void => {
      if (!look || e.pointerId !== look.id) return;
      const tap = look.moved < 6 && performance.now() - look.at < 450;
      look = null;
      if (tap) this.walkToward(e.clientX, e.clientY);
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", () => (look = null));

    // A thumb stick for touch screens.
    const stick = document.createElement("div");
    stick.className = "world-stick";
    stick.setAttribute("aria-hidden", "true");
    stick.innerHTML = `<span class="knob"></span>`;
    this.host.append(stick);
    const knob = stick.querySelector<HTMLElement>(".knob")!;
    let held: number | null = null;
    const moveStick = (e: PointerEvent): void => {
      const r = stick.getBoundingClientRect();
      let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.stick = { x: dx, y: dy };
      knob.style.transform = `translate(${dx * 28}px, ${dy * 28}px)`;
    };
    stick.addEventListener("pointerdown", (e) => {
      held = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      this.target = null;
      moveStick(e);
    });
    stick.addEventListener("pointermove", (e) => e.pointerId === held && moveStick(e));
    const release = (): void => {
      held = null;
      this.stick = { x: 0, y: 0 };
      knob.style.transform = "";
    };
    stick.addEventListener("pointerup", release);
    stick.addEventListener("pointercancel", release);
  }

  private walkToward(clientX: number, clientY: number): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects([...this.built.floors, ...this.built.occluders], false)[0];
    if (!hit || hit.point.distanceTo(this.camera.position) > 45) return;
    // clicking a wall walks to the floor in front of it
    const p = hit.point.clone();
    if (!this.built.floors.includes(hit.object)) p.addScaledVector(this.raycaster.ray.direction, -0.6);
    this.target = new THREE.Vector3(p.x, 0, p.z);
    this.stuck = 0;
  }

  private tryMove(dx: number, dz: number): boolean {
    const nx = this.x + dx;
    const nz = this.z + dz;
    if (canStand(this.built, nx, nz)) {
      this.x = nx;
      this.z = nz;
      return true;
    }
    // slide along walls
    if (canStand(this.built, nx, this.z)) {
      this.x = nx;
      return true;
    }
    if (canStand(this.built, this.x, nz)) {
      this.z = nz;
      return true;
    }
    return false;
  }

  private move(dt: number): void {
    const k = this.keys;
    const turn = (k.has("arrowleft") || k.has("q") ? 1 : 0) - (k.has("arrowright") || k.has("e") ? 1 : 0);
    this.yaw += turn * 1.9 * dt;
    let fwd = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0) - this.stick.y;
    let side = (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0) + this.stick.x;
    const speed = k.has("shift") ? RUN : WALK;
    let moving = false;

    if (this.target && fwd === 0 && side === 0) {
      const tx = this.target.x - this.x;
      const tz = this.target.z - this.z;
      const d = Math.hypot(tx, tz);
      if (d < 0.25) this.target = null;
      else {
        // turn smoothly towards where we're going
        const want = Math.atan2(-tx, -tz);
        let diff = want - this.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.yaw += diff * Math.min(1, dt * 4);
        const step = Math.min(d, WALK * dt);
        if (this.tryMove((tx / d) * step, (tz / d) * step)) {
          moving = true;
          this.stuck = 0;
        } else if ((this.stuck += dt) > 0.4) this.target = null;
      }
    } else if (fwd !== 0 || side !== 0) {
      const len = Math.hypot(fwd, side);
      if (len > 1) {
        fwd /= len;
        side /= len;
      }
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const dx = (-sin * fwd + cos * side) * speed * dt;
      const dz = (-cos * fwd - sin * side) * speed * dt;
      moving = this.tryMove(dx, dz);
    }
    if (moving && !reduced()) this.bob += dt * 9;
    this.setZone(this.kit.zoneAt(this.x, this.z));
  }

  // ---- each frame --------------------------------------------------------

  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 78 : 68;
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const now = performance.now();
    // A slow device still walks at full speed: long frames are split into
    // short steps, so a step never jumps through a wall.
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;

    if (this.sunrise) {
      const t = Math.min(1, (now - this.sunrise.from) / this.sunrise.ms);
      const eased = t * t * (3 - 2 * t);
      this.applyLight(mixLight(BEFORE_DAWN, this.light, eased));
      if (t >= 1) this.sunrise = null;
    }

    this.adaptQuality(now);
    const steps = Math.ceil(dt / 0.04);
    for (let i = 0; i < steps; i++) this.move(dt / steps);
    const bobY = Math.sin(this.bob) * 0.035;
    this.camera.position.set(this.x, EYE + bobY, this.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.sky.position.copy(this.camera.position);

    for (const f of this.figures.values()) {
      if (f.bounce > 0) {
        f.bounce = Math.max(0, f.bounce - dt * 3);
        f.sprite.position.y = f.base.y + Math.sin(f.bounce * Math.PI) * 0.06;
      }
    }
    if (!reduced()) this.movePassers(dt);
    if (this.rain && !reduced()) {
      const pos = this.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      for (let i = 0; i < a.length; i += 6) {
        a[i + 1] -= 13 * dt;
        a[i + 4] -= 13 * dt;
        if (a[i + 1] < -3.5) {
          a[i + 1] += 15;
          a[i + 4] += 15;
        }
      }
      pos.needsUpdate = true;
    }

    this.renderer.render(this.scene3, this.camera);
    this.layoutOverlay(now - this.occlusionAt > 160);
    this.opts.onListen?.({ x: this.x, y: EYE, z: this.z, yaw: this.yaw, inside: this.kit.isInside(this.x, this.z) });
  }

  // A slow device gets a lighter picture rather than a slideshow: if frames
  // run under 24 a second, first drop to one pixel per CSS pixel, then turn
  // off shadows and draw at half resolution. Never raised again, so it can't
  // flicker between the two.
  private adaptQuality(now: number): void {
    const p = this.perf;
    if (p.lowered >= 2) return;
    // the first seconds are loading (sky, models), not the device's pace
    if (now - this.bornAt < 4000) return;
    if (!p.since) p.since = now;
    p.frames++;
    const elapsed = now - p.since;
    if (elapsed < 2000) return;
    const fps = (p.frames * 1000) / elapsed;
    p.frames = 0;
    p.since = now;
    if (fps >= 24) {
      p.lowered = 2;
      return;
    }
    p.lowered++;
    if (p.lowered === 1) this.renderer.setPixelRatio(1);
    else {
      this.renderer.setPixelRatio(0.5);
      this.renderer.shadowMap.enabled = false;
      this.light = { ...this.light, shadows: false };
      this.sun.castShadow = false;
    }
    this.resize();
  }

  private movePassers(dt: number): void {
    const v = new THREE.Vector3();
    for (const p of this.passers) {
      const segs = p.path.length - 1;
      let total = 0;
      for (let i = 0; i < segs; i++) total += p.path[i].distanceTo(p.path[i + 1]);
      // back and forth along the path
      p.t = (p.t + (p.speed * dt) / total) % 2;
      const u = p.t < 1 ? p.t : 2 - p.t;
      let d = u * total;
      let i = 0;
      while (i < segs - 1 && d > p.path[i].distanceTo(p.path[i + 1])) d -= p.path[i++].distanceTo(p.path[i]);
      const a = p.path[i];
      const b = p.path[i + 1];
      v.copy(a).lerp(b, Math.min(1, d / a.distanceTo(b)));
      const prev = p.sprite.position.clone();
      p.sprite.position.copy(v);
      // the walking figure faces right: flip it when it's going left on screen
      const s0 = prev.project(this.camera).x;
      const s1 = v.clone().project(this.camera).x;
      const left = s1 < s0;
      if (Math.abs(s1 - s0) > 1e-5 && left !== p.flipped) {
        p.flipped = left;
        const map = (p.sprite.material as THREE.SpriteMaterial).map!;
        map.repeat.x = left ? -1 : 1;
        map.offset.x = left ? 1 : 0;
      }
    }
  }

  // Put each spot and marker's button where its point is on screen; hide
  // the ones behind you, too far, or behind a wall.
  private layoutOverlay(checkWalls: boolean): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (checkWalls) this.occlusionAt = performance.now();
    const cam = this.camera.position;
    const v = new THREE.Vector3();
    const show = (el: HTMLElement, at: THREE.Vector3, maxD: number): void => {
      const d = at.distanceTo(cam);
      v.copy(at).project(this.camera);
      let visible = d < maxD && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      if (visible && checkWalls) {
        this.raycaster.set(cam, at.clone().sub(cam).normalize());
        this.raycaster.far = d - 0.5;
        visible = this.raycaster.intersectObjects(this.built.occluders, false).length === 0;
        el.dataset.blocked = String(!visible);
      } else if (visible) visible = el.dataset.blocked !== "true";
      this.raycaster.far = Infinity;
      if (el.hidden === visible) el.hidden = !visible;
      if (!visible) return;
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
      el.style.setProperty("--near", String(Math.max(0.55, Math.min(1.15, 6 / d))));
    };
    const choosing = this.drawOpts.choosing !== null;
    for (const s of this.spots) show(s.el, s.at, choosing ? 34 : 15);
    for (const m of this.markers.values()) show(m.el, m.at, 34);
  }
}
