// A painted planet keeps one shared-time key direction. Only its shadow
// coverage and soft sky fill follow the visitor's part of the sphere.
import * as THREE from "three";
import { PLANET_RADIUS, planetCoordsValid, planetNormal, planetPoint } from "../../src/shared/planet.js";
import type { Weather } from "../../src/shared/environment.js";

export interface PlanetLightingInput {
    x: number;
    z: number;
    groundHeight?: number;
    minute: number;
    weather: Weather;
    zoom: number;
}
export interface PlanetLightingState {
    day: number;
    globalDirection: { x: number; y: number; z: number };
    localUp: { x: number; y: number; z: number };
    focus: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    span: number;
    texelMetres: number;
    near: number;
    far: number;
    bias: number;
    normalBias: number;
    sunIntensity: number;
    hemiIntensity: number;
    sunColor: string;
    skyColor: string;
    groundColor: string;
}

const MAP_SIZE = 2048;
const LIGHT_DISTANCE = 60;
const CASTING_REACH = PLANET_RADIUS * 2 + 8;
const wrappedMinute = (minute: number): number => ((minute % 1440) + 1440) % 1440;
const daylight = (minute: number): number => Math.max(0, Math.sin((minute - 360) / 1440 * Math.PI * 2));

/** Preserve the old world's shared-time direction, including across seams.
 * Translating a directional light without translating its target would turn
 * it toward each visitor and give friends conflicting key/shadow directions.
 */
export function planetGlobalLightDirection(minute: number, out = new THREE.Vector3()): THREE.Vector3 {
    const time = wrappedMinute(Number.isFinite(minute) ? minute : 840), day = daylight(time);
    return out.set(Math.cos(time / 1440 * Math.PI * 2) * 45, 45, 20 + day * 45).normalize();
}

export class PlanetLighting {
    readonly sun = new THREE.DirectionalLight();
    readonly hemi = new THREE.HemisphereLight();
    readonly target = this.sun.target;
    private readonly direction = new THREE.Vector3();
    private readonly up = new THREE.Vector3();
    private readonly focus = new THREE.Vector3();
    private readonly right = new THREE.Vector3();
    private readonly screenUp = new THREE.Vector3();
    private readonly worldUp = new THREE.Vector3(0, 1, 0);
    private readonly moon = new THREE.Color(0xb5c9dd);
    private readonly afternoon = new THREE.Color(0xffe8c9);
    private readonly lowSun = new THREE.Color(0xffc493);
    private readonly daySky = new THREE.Color(0xdce6df);
    private readonly nightSky = new THREE.Color(0xa5bbce);
    private readonly dayGround = new THREE.Color(0x9ba995);
    private readonly nightGround = new THREE.Color(0x68717d);
    private readonly keyColor = new THREE.Color();
    private day = 0;
    private span = 22;
    private disposed = false;

    constructor() {
        this.sun.name = "planet-shared-key";
        this.hemi.name = "planet-local-sky-fill";
        this.target.name = "planet-shadow-focus";
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(MAP_SIZE, MAP_SIZE);
        // r170 PCFSoftShadowMap is selected on the existing renderer. Its
        // fixed filter does not use shadow.radius; no extra blur pass is added.
        this.sun.shadow.bias = -.00004;
        this.sun.shadow.normalBias = .006;
        const camera = this.sun.shadow.camera;
        camera.near = LIGHT_DISTANCE - CASTING_REACH;
        camera.far = LIGHT_DISTANCE + CASTING_REACH;
        this.update({ x: 1.8, z: 2.2, groundHeight: 0, minute: 840, weather: "clear", zoom: 8 });
    }

    update(input: PlanetLightingInput): void {
        if (this.disposed || !planetCoordsValid(input.x, input.z) || !Number.isFinite(input.minute)
            || !Number.isFinite(input.zoom) || !Number.isFinite(input.groundHeight ?? 0)) return;
        const minute = wrappedMinute(input.minute);
        this.day = daylight(minute);
        planetGlobalLightDirection(minute, this.direction);
        const normal = planetNormal(input.x, input.z);
        this.up.set(normal.x, normal.y, normal.z);

        // A local toy-sky follows the surface normal, so the far side and
        // southern shore receive a legible sky fill rather than a green floor.
        // Its palette/intensity still use the same authoritative world time.
        this.hemi.position.copy(this.up);
        this.hemi.color.copy(this.nightSky).lerp(this.daySky, this.day);
        this.hemi.groundColor.copy(this.nightGround).lerp(this.dayGround, this.day);
        this.hemi.intensity = .9 + this.day * 1.1;
        const warmth = 1 - THREE.MathUtils.smoothstep(this.day, .1, .75);
        this.keyColor.copy(this.afternoon).lerp(this.lowSun, warmth);
        this.sun.color.copy(this.moon).lerp(this.keyColor, THREE.MathUtils.smoothstep(this.day, 0, .15));
        this.sun.intensity = .18 + this.day * 2.8;
        if (input.weather === "cloudy" || input.weather === "rain") {
            this.sun.intensity *= .5;
            this.hemi.intensity *= .9;
        } else if (input.weather === "mist") this.sun.intensity *= .7;

        // Close play has ~1.07 cm shadow texels instead of the former 3.42 cm.
        // Overview expands and recentres on the globe; it does not crop the
        // other hemisphere into the close-play shadow box.
        const overview = THREE.MathUtils.smoothstep(input.zoom, 12, 24);
        this.span = THREE.MathUtils.lerp(22, 64, overview);
        const centre = planetPoint(input.x, input.z, (input.groundHeight ?? 0) + 1.5);
        this.focus.set(centre.x, centre.y, centre.z).multiplyScalar(1 - overview);
        const camera = this.sun.shadow.camera, half = this.span / 2;
        camera.left = camera.bottom = -half;
        camera.right = camera.top = half;
        // r170 only refreshes this automatically when allocating a map.
        // A live zoom/frustum change must update the projection explicitly.
        camera.updateProjectionMatrix();

        // Snap translation in light space. Sub-texel walking should not slide
        // the entire shadow grid over otherwise stationary furniture.
        this.right.crossVectors(this.worldUp, this.direction).normalize();
        this.screenUp.crossVectors(this.direction, this.right).normalize();
        const texel = this.span / MAP_SIZE;
        const right = this.focus.dot(this.right), up = this.focus.dot(this.screenUp);
        this.target.position.copy(this.focus)
            .addScaledVector(this.right, Math.round(right / texel) * texel - right)
            .addScaledVector(this.screenUp, Math.round(up / texel) * texel - up);
        this.sun.position.copy(this.target.position).addScaledVector(this.direction, LIGHT_DISTANCE);
        this.target.updateMatrixWorld();
        this.sun.updateMatrixWorld();
        this.hemi.updateMatrixWorld();
        this.sun.shadow.updateMatrices(this.sun);
    }

    get state(): PlanetLightingState {
        const point = (value: THREE.Vector3): {x:number;y:number;z:number} => ({ x: value.x, y: value.y, z: value.z });
        const camera = this.sun.shadow.camera;
        return { day: this.day, globalDirection: point(this.direction), localUp: point(this.up), focus: point(this.focus), target: point(this.target.position),
            span: this.span, texelMetres: this.span / MAP_SIZE, near: camera.near, far: camera.far, bias: this.sun.shadow.bias, normalBias: this.sun.shadow.normalBias,
            sunIntensity: this.sun.intensity, hemiIntensity: this.hemi.intensity,
            sunColor: this.sun.color.getHexString(), skyColor: this.hemi.color.getHexString(), groundColor: this.hemi.groundColor.getHexString() };
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.sun.removeFromParent();this.hemi.removeFromParent();this.target.removeFromParent();
        this.sun.dispose();
    }
}
