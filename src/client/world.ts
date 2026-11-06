// The walkable world: a first-person view you move through, the other
// people in it, what they say over their heads, and the kangaroo who comes
// when you wander off the trail. The sounds people leave are drawn and
// played by client/soundscape.ts, through the few things this lends it.
import * as THREE from "three";
import type { Scene } from "../shared/catalog.js";
import type { Person } from "../shared/protocol.js";
import { kangarooSvg, passerAvatar, type Pose } from "./figures.js";
import { AnimalFigure } from "./characters.js";
import { CoastalRenderer } from "./coastal-renderer.js";
import { beachBallTexture } from "./huts.js";
import { environmentLight, mixLight, separateSkySun, type Light } from "./sky.js";
import { minuteAt, timePhase, type Environment } from "../shared/environment.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import type { PlaceKit, Room } from "./places.js";
import { seasideKit } from "./seaside.js";
import { canStand, wind, type Built } from "./world-build.js";
import { loadLookMode, type LookMode } from "./look-settings.js";
import type { Position } from "../shared/protocol.js";

const KITS: Record<string, PlaceKit> = { seaside: seasideKit };

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
  // the nearest other person within talking distance, or null, when it changes
  onNear?: (person: Person | null) => void;
  // you went into a room (a toilet, a shower, the shop) or out of it (null)
  onRoom?: (room: Room | null) => void;
  // you came up to the door of a private room someone else is in
  onWait?: (room: Room) => void;
}

// Someone else in the place, as the server last placed them.
export interface Other extends Person {
  x: number;
  z: number;
  yaw: number;
}

interface OtherView {
  person: Person;
  sprite: AnimalFigure;
  gait: Gait;
  pose: "walk" | "stand";
  at: THREE.Vector3;
  goal: THREE.Vector3;
  yaw: number;
  label: HTMLDivElement;
  bubble: HTMLDivElement;
  bubbleTimer?: ReturnType<typeof setTimeout>;
}

// Close enough to talk, and how long words stay over someone's head.
const TALK = 3.5;
const SAID_MS = 5000;

interface Passer {
  sprite: AnimalFigure;
  path: THREE.Vector3[];
  t: number;
  speed: number;
  gait: Gait | null;
  wait: number;
}

interface RegularView {
  sprite: AnimalFigure;
  facing: number;
  roam: { home: THREE.Vector3; away: THREE.Vector3; gait: Gait; going: "away" | "home" | null; wait: number } | null;
  poses: [Pose, Pose];
  period: number;
  share: number;
  offset: number;
}

// Stride follows distance travelled, independent of the viewing camera.
interface Gait { phase: number }
const newGait = (): Gait => ({ phase: Math.random() });

// Children passing a beach ball. Now and then a throw goes wide: the ball
// lands, bounces and rolls, and the child it was for runs to fetch it and
// brings it back to their place.
interface Kid {
  sprite: AnimalFigure;
  hop: number;
  home: THREE.Vector3;
  gait: Gait;
}
interface BallGame {
  kids: Kid[];
  ball: THREE.Mesh;
  shadow: THREE.Mesh;
  state: "held" | "flying" | "bouncing" | "fetching" | "returning";
  from: number;
  to: number;
  // seconds into the flight, or (while held) seconds left before the throw
  t: number;
  flight: number;
  // a wide throw's landing place, and the ball's speed once it's down
  lands: THREE.Vector3 | null;
  velocity: THREE.Vector3;
}
const KID_H = 1.15;

const EYE = 1.62;
const WALK = 3.2;
const RUN = 5.6;
const reduced = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;


// The illustrated kangaroo helper retains its original drawing.
const textureCache = new Map<string, THREE.Texture>();
// The canvas must have the drawing's own proportions (people are 3:10), or
// the drawing fills only part of it and the sprite looks too small.
function svgTexture(key: string, svg: string, width = 180, height = 600): THREE.Texture {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const sized = svg.replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `);
  const img = new Image();
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.aspect = width / height;
  img.onload = () => (tex.needsUpdate = true);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  textureCache.set(key, tex);
  return tex;
}

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FRAG = `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float glow; uniform float stars; uniform float cloudCover; uniform float cloudTime;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
}
float cloudsAt(vec2 p){ return noise(p) * 0.52 + noise(p * 2.03 + 7.0) * 0.27 + noise(p * 4.07) * 0.14 + noise(p * 8.1 + 3.0) * 0.07; }
void main(){
  vec3 direction = normalize(vDir);
  float h = direction.y;
  vec3 c = h > 0.0 ? mix(horizon, top, pow(min(h * 2.2, 1.0), 0.45)) : mix(horizon, bottom, min(-h * 4.0, 1.0));
  float s = max(dot(direction, normalize(sunDir)), 0.0);
  c += sunColor * glow * (pow(s, 8.0) * 0.45 + pow(s, 600.0) * 1.6);
  // Broad, softly modelled cloud banks, made in the sky's one draw call.
  vec2 cloudUV = direction.xz / max(0.12, h + 0.24) * 3.2 + vec2(cloudTime * 0.003, cloudTime * 0.001);
  float cloudShape = cloudsAt(cloudUV);
  float cloudMask = smoothstep(0.54 - cloudCover * 0.18, 0.69 - cloudCover * 0.13, cloudShape);
  cloudMask *= smoothstep(0.015, 0.20, h) * (1.0 - smoothstep(0.66, 1.0, h));
  float lightEdge = cloudsAt(cloudUV + normalize(sunDir.xz) * 0.15) - cloudShape;
  float skyBrightness = dot(horizon, vec3(0.2126, 0.7152, 0.0722));
  vec3 cloudLit = vec3(1.12, 1.08, 0.98) * skyBrightness * 1.65;
  vec3 cloudColour = mix(horizon * 0.72, cloudLit, smoothstep(-0.06, 0.07, lightEdge));
  c = mix(c, cloudColour, cloudMask * (0.82 + cloudCover * 0.15));
  // A fixed celestial sky: no textures, extra draw calls or flickering.
  vec2 starUV = vec2(atan(direction.z, direction.x), asin(clamp(h, -1.0, 1.0))) * vec2(96.0, 76.0);
  vec2 cell = floor(starUV);
  float star = step(0.986, hash(cell)) * (1.0 - smoothstep(0.025, 0.13, length(fract(starUV) - 0.5)));
  float moon = smoothstep(0.99955, 0.99972, dot(direction, normalize(vec3(0.38, 0.62, -0.69))));
  c += vec3(0.74, 0.84, 1.0) * stars * smoothstep(0.05, 0.25, h) * star * 1.8;
  c += vec3(0.84, 0.9, 1.0) * stars * moon * 1.4;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class WorldView {
  private renderer: THREE.WebGLRenderer;
  private picture: CoastalRenderer;
  private scene3 = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private built: Built;
  private kit: PlaceKit;
  private sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private sun = new THREE.DirectionalLight();
  private hemi = new THREE.HemisphereLight();
  private overlay: HTMLDivElement;
  private passers: Passer[] = [];
  private regulars: RegularView[] = [];
  private game: BallGame | null = null;
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
  private reportedAt = 0;
  private environment: { value: Environment; serverMs: number; receivedAt: number } | null = null;
  private lightTransition: { from: Light; startedAt: number } | null = null;
  private lightAppliedAt = 0;
  private qualityShadows = true;
  private skyIntensity = 1;
  // with a photographed sky lighting the models, the drawn fill light is less
  private hemiScale = 1;
  // frames counted to decide whether this device needs a lighter picture
  private perf = { frames: 0, since: 0, lowered: 0 };
  private bornAt = performance.now();
  // the kangaroo who comes when you wander off the trail
  private roo: {
    sprite: THREE.Sprite;
    bubble: HTMLDivElement;
    state: "away" | "coming" | "here" | "leaving";
    path: THREE.Vector3[];
    hop: number;
    back: { x: number; z: number; yaw: number } | null;
  } | null = null;
  private strayFor = 0;
  private others = new Map<string, OtherView>();
  private room: Room | null = null;
  // private rooms you've already been asked to wait at, until you walk off
  private waited = new Set<string>();
  private near: string | null = null;
  // zone changes are only reported once the page has its view
  private ready = false;
  private inputPaused = false;
  private lookMode: LookMode = loadLookMode();

  constructor(
    private host: HTMLElement,
    private scene: Scene,
    private mode: string,
    private opts: Options,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.info.autoReset = false;
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
      `${scene.title}, drawn in 3D. Walk with the arrow keys or W A S D, drag to look around, or use the Go to buttons.`,
    );
    host.append(canvas);

    this.overlay = document.createElement("div");
    this.overlay.className = "world-overlay";
    host.append(this.overlay);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.08, 600);
    this.camera.rotation.order = "YXZ";
    this.picture = new CoastalRenderer(this.renderer, this.scene3, this.camera);

    this.kit = KITS[scene.id] ?? seasideKit;
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
          stars: { value: 0 },
          cloudCover: { value: 0 },
          cloudTime: { value: 0 },
        },
      }),
    );
    this.scene3.add(this.sky);

    const small = Math.min(innerWidth, innerHeight) < 700;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26;
    sc.right = 26;
    sc.top = 26;
    sc.bottom = -26;
    sc.near = 1;
    sc.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2.4;
    this.sun.shadow.intensity = 0.78;
    this.sun.target.position.set(...this.kit.sunTarget);
    this.scene3.add(this.sun, this.sun.target, this.hemi);
    this.scene3.fog = new THREE.Fog(0xffffff, 20, 120);

    this.light = environmentLight(840, "clear");
    this.applyLight(this.light);

    this.buildPassers();
    this.movePassers(0);
    for (const p of this.passers) { p.sprite.setPose("stand"); p.sprite.setMotion(0, false); }
    this.buildRegulars();
    this.buildGame();

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

  goTo(zoneId: string): void {
    const shot = this.scene.zones.find((s) => s.id === zoneId);
    if (!shot?.spawn) return;
    if (reduced()) return this.placeAt(zoneId);
    this.host.classList.add("fading");
    setTimeout(() => {
      this.placeAt(zoneId);
      this.host.classList.remove("fading");
    }, 260);
  }

  // Modal browsing keeps the world alive but releases movement already held.
  setInputPaused(paused: boolean): void {
    this.inputPaused = paused;
    this.keys.clear();
    this.stick = { x: 0, y: 0 };
    this.target = null;
  }

  setLookMode(mode: LookMode): void {
    this.lookMode = mode;
  }

  // Room time is authoritative; elapsed time uses the monotonic clock so a
  // changed computer clock cannot jump the sun or rewind a shared update.
  setEnvironment(environment: Environment, serverNow: string): void {
    const current = this.environment;
    if (current && environment.revision < current.value.revision) return;
    const serverMs = Date.parse(serverNow);
    if (!Number.isFinite(serverMs)) return;
    const now = performance.now();
    const sameRevision = current?.value.revision === environment.revision;
    const sampledNow = sameRevision ? Math.max(serverMs, current.serverMs + Math.max(0, now - current.receivedAt)) : serverMs;
    this.environment = { value: { ...environment }, serverMs: sampledNow, receivedAt: now };
    // A fresh snapshot catches a suspended tab up without letting an old ACK
    // rewind it or repeatedly restarting a transition already under way.
    if (!sameRevision) this.lightTransition = reduced() ? null : { from: this.light, startedAt: now };
    if (environment.weather === "rain" && !this.rain) this.buildRain();
    this.updateEnvironment(now, true);
  }

  // A rejected move returns to the last position accepted by the server.
  correctPosition(position: Position): void {
    if (![position.x, position.z, position.yaw].every(Number.isFinite)) return;
    this.x = position.x;
    this.z = position.z;
    this.yaw = position.yaw;
    this.keys.clear();
    this.target = null;
    this.setZone(this.kit.zoneAt(this.x, this.z));
  }

  // Orient towards a contribution; walking and collision remain in your hands.
  faceSound(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.target = null;
    this.yaw = Math.atan2(-(x - this.x), -(z - this.z));
    this.pitch = -0.04;
    this.focusCanvas();
  }

  currentZone(): string {
    return this.zone;
  }

  focusCanvas(): void {
    this.renderer.domElement.focus({ preventScroll: true });
  }

  // What client/soundscape.ts draws with: the world to add its lights to,
  // the camera to place labels by, the layer over the view to put them in.
  get root(): THREE.Object3D {
    return this.built.root;
  }

  get eye(): THREE.Camera {
    return this.camera;
  }

  get labels(): HTMLElement {
    return this.overlay;
  }

  get size(): { w: number; h: number } {
    return { w: this.host.clientWidth, h: this.host.clientHeight };
  }

  // Visual anchors sit on actual floor geometry, including raised planks.
  // This never changes the listener, movement, admission or sound position.
  surfaceHeight(x: number, z: number): number {
    for (const floor of this.built.floors) floor.updateWorldMatrix(true, false);
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 8, z), new THREE.Vector3(0, -1, 0), 0, 16);
    return ray.intersectObjects(this.built.floors, false)[0]?.point.y ?? 0;
  }

  isInside(x: number, z: number): boolean {
    return this.kit.isInside(x, z);
  }

  zoneAt(x: number, z: number): string {
    return this.kit.zoneAt(x, z);
  }

  // ---- loading -----------------------------------------------------------

  // The CC0 sky lights the place; the drawn sky keeps its coastal palette.
  private async loadSky(): Promise<void> {
    const sky = this.kit.skies?.[this.mode];
    if (!sky) return;
    try {
      const tex = await new RGBELoader().loadAsync(sky.url);
      const pixels: unknown = tex.image.data;
      if (pixels instanceof Uint16Array || pixels instanceof Float32Array) separateSkySun(pixels);
      tex.needsUpdate = true;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      this.scene3.environment = tex;
      this.skyIntensity = sky.intensity;
      this.hemiScale = 0.72;
      // Loading may finish after someone changes time or weather. Never
      // restore the original daytime exposure or illumination here.
      this.applyLight(this.light);
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
    } catch {
      label.textContent = "Some furniture didn't load. Everything else still works.";
      setTimeout(() => label.remove(), 6000);
    }
  }

  // ---- light -------------------------------------------------------------

  private applyLight(l: Light): void {
    this.light = l;
    const u = this.sky.material.uniforms;
    (u.top.value as THREE.Color).setHex(l.skyTop);
    (u.horizon.value as THREE.Color).setHex(l.skyHorizon);
    (u.bottom.value as THREE.Color).setHex(l.skyBottom);
    (u.sunDir.value as THREE.Vector3).set(...l.sunDir).normalize();
    (u.sunColor.value as THREE.Color).setHex(l.sunColor);
    u.glow.value = l.sunGlow;
    u.stars.value = l.stars;
    u.cloudCover.value = l.cloudCover;

    const dir = new THREE.Vector3(...l.sunDir).normalize();
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 90);
    this.sun.color.setHex(l.sunColor);
    this.sun.intensity = l.sunIntensity;
    this.sun.castShadow = l.shadows && this.qualityShadows;
    this.hemi.color.setHex(l.hemiSky);
    this.hemi.groundColor.setHex(l.hemiGround);
    this.hemi.intensity = l.hemiIntensity * this.hemiScale;
    this.scene3.environmentIntensity = this.skyIntensity * l.environment;
    const fog = this.scene3.fog as THREE.Fog;
    fog.color.setHex(l.fog);
    fog.near = l.fogNear;
    fog.far = l.fogFar;

    const b = this.built;
    b.ceilingStrips.emissive.setHex(l.ceiling);
    b.ceilingStrips.emissiveIntensity = 0.3 + l.ceilingIntensity;
    for (const c of b.ceilingLights) {
      const outdoors = c.userData.outdoorLamp === true;
      const accent = c.userData.cafeAccent === true;
      c.color.setHex(accent ? 0xffd3a0 : outdoors ? l.lamp || 0xffffff : l.ceiling);
      c.intensity = accent ? Number(c.userData.cafeAccentIntensity) * (0.7 + l.windowGlow * 0.3)
        : outdoors ? l.lampIntensity : l.ceilingIntensity * 9;
    }
    b.lamp.color.setHex(l.lamp || 0xffffff);
    b.lamp.intensity = l.lampIntensity;
    b.lampHead.emissive.setHex(l.lamp || 0x000000);
    b.lampHead.emissiveIntensity = Math.min(2.5, l.lampIntensity / 8);
    b.windows.emissiveIntensity = l.windowGlow * 0.32;
    b.paving.roughness = 0.8 - l.wetness * 0.58;
    b.paving.metalness = l.wetness * 0.18;
    b.paving.color.setHex(0xffffff).lerp(new THREE.Color(0x8f8d90), l.wetness);
    this.renderer.toneMappingExposure = l.exposure;
    for (const p of [...this.passers, ...this.regulars, ...(this.game?.kids ?? [])]) p.sprite.setTint(l.figureTint);
    for (const other of this.others.values()) other.sprite.setTint(l.figureTint);
    if (this.roo) (this.roo.sprite.material as THREE.SpriteMaterial).color.setHex(l.figureTint);
  }

  private updateEnvironment(now: number, force = false): void {
    const clock = this.environment;
    if (!clock) return;
    const minute = minuteAt(clock.value, clock.serverMs + Math.max(0, now - clock.receivedAt));
    const reduce = reduced();
    if (reduce) this.lightTransition = null;
    if (force || this.lightTransition || now - this.lightAppliedAt >= 100) {
      const target = environmentLight(minute, clock.value.weather);
      const transition = this.lightTransition;
      const progress = transition ? Math.min(1, (now - transition.startedAt) / 1200) : 1;
      this.applyLight(transition ? mixLight(transition.from, target, progress * progress * (3 - 2 * progress)) : target);
      if (progress >= 1) this.lightTransition = null;
      this.lightAppliedAt = now;
      this.host.dataset.weather = clock.value.weather;
      this.host.dataset.timePhase = timePhase(minute);
      this.host.dataset.worldMinute = minute.toFixed(1);
    }
    if (this.rain) this.rain.visible = clock.value.weather === "rain" && !reduce;
    this.host.dataset.rain = clock.value.weather !== "rain" ? "off" : reduce ? "reduced-motion" : "visible";
  }


  // Passers-by who make no sound: they only show how busy the hour is.
  private buildPassers(): void {
    const count = this.mode === "weekday" ? 9 : this.mode === "morning" ? 2 : this.mode === "rainy-dusk" ? 3 : 0;
    const paths = this.kit.passerPaths.map((p) => p.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    for (let i = 0; i < count; i++) {
      const path = paths[i % paths.length];
      // people indoors have put their umbrellas away
      const umbrella = this.mode === "rainy-dusk" && !this.kit.isInside(path[0].x, path[0].z);
      const seed = `passer-${this.mode}-${i}`;
      const avatar = passerAvatar(seed);
      const sprite = new AnimalFigure({ avatar, seed, pose: umbrella ? "umbrella" : "stand" });
      this.built.root.add(sprite);
      // each at their own pace, a little either side of 1.35 m/s
      const speed = (this.mode === "weekday" ? 1.2 : 0.9) + (i % 3) * 0.12 + Math.random() * 0.1;
      this.passers.push({ sprite, path, t: (i * 0.37 + 0.17) % 1, speed, gait: umbrella ? null : newGait(), wait: 0 });
    }
  }

  // People who stay put: the café's regulars, the guitarist on the bench.
  // Like passers-by they have no names, so they can't be taken for someone
  // who's really here.
  private buildRegulars(): void {
    for (const [i, r] of (this.kit.regulars?.[this.mode] ?? []).entries()) {
      const seed = r.seed ?? `regular-${i}`;
      const avatar = r.avatar ?? (i % 3 === 1 ? "dog" : "cat");
      const sprite = new AnimalFigure({ avatar, seed, pose: r.pose });
      // +Z faces the boardwalk; people at the glass bar face out to sea.
      const facing = r.facing ?? (r.pose === "back" ? Math.PI : 0);
      sprite.setFacing(facing);
      const floorY = this.surfaceHeight(r.x, r.z);
      sprite.position.set(r.x, floorY, r.z);
      this.built.root.add(sprite);
      // a guitarist's hand goes up and down; talkers gesture and rest; some
      // turn now and then to what they're doing
      const second: Pose | undefined = r.pose === "guitar" ? "strum" : r.pose === "talk" ? "stand" : r.alt;
      const [period, share] = r.pose === "guitar" ? [0.52, 0.5] : r.pose === "talk" ? [2 + (i % 3) * 0.5, 0.45] : [7 + (i % 4) * 1.5, 0.35];
      const roam = r.roam ? { home: new THREE.Vector3(r.x, floorY, r.z), away: new THREE.Vector3(r.roam[0], this.surfaceHeight(...r.roam), r.roam[1]), gait: newGait(), going: null, wait: 6 + Math.random() * 10 } : null;
      this.regulars.push({ sprite, facing, roam, poses: [r.pose, second ?? r.pose], period, share, offset: Math.random() });
    }
  }

  // Children on the sand throwing a beach ball between them.
  private buildGame(): void {
    const at = this.kit.ballGame;
    if (!at?.length) return;
    const kids = at.map(([x, z], i) => {
      const seed = `kid-${i}`;
      const avatar = i % 2 ? "dog" : "cat";
      const sprite = new AnimalFigure({ avatar, seed, height: KID_H, child: true });
      sprite.setFacing(Math.atan2(4 - x, 14 - z));
      sprite.position.set(x, 0, z);
      this.built.root.add(sprite);
      return { sprite, hop: 0, home: new THREE.Vector3(x, 0, z), gait: newGait() };
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), new THREE.MeshStandardMaterial({ map: beachBallTexture(), roughness: 0.45 }));
    ball.castShadow = true;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    this.built.root.add(ball, shadow);
    this.game = { kids, ball, shadow, state: "held", from: 0, to: 1, t: 0.8, flight: 1, lands: null, velocity: new THREE.Vector3() };
    this.playBall(0);
  }

  // The ball's place: in the holder's raised hands, on its arc to the
  // catcher (turning as it goes), or, after a wide throw, bouncing and
  // rolling on the sand until the child it was meant for fetches it.
  // Whoever is about to catch it reaches up and hops; the thrower's arms
  // come down once it's away.
  private playBall(dt: number): void {
    const g = this.game;
    if (!g) return;
    const R = 0.17;
    const hands = (i: number): THREE.Vector3 => {
      const p = g.kids[i].sprite.position;
      // over their head, a little towards you so it's in front of the
      // hands rather than behind them
      const toEye = new THREE.Vector3(this.x - p.x, 0, this.z - p.z).normalize().multiplyScalar(0.05);
      return new THREE.Vector3(p.x + toEye.x, p.y + KID_H + 0.14, p.z + toEye.z);
    };
    const roll = (v: THREE.Vector3): void => {
      // turning about the axis across its path, by the distance covered
      g.ball.rotateOnWorldAxis(new THREE.Vector3(v.z, 0, -v.x).normalize(), (v.length() * dt) / R);
    };
    const up = new Set<number>();
    let runner = -1;

    if (g.state === "held") {
      g.t -= dt;
      g.ball.position.copy(hands(g.from));
      up.add(g.from);
      if (g.t <= 0) {
        // throw to anyone else; about one throw in five goes wide
        g.to = (g.from + 1 + Math.floor(Math.random() * (g.kids.length - 1))) % g.kids.length;
        const a = g.kids[g.from].home;
        const b = g.kids[g.to].home;
        g.lands = null;
        if (Math.random() < 0.2) {
          const along = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
          const across = new THREE.Vector3(-along.z, 0, along.x);
          g.lands = b.clone().addScaledVector(along, 1.2 + Math.random()).addScaledVector(across, (Math.random() - 0.5) * 1.6).setY(R);
        }
        g.flight = 0.7 + a.distanceTo(g.lands ?? b) * 0.12;
        g.t = 0;
        g.state = "flying";
      }
    } else if (g.state === "flying") {
      g.t += dt;
      const u = Math.min(1, g.t / g.flight);
      const a = hands(g.from);
      const b = g.lands ?? hands(g.to);
      const peak = 1.2 + a.distanceTo(b) * 0.15;
      g.ball.position.lerpVectors(a, b, u);
      g.ball.position.y += 4 * peak * u * (1 - u);
      g.ball.rotation.x += dt * 7;
      g.ball.rotation.z += dt * 3;
      if (u < 0.2) up.add(g.from);
      // the catcher reaches for it, even for one that goes over
      if (u > 0.55 && u < 0.85) up.add(g.to);
      if (u > 0.55 && !g.lands) up.add(g.to);
      if (u >= 1 && !g.lands) {
        g.from = g.to;
        g.state = "held";
        g.t = 0.5 + Math.random() * 1.2;
        g.kids[g.from].hop = 0.35;
      } else if (u >= 1) {
        // it lands moving on the way it was going, and bounces
        const along = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
        g.velocity.copy(along).multiplyScalar(2.2).setY(3);
        g.state = "bouncing";
      }
    } else if (g.state === "bouncing") {
      g.velocity.y -= 9.8 * dt;
      g.ball.position.addScaledVector(g.velocity, dt);
      if (g.ball.position.y <= R) {
        g.ball.position.y = R;
        // each bounce lower, until it only rolls; sand slows it
        g.velocity.y = Math.abs(g.velocity.y) > 0.8 ? -g.velocity.y * 0.42 : 0;
        g.velocity.x *= 1 - Math.min(1, dt * 2.5);
        g.velocity.z *= 1 - Math.min(1, dt * 2.5);
      }
      roll(g.velocity);
      if (g.velocity.y === 0 && Math.hypot(g.velocity.x, g.velocity.z) < 0.08) {
        g.state = "fetching";
        g.t = 0.4; // a moment before anyone moves
      }
    } else if (g.state === "fetching" || g.state === "returning") {
      // the child it was for runs to it, picks it up, and takes it home
      const k = g.kids[g.to];
      runner = g.to;
      if (g.state === "fetching" && g.t > 0) g.t -= dt;
      else {
        const goal = g.state === "fetching" ? g.ball.position.clone().setY(0) : k.home;
        const from = k.sprite.position.clone().setY(0);
        const left = from.distanceTo(goal) - (g.state === "fetching" ? 0.3 : 0);
        const step = Math.min(Math.max(left, 0), 2.6 * dt);
        const to = from.clone().add(goal.clone().sub(from).setY(0).normalize().multiplyScalar(step));
        k.sprite.position.set(to.x, 0, to.z);
        if (step > 0) this.stride(k.sprite, k.gait, from, to, dt);
        // carried home in front of them, at the chest, so they can run
        if (g.state === "returning") g.ball.position.copy(hands(g.to)).setY(k.sprite.position.y + KID_H * 0.55);
        if (left <= 0.01) {
          if (g.state === "fetching") {
            g.state = "returning";
            k.hop = 0.35;
          } else {
            k.sprite.position.copy(k.home);
            g.from = g.to;
            g.state = "held";
            g.t = 0.4 + Math.random() * 0.6;
          }
        }
      }
    }

    g.shadow.position.set(g.ball.position.x, 0.02, g.ball.position.z);
    const lift = Math.max(0, g.ball.position.y - R);
    g.shadow.scale.setScalar(1 / (1 + lift * 0.25));
    (g.shadow.material as THREE.MeshBasicMaterial).opacity = 0.28 / (1 + lift * 0.5);
    g.kids.forEach((k, i) => {
      // a little jump on the catch
      k.hop = Math.max(0, k.hop - dt);
      k.sprite.position.y = Math.sin((k.hop / 0.35) * Math.PI) * 0.12;
      // a running child's frames are the stride's
      if (i === runner && !(g.state === "fetching" && g.t > 0)) return;
      k.sprite.setPose(up.has(i) ? "arms-up" : "stand");
      k.sprite.setMotion(0, false);
      const partner = g.kids[i === g.from ? g.to : g.from].sprite.position;
      k.sprite.setFacing(Math.atan2(partner.x - k.sprite.position.x, partner.z - k.sprite.position.z));
    });
  }

  // Staff now and then walk to another spot (the other end of the counter,
  // the fryers, the shelves), stay a while, and walk back.
  private moveRegulars(dt: number): void {
    for (const r of this.regulars) {
      const m = r.roam;
      if (!m) continue;
      if (!m.going) {
        m.wait -= dt;
        if (m.wait > 0) continue;
        m.going = r.sprite.position.distanceTo(m.home) < 0.05 ? "away" : "home";
      }
      const goal = m.going === "away" ? m.away : m.home;
      const from = r.sprite.position.clone();
      const left = from.distanceTo(goal);
      const to = from.clone().add(goal.clone().sub(from).normalize().multiplyScalar(Math.min(left, 0.9 * dt)));
      r.sprite.position.copy(to);
      this.stride(r.sprite, m.gait, from, to, dt);
      if (left <= 0.9 * dt) {
        r.sprite.position.copy(goal);
        // a few seconds at the other spot, longer at home
        m.wait = m.going === "away" ? 3 + Math.random() * 4 : 10 + Math.random() * 12;
        m.going = null;
      }
    }
  }

  private idle(now: number): void {
    const t = now / 1000;
    for (const r of this.regulars) {
      if (r.roam?.going) continue;
      const away = r.roam && r.sprite.position.distanceTo(r.roam.home) > 0.05;
      const second = away || (t / r.period + r.offset) % 1 > 1 - r.share;
      const pose = r.poses[second ? 1 : 0];
      r.sprite.setPose(pose);
      r.sprite.setMotion(t / 4 + r.offset, false);
      r.sprite.setFacing(r.facing + (pose === "back" && r.poses[0] !== "back" ? Math.PI : 0));
    }
  }

  private stride(sprite: AnimalFigure, g: Gait, from: THREE.Vector3, to: THREE.Vector3, dt: number): void {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const moved = Math.hypot(dx, dz);
    if (moved < 1e-5) return;
    const speed = moved / Math.max(dt, 1e-3);
    g.phase = (g.phase + moved / (1.2 + 0.25 * Math.min(speed, 6))) % 1;
    sprite.setFacing(Math.atan2(dx, dz));
    sprite.setPose("walk");
    sprite.setMotion(g.phase, true);
  }

  private buildRain(): void {
    // One reusable, camera-local buffer. The old full-world sheet spent
    // most drops off screen and could draw through the private huts.
    const budget = Math.min(innerWidth, innerHeight) < 700 ? 900 : 2400;
    const n = Math.min(this.kit.rainCount ?? 2400, budget);
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      this.resetRainDrop(pos, i * 6, true);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc1d1df, transparent: true, opacity: 0.3, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = !reduced();
    this.scene3.add(this.rain);
  }

  private resetRainDrop(pos: Float32Array, i: number, scatter: boolean): void {
    let x = 0;
    let z = 0;
    let outdoors = false;
    // Roof rejection is bounded even if a future indoor area is larger
    // than this rain volume. A failed drop stays invisibly below ground.
    for (let attempt = 0; attempt < 24; attempt++) {
      x = this.x + (Math.random() - 0.5) * 52;
      z = this.z + (Math.random() - 0.5) * 52;
      if (!this.kit.isInside(x, z) && !this.kit.isInside(x - 0.03, z)) {
        outdoors = true;
        break;
      }
    }
    const y = outdoors ? (scatter ? Math.random() * 16 - 2 : 14) : -100;
    pos.set([x, y, z, x - 0.03, y + 0.45, z], i);
  }

  // ---- moving ------------------------------------------------------------

  private placeAt(zoneId: string): void {
    const shot = this.scene.zones.find((s) => s.id === zoneId) ?? this.scene.zones[0];
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
      if (t.closest("dialog[open], [role=dialog]")) return true;
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

    // Follow the selected preference on both axes; follow-pointer is default.
    // A tap or click without dragging walks to that spot of floor.
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
      const direction = this.lookMode === "scene" ? 1 : -1;
      this.yaw += dx * 0.0042 * direction;
      this.pitch = Math.max(-0.9, Math.min(0.75, this.pitch + dy * 0.0034 * direction));
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

  // You can't walk through someone else: you bump into them.
  private free(x: number, z: number): boolean {
    if (!canStand(this.built, x, z)) return false;
    for (const o of this.others.values()) {
      const now = Math.hypot(this.x - o.at.x, this.z - o.at.z);
      const next = Math.hypot(x - o.at.x, z - o.at.z);
      // moving away from someone you're already touching is always allowed
      if (next < 0.65 && next < now) return false;
    }
    return true;
  }

  private tryMove(dx: number, dz: number): boolean {
    return this.slide(dx, dz);
  }

  private slide(dx: number, dz: number): boolean {
    const nx = this.x + dx;
    const nz = this.z + dz;
    if (this.free(nx, nz)) {
      this.x = nx;
      this.z = nz;
      return true;
    }
    // slide along walls
    if (this.free(nx, this.z)) {
      this.x = nx;
      return true;
    }
    if (this.free(this.x, nz)) {
      this.z = nz;
      return true;
    }
    return false;
  }

  private move(dt: number): void {
    if (this.inputPaused) return;
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
    this.camera.fov = w / h < 0.8 ? 78 : 62;
    this.camera.updateProjectionMatrix();
    this.picture.resize(w, h);
  }

  private frame(): void {
    const now = performance.now();
    // A slow device still walks at full speed: long frames are split into
    // short steps, so a step never jumps through a wall.
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;

    this.updateEnvironment(now);

    this.adaptQuality(now);
    const steps = Math.ceil(dt / 0.04);
    for (let i = 0; i < steps; i++) this.move(dt / steps);
    this.watchTrail(dt);
    const bobY = Math.sin(this.bob) * 0.035;
    this.camera.position.set(this.x, EYE + bobY, this.z);
    const people = [{ x: this.x, z: this.z, me: true }, ...[...this.others.values()].map((o) => ({ x: o.at.x, z: o.at.z }))];
    this.kit.animate?.(now / 1000, people);
    this.watchRooms(people);
    this.followSun();
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.sky.position.copy(this.camera.position);

    if (!reduced()) {
      this.movePassers(dt);
      this.moveRegulars(dt);
      this.idle(now);
      this.playBall(dt);
    }
    this.moveOthers(dt);
    // Shared arrivals and passing walkers may occupy the camera's position.
    // Keep their identity/talk/sound intact without drawing clipped body parts.
    for (const p of [...this.passers, ...this.regulars, ...(this.game?.kids ?? []), ...this.others.values()]) {
      p.sprite.visible = Math.hypot(p.sprite.position.x - this.x, p.sprite.position.z - this.z) > 0.65;
    }
    if (this.rain?.visible && !reduced()) {
      const pos = this.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      for (let i = 0; i < a.length; i += 6) {
        a[i + 1] -= 13 * dt;
        a[i + 4] -= 13 * dt;
        if (a[i + 1] < -3.5 || Math.abs(a[i] - this.x) > 28 || Math.abs(a[i + 2] - this.z) > 28) this.resetRainDrop(a, i, false);
      }
      pos.needsUpdate = true;
    }

    if (!reduced()) {
      wind.value = now / 1000;
      this.sky.material.uniforms.cloudTime.value = now / 1000;
    }
    this.renderer.info.reset();
    this.picture.render();
    // where you are, for the end-to-end checks, a few times a second
    if (now - this.reportedAt > 160) {
      this.reportedAt = now;
      this.host.dataset.at = `${this.x.toFixed(1)},${this.z.toFixed(1)}`;
      this.host.dataset.environmentRevision = String(this.environment?.value.revision ?? 0);
      this.host.dataset.rainDrops = String(this.rain?.visible ? this.rain.geometry.getAttribute("position").count / 2 : 0);
      this.host.dataset.lampIntensity = this.built.lamp.intensity.toFixed(2);
      this.host.dataset.environmentIntensity = this.scene3.environmentIntensity.toFixed(3);
    }
    this.opts.onListen?.({
      x: this.x,
      y: EYE,
      z: this.z,
      yaw: this.yaw,
      inside: this.kit.isInside(this.x, this.z),
    });
  }

  // Rooms: tell the page when you go into one or come out, and when you come
  // up to a private one someone else is in (once, until you walk away).
  private watchRooms(people: { x: number; z: number; me?: boolean }[]): void {
    const roomAt = this.kit.roomAt;
    if (!roomAt) return;
    const mine = roomAt(this.x, this.z) ?? null;
    if (mine?.id !== this.room?.id) {
      this.room = mine;
      this.opts.onRoom?.(mine);
    }
    const taken = new Map<string, Room>();
    for (const p of people) {
      const r = p.me ? null : roomAt(p.x, p.z);
      if (r?.private) taken.set(r.id, r);
    }
    for (const r of taken.values()) {
      if (mine?.id === r.id) continue;
      const d = Math.hypot(this.x - r.door.x, this.z - r.door.z);
      if (d < 2.3 && !this.waited.has(r.id)) {
        this.waited.add(r.id);
        this.opts.onWait?.(r);
      }
    }
    for (const id of this.waited) {
      const r = taken.get(id);
      if (!r || Math.hypot(this.x - r.door.x, this.z - r.door.z) > 3.5) this.waited.delete(id);
    }
  }

  // ---- other people --------------------------------------------------------

  // Everyone else in the place, as the server says they stand.
  setOthers(people: Other[]): void {
    const seen = new Set<string>();
    for (const p of people) {
      seen.add(p.id);
      let o = this.others.get(p.id);
      if (!o) {
        const sprite = new AnimalFigure({ avatar: p.avatar, seed: p.id });
        sprite.setFacing(p.yaw + Math.PI);
        sprite.position.set(p.x, this.surfaceHeight(p.x, p.z), p.z);
        this.built.root.add(sprite);
        const label = document.createElement("div");
        label.className = "other-name";
        label.textContent = p.name;
        const bubble = document.createElement("div");
        bubble.className = "said-bubble";
        bubble.hidden = true;
        this.overlay.append(label, bubble);
        o = { person: p, sprite, gait: newGait(), pose: "stand", at: sprite.position.clone(), goal: sprite.position.clone(), yaw: p.yaw, label, bubble };
        this.others.set(p.id, o);
      }
      o.goal.set(p.x, this.surfaceHeight(p.x, p.z), p.z);
      o.yaw = p.yaw;
    }
    for (const [id, o] of this.others) {
      if (seen.has(id)) continue;
      o.sprite.dispose();
      o.label.remove();
      o.bubble.remove();
      clearTimeout(o.bubbleTimer);
      this.others.delete(id);
    }
  }

  // Words over someone's head, until they say something else or 5 s pass.
  showSaid(personId: string, text: string): void {
    const o = this.others.get(personId);
    if (!o) return;
    o.bubble.textContent = text;
    o.bubble.hidden = false;
    clearTimeout(o.bubbleTimer);
    o.bubbleTimer = setTimeout(() => (o.bubble.hidden = true), SAID_MS);
  }

  private moveOthers(dt: number): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const v = new THREE.Vector3();
    let nearest: OtherView | null = null;
    let nearestD = TALK;
    for (const o of this.others.values()) {
      const before = o.at.clone();
      // ease towards where the server last put them
      o.at.lerp(o.goal, Math.min(1, dt * 8));
      const speed = before.distanceTo(o.at) / Math.max(dt, 1e-3);
      o.pose = speed > 0.4 ? "walk" : "stand";
      if (o.pose === "walk" && !reduced()) this.stride(o.sprite, o.gait, before, o.at, dt);
      else {
        o.sprite.setPose("stand");
        o.sprite.setMotion(0, false);
        o.sprite.setFacing(o.yaw + Math.PI);
      }
      o.sprite.position.copy(o.at);
      const d = Math.hypot(o.at.x - this.x, o.at.z - this.z);
      if (d < nearestD) {
        nearestD = d;
        nearest = o;
      }
      // name and words over their head
      o.sprite.updateWorldMatrix(true, true);
      o.sprite.headAnchor.getWorldPosition(v);
      v.y += 0.24;
      v.project(this.camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && d < 40;
      const x = ((v.x + 1) / 2) * w;
      const y = ((1 - v.y) / 2) * h;
      o.label.hidden = !visible;
      if (visible) o.label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      if (!o.bubble.hidden || o.bubble.dataset.shown === "1") {
        o.bubble.style.visibility = visible ? "visible" : "hidden";
        if (visible) this.keepInView(o.bubble, x, y - 22);
      }
    }
    const id = nearest?.person.id ?? null;
    if (id !== this.near) {
      this.near = id;
      this.opts.onNear?.(nearest?.person ?? null);
    }
  }

  // ---- the kangaroo ------------------------------------------------------

  // Wander more than a little way off the trail and a kangaroo hops in from
  // the distance, stops in front of you, and tells you the way back (with a
  // button that takes you there). Back near the trail, it hops off.
  private watchTrail(dt: number): void {
    const kit = this.kit;
    if (!kit.offTrail) return;
    const back = kit.offTrail(this.x, this.z);
    this.strayFor = back ? this.strayFor + dt : 0;
    const roo = this.roo;
    if (back && this.strayFor > 1.2 && (!roo || roo.state === "away" || roo.state === "leaving")) this.summonRoo(back);
    else if (back && roo && roo.state !== "away") {
      roo.back = back;
      // you walked on: it comes after you
      const here = roo.path[roo.path.length - 1];
      if (roo.state === "here" && Math.hypot(here.x - this.x, here.z - this.z) > 9) this.summonRoo(back, true);
    } else if (!back && roo && (roo.state === "coming" || roo.state === "here") && kit.onTrail?.(this.x, this.z)) this.dismissRoo("That's the way! Enjoy the walk.");
    if (this.roo && this.roo.state !== "away") this.hopRoo(dt);
  }

  private ensureRoo(): NonNullable<WorldView["roo"]> {
    if (this.roo) return this.roo;
    const mat = new THREE.SpriteMaterial({ map: svgTexture("kangaroo", kangarooSvg(), 240, 300), transparent: true, alphaTest: 0.05, color: this.light.figureTint });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0.02);
    sprite.scale.set((1.8 * 120) / 150, 1.8, 1);
    sprite.visible = false;
    this.built.root.add(sprite);
    const bubble = document.createElement("div");
    bubble.className = "roo-bubble";
    bubble.setAttribute("role", "status");
    bubble.hidden = true;
    bubble.innerHTML = `<p class="roo-text"></p><button type="button" class="roo-back">Take me back to the trail</button>`;
    bubble.querySelector<HTMLButtonElement>(".roo-back")!.onclick = () => this.backToTrail();
    this.overlay.append(bubble);
    this.roo = { sprite, bubble, state: "away", path: [], hop: 0, back: null };
    return this.roo;
  }

  private summonRoo(back: { x: number; z: number; yaw: number }, following = false): void {
    const roo = this.ensureRoo();
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const to = this.clearSpotAhead(back);
    const out = new THREE.Vector3(to.x - this.x, 0, to.z - this.z).normalize();
    const from = following ? roo.sprite.position.clone() : new THREE.Vector3(to.x + out.x * 18 + rx * 5, 0, to.z + out.z * 18 + rz * 5);
    roo.path = [from, to];
    roo.hop = 0;
    roo.back = back;
    roo.state = reduced() ? "here" : "coming";
    roo.sprite.position.copy(reduced() ? to : from);
    roo.sprite.visible = true;
    if (roo.state === "here") this.rooSays();
    else roo.bubble.hidden = true;
  }

  // Somewhere a few metres away with room to stand and no trunk between it
  // and you, so the kangaroo can be seen: ahead of you if possible (turning
  // further and further to the sides), else the way back to the trail.
  private clearSpotAhead(back: { x: number; z: number }): THREE.Vector3 {
    const circles = this.built.circles ?? [];
    // A trunk is drawn about 1.7 times as wide as it collides; you can stand
    // against one (0.63 m from its middle), so a line that only grazes it
    // where you stand still counts as seen.
    const seen = (x: number, z: number): boolean =>
      circles.every((c) => {
        const dx = x - this.x;
        const dz = z - this.z;
        const t = Math.max(0, Math.min(1, ((c.x - this.x) * dx + (c.z - this.z) * dz) / (dx * dx + dz * dz)));
        return Math.hypot(this.x + dx * t - c.x, this.z + dz * t - c.z) > c.r * 1.7;
      });
    const toTrail = Math.atan2(-(back.x - this.x), -(back.z - this.z));
    const headings = [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3].map((a) => this.yaw + a).concat([toTrail, toTrail + 0.4, toTrail - 0.4]);
    for (const heading of headings)
      for (const d of [3.5, 4.5, 6, 8]) {
        const x = this.x - Math.sin(heading) * d;
        const z = this.z - Math.cos(heading) * d;
        if (canStand(this.built, x, z, 0.6) && seen(x, z)) return new THREE.Vector3(x, 0, z);
      }
    return new THREE.Vector3(this.x - Math.sin(toTrail) * 4.5, 0, this.z - Math.cos(toTrail) * 4.5);
  }

  private rooSays(): void {
    const roo = this.roo!;
    roo.bubble.querySelector(".roo-text")!.textContent = "G'day! You've wandered a long way off the trail. Head back to the path, or I can hop you over.";
    roo.bubble.querySelector<HTMLButtonElement>(".roo-back")!.hidden = false;
    roo.bubble.hidden = false;
  }

  private dismissRoo(words: string): void {
    const roo = this.roo!;
    roo.bubble.querySelector(".roo-text")!.textContent = words;
    roo.bubble.querySelector<HTMLButtonElement>(".roo-back")!.hidden = true;
    roo.bubble.hidden = false;
    const at = roo.sprite.position.clone();
    const away = new THREE.Vector3(at.x - this.x, 0, at.z - this.z).normalize().multiplyScalar(24).add(at);
    roo.path = [at, away];
    roo.hop = 0;
    roo.state = reduced() ? "away" : "leaving";
    if (roo.state === "away") roo.sprite.visible = false;
    setTimeout(() => {
      if (this.roo?.state !== "here" && this.roo?.state !== "coming") roo.bubble.hidden = true;
    }, 2200);
  }

  private backToTrail(): void {
    const back = this.roo?.back;
    if (!back) return;
    const go = (): void => {
      this.x = back.x;
      this.z = back.z;
      this.yaw = back.yaw;
      this.pitch = -0.04;
      this.target = null;
      this.strayFor = 0;
      this.setZone(this.kit.zoneAt(this.x, this.z));
      this.dismissRoo("There you go! Follow the trail.");
    };
    if (reduced()) return go();
    this.host.classList.add("fading");
    setTimeout(() => {
      go();
      this.host.classList.remove("fading");
      this.focusCanvas();
    }, 260);
  }

  // Hops of about 2.4 m, each a little arc, along its path.
  private hopRoo(dt: number): void {
    const roo = this.roo!;
    const [from, to] = roo.path;
    if (roo.state === "here") {
      this.placeBubble();
      return;
    }
    const length = from.distanceTo(to);
    roo.hop += (dt * 2.4) / 0.42;
    const done = Math.min(1, roo.hop / Math.max(0.01, length));
    const p = from.clone().lerp(to, done);
    const phase = (roo.hop / 2.4) % 1;
    p.y = Math.sin(phase * Math.PI) * 0.75;
    const before = roo.sprite.position.clone();
    roo.sprite.position.copy(p);
    // the drawing faces right: flip it when it moves left on screen
    const s0 = before.project(this.camera).x;
    const s1 = p.clone().project(this.camera).x;
    const map = (roo.sprite.material as THREE.SpriteMaterial).map!;
    if (Math.abs(s1 - s0) > 1e-4) {
      const left = s1 < s0;
      map.repeat.x = left ? -1 : 1;
      map.offset.x = left ? 1 : 0;
    }
    if (done >= 1) {
      roo.sprite.position.y = 0;
      if (roo.state === "coming") {
        roo.state = "here";
        this.rooSays();
      } else {
        roo.state = "away";
        roo.sprite.visible = false;
      }
    }
    this.placeBubble();
  }

  private placeBubble(): void {
    const roo = this.roo!;
    if (roo.bubble.hidden) return;
    const head = roo.sprite.position.clone().add(new THREE.Vector3(0, 1.95, 0));
    const v = head.project(this.camera);
    const onScreen = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
    // off screen it sits at the top of the view, so it's never missed
    const w = this.host.clientWidth;
    const x = onScreen ? ((v.x + 1) / 2) * w : w / 2;
    const y = onScreen ? ((1 - v.y) / 2) * this.host.clientHeight : 0;
    this.keepInView(roo.bubble, x, y, 110);
  }

  // Put a bubble's tail at (x, y) on the view, but never let any of it fall
  // outside: near the top, the whole bubble moves down rather than being cut.
  private keepInView(el: HTMLElement, x: number, y: number, bottomReserve = 10): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const bw = el.offsetWidth;
    const bh = el.offsetHeight;
    const margin = 10;
    const left = Math.max(margin, Math.min(w - bw - margin, x - bw / 2));
    const top = Math.max(margin, Math.min(h - bh - bottomReserve, y - bh - 8));
    el.style.transform = `translate(${left}px, ${top}px)`;
    // the tail only points at the speaker when the bubble is where it should be
    el.classList.toggle("moved", Math.abs(left - (x - bw / 2)) > 1 || Math.abs(top - (y - bh - 8)) > 1);
  }

  // Shadows are drawn for about 26 m around the sun's target; in a place
  // bigger than that, the target follows you (in 8 m steps, so the shadows
  // don't shimmer as you walk).
  private followSun(): void {
    const [tx, , tz] = this.kit.sunTarget;
    const far = Math.abs(this.x - tx) > 30 || Math.abs(this.z - tz) > 30;
    const x = far ? Math.round(this.x / 8) * 8 : tx;
    const z = far ? Math.round(this.z / 8) * 8 : tz;
    const t = this.sun.target.position;
    if (t.x === x && t.z === z) return;
    const offset = this.sun.position.clone().sub(t);
    t.set(x, 0, z);
    this.sun.position.copy(t).add(offset);
  }

  // A slow device gets a lighter picture rather than a slideshow: if frames
  // run under 24 a second, first drop effects and use one pixel per CSS
  // pixel, then turn off shadows and draw at half resolution. Never raised again, so it can't
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
    if (fps >= 24) return;
    p.lowered++;
    this.picture.setQuality(false);
    if (p.lowered === 1) this.renderer.setPixelRatio(1);
    else {
      this.renderer.setPixelRatio(0.5);
      this.renderer.shadowMap.enabled = false;
      this.qualityShadows = false;
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
      // standing a moment at either end before turning back
      if (p.wait > 0) {
        p.wait -= dt;
        if (p.gait) { p.sprite.setPose("stand"); p.sprite.setMotion(0, false); }
        continue;
      }
      // back and forth along the path
      const was = p.t;
      p.t = (p.t + (p.speed * dt) / total) % 2;
      if ((was < 1 && p.t >= 1) || p.t < was) {
        p.t = was < 1 ? 1 : 0;
        p.wait = 1.5 + Math.random() * 2.5;
      }
      const u = p.t < 1 ? p.t : 2 - p.t;
      let d = u * total;
      let i = 0;
      while (i < segs - 1 && d > p.path[i].distanceTo(p.path[i + 1])) d -= p.path[i++].distanceTo(p.path[i]);
      const a = p.path[i];
      const b = p.path[i + 1];
      v.copy(a).lerp(b, Math.min(1, d / a.distanceTo(b)));
      const prev = p.sprite.position.clone();
      v.y = this.surfaceHeight(v.x, v.z);
      p.sprite.position.copy(v);
      if (p.gait) this.stride(p.sprite, p.gait, prev, v, dt);
    }
  }
}
