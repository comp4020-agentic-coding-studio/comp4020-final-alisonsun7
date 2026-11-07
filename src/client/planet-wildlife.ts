// An original volumetric companion: no downloaded character, flat sprite or
// hidden sound bed. The visitor explicitly invites it to follow or play.
import * as THREE from "three";
import { planetDistance } from "../shared/planet.js";
import type { Position } from "../shared/protocol.js";
import { bearingToward, moveOnPlanet } from "./planet-locomotion.js";

export type KangarooPhase = "resting" | "following" | "playing";
export class KangarooCompanion {
    readonly id = "green-kangaroo";
    readonly figure = new THREE.Group();
    at: Position = { x: -2.3, z: 1, yaw: .8 };
    phase: KangarooPhase = "resting";
    height = 0;
    private elapsed = 0;
    private playUntil = 0;
    private hasPlayed = false;
    private hopStarted = -10;
    private visitorWasAirborne = false;
    private body = new THREE.Group();
    private ears = new THREE.Group();
    private paws: THREE.Group[] = [];
    private geometries = new Set<THREE.BufferGeometry>();
    private materials = new Set<THREE.Material>();
    constructor() {
        this.figure.name = "interactive-kangaroo";
        this.figure.userData.companion = this.id;
        const material = (colour: number): THREE.MeshStandardMaterial => {
            const m = new THREE.MeshStandardMaterial({ color: colour, roughness: .96, metalness: 0 });
            this.materials.add(m); return m;
        };
        const fur = material(0xad8059), cream = material(0xe2c9a3), pink = material(0xbd8d7c), ink = material(0x35453d), scarf = material(0xc8ab62);
        const ellipsoid = (parent: THREE.Object3D, name: string, size: [number, number, number], at: [number, number, number], m: THREE.Material): THREE.Mesh => {
            const g = new THREE.SphereGeometry(1, 12, 10); this.geometries.add(g);
            const mesh = new THREE.Mesh(g, m); mesh.name = name; mesh.scale.set(...size); mesh.position.set(...at);
            mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
        };
        this.figure.add(this.body);
        ellipsoid(this.body, "kangaroo-body", [.29, .5, .27], [0, .72, 0], fur);
        ellipsoid(this.body, "kangaroo-belly", [.22, .32, .12], [0, .69, .18], cream);
        // Thick tapered tail is essential to the kangaroo silhouette.
        const tailGeo = new THREE.ConeGeometry(.18, .95, 10); this.geometries.add(tailGeo);
        const tail = new THREE.Mesh(tailGeo, fur); tail.name = "kangaroo-tail";
        tail.position.set(0, .31, -.57); tail.rotation.x = -Math.PI * .64; tail.castShadow = true; this.body.add(tail);
        ellipsoid(this.body, "kangaroo-head", [.25, .27, .23], [0, 1.26, .08], fur);
        ellipsoid(this.body, "kangaroo-muzzle", [.2, .13, .2], [0, 1.17, .26], cream);
        ellipsoid(this.body, "kangaroo-nose", [.065, .045, .04], [0, 1.22, .43], ink);
        for (const sign of [-1, 1]) {
            ellipsoid(this.body, "kangaroo-eye", [.027, .038, .02], [sign * .14, 1.32, .263], ink);
            const arm = ellipsoid(this.body, "kangaroo-arm", [.075, .25, .08], [sign * .25, .75, .2], fur);
            arm.rotation.x = -.35; arm.rotation.z = sign * .2;
            ellipsoid(this.body, "kangaroo-thigh", [.19, .27, .2], [sign * .24, .33, -.02], fur);
            const paw = new THREE.Group(); paw.position.set(sign * .2, .07, .14); this.figure.add(paw); this.paws.push(paw);
            ellipsoid(paw, "kangaroo-hind-paw", [.14, .07, .32], [0, 0, .03], fur);
        }
        this.ears.position.set(0, 1.48, .06); this.body.add(this.ears);
        for (const sign of [-1, 1]) {
            const ear = new THREE.Group(); ear.position.x = sign * .14; ear.rotation.z = -sign * .16; this.ears.add(ear);
            ellipsoid(ear, "kangaroo-ear", [.072, .28, .065], [0, .2, 0], fur);
            ellipsoid(ear, "kangaroo-inner-ear", [.037, .2, .018], [0, .22, .057], pink);
        }
        ellipsoid(this.body, "kangaroo-neckerchief", [.27, .06, .24], [0, 1.03, .055], scarf);
        this.figure.userData.kind = "kangaroo companion";
    }
    get action(): string {
        return this.phase === "resting" ? "Invite kangaroo along" : this.phase === "following" && !this.hasPlayed ? "Hop together" : "Let kangaroo rest";
    }
    interact(visitor: Position): string | null {
        if (planetDistance(this.at, visitor) > 3.2) return null;
        if (this.phase === "resting") {
            this.phase = "following";
            this.hasPlayed = false;
            this.hopStarted = this.elapsed;
            return "Kangaroo is coming along. Try a jump together, or lead the way to a sound.";
        }
        if (this.phase === "following" && !this.hasPlayed) {
            this.hasPlayed = true;
            this.phase = "playing"; this.playUntil = this.elapsed + 2.5; this.hopStarted = this.elapsed;
            return "A little hopping game! Jump alongside Kangaroo.";
        }
        this.phase = "resting"; this.hopStarted = this.elapsed;
        return "Kangaroo settles here for a rest. You can invite it along again.";
    }
    frame(dt: number, visitor: Position, visitorHeight: number, canStand: (x: number, z: number) => boolean, reduced: boolean): void {
        this.elapsed += Math.max(0, Math.min(.1, dt));
        if (this.phase === "playing" && this.elapsed >= this.playUntil) this.phase = "following";
        const distance = planetDistance(this.at, visitor), airborne = visitorHeight > .1;
        let moving = false;
        if (this.phase === "following" && distance > 2.1 && distance < 35) {
            const from = { ...this.at, yaw: bearingToward(this.at, visitor) };
            const move = moveOnPlanet(from, 1, 0, Math.min(distance - 2.1, dt * 3.8), canStand);
            this.at = move.position; moving = move.distance > .001;
            if (moving && this.elapsed - this.hopStarted > .58) this.hopStarted = this.elapsed;
        }
        if (this.phase !== "resting" && distance < 7 && airborne && !this.visitorWasAirborne) this.hopStarted = this.elapsed;
        if (this.phase === "playing" && this.elapsed - this.hopStarted > .65) this.hopStarted = this.elapsed;
        this.visitorWasAirborne = airborne;
        const hopAge = this.elapsed - this.hopStarted;
        this.height = hopAge >= 0 && hopAge < .58 ? Math.sin(hopAge / .58 * Math.PI) * (this.phase === "playing" ? .7 : .42) : 0;
        this.body.rotation.x = reduced ? 0 : moving ? -.13 : Math.sin(this.elapsed * 1.2) * .012;
        this.ears.rotation.z = reduced ? 0 : Math.sin(this.elapsed * 1.6) * .035;
        for (const paw of this.paws) paw.rotation.x = reduced ? 0 : -this.height * .3;
    }
    dispose(): void {
        this.figure.removeFromParent();
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of this.materials) material.dispose();
    }
}
