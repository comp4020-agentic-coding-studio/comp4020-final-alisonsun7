// Original procedural contact shade. It supplements the shared sun after the
// actual feet/foundations have been grounded; it never hides a missing support.
// Two instanced draws, no screen-space pass or downloaded texture.
import * as THREE from "three";
import { PLANET_RADIUS, planetCoordsValid, planetPoint, type Vec3 } from "../shared/planet.js";
import { supportedPlanetFrame, type PlanetSupport, type PlanetContactAnchor } from "./planet-support.js";
export interface PlanetActorContact {
    x: number;
    z: number;
    yaw: number;
    air: number;
    companion?: boolean;
}
const MAX_ACTORS = 32;

/** A hop loses contact shade rather than carrying a black disk through air. */
export function contactStrength(air: number): number {
    if (!Number.isFinite(air)) return 0;
    return Math.exp(-Math.max(0, air) * 4.5);
}

export class PlanetContactShadows {
    readonly root = new THREE.Group();
    private readonly texture: THREE.CanvasTexture;
    private readonly material: THREE.MeshBasicMaterial;
    private readonly geometry = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    private readonly fixed: THREE.InstancedMesh;
    private readonly actors: THREE.InstancedMesh;
    private readonly dummy = new THREE.Object3D();
    private readonly strengths = new Float32Array(MAX_ACTORS);
    private readonly actorGeometry: THREE.BufferGeometry;
    private disposed = false;

    constructor(anchors: readonly PlanetContactAnchor[], trees: THREE.InstancedMesh | undefined,
        private supportAt: (x: number, z: number) => PlanetSupport) {
        this.root.name = "planet-contact-shade";
        const canvas = document.createElement("canvas");canvas.width = canvas.height = 64;
        const context = canvas.getContext("2d")!;
        const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
        gradient.addColorStop(0, "rgba(255,255,255,0.8)");
        gradient.addColorStop(.22, "rgba(255,255,255,0.59)");
        gradient.addColorStop(.55, "rgba(255,255,255,0.18)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = gradient;context.fillRect(0, 0, 64, 64);
        this.texture = new THREE.CanvasTexture(canvas);
        this.material = new THREE.MeshBasicMaterial({ color: 0x35483a, map: this.texture,
            transparent: true, opacity: .43, depthWrite: false, polygonOffset: true,
            polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
        // Pinned Three r170 stock basic shader, with one per-instance alpha.
        // The actual browser check compiles this path; no private renderer API.
        this.material.onBeforeCompile = shader => {
            shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float contactWeight;\nvarying float vContactWeight;")
                .replace("#include <begin_vertex>", "#include <begin_vertex>\nvContactWeight = contactWeight;");
            shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vContactWeight;")
                .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vContactWeight;");
        };
        this.material.customProgramCacheKey = () => "little-chorus-contact-weight-r170";
        this.geometry.setAttribute("contactWeight", new THREE.InstancedBufferAttribute(new Float32Array(anchors.length + (trees?.count ?? 0)).fill(1), 1));
        this.fixed = new THREE.InstancedMesh(this.geometry, this.material, anchors.length + (trees?.count ?? 0));
        this.fixed.name = "furniture-and-tree-contact-shade";
        let count = 0;
        for (const anchor of anchors) {
            this.place(this.fixed, count++, anchor.point, anchor.normal, anchor.rx, anchor.rz, anchor.yaw);
        }
        if (trees) {
            const matrix = new THREE.Matrix4(), foot = new THREE.Vector3();
            trees.updateWorldMatrix(true, false);
            for (let i = 0; i < trees.count; i++) {
                trees.getMatrixAt(i, matrix);
                foot.set(0, -1, 0).applyMatrix4(matrix).applyMatrix4(trees.matrixWorld).normalize();
                const x = Math.atan2(foot.x, foot.z) * PLANET_RADIUS, z = -Math.asin(THREE.MathUtils.clamp(foot.y, -1, 1)) * PLANET_RADIUS;
                const support = supportAt(x, z), p = planetPoint(x, z, support.height);
                this.place(this.fixed, count++, p, support.normal, .52, .52, 0);
            }
        }
        this.fixed.count = count;this.fixed.instanceMatrix.needsUpdate = true;
        this.actorGeometry = this.geometry.clone();
        this.actorGeometry.setAttribute("contactWeight", new THREE.InstancedBufferAttribute(this.strengths, 1).setUsage(THREE.DynamicDrawUsage));
        this.actors = new THREE.InstancedMesh(this.actorGeometry, this.material, MAX_ACTORS);
        this.actors.name = "moving-feet-contact-shade";this.actors.count = 0;
        this.actors.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        for (const object of [this.fixed, this.actors]) { object.frustumCulled = false;object.renderOrder = 1;this.root.add(object); }
    }

    private place(mesh: THREE.InstancedMesh, index: number, point: Vec3, normal: Vec3, rx: number, rz: number, yaw: number): void {
        this.dummy.position.set(point.x, point.y, point.z).addScaledVector(new THREE.Vector3(normal.x, normal.y, normal.z), .006);
        // The shadow frame shares the real support normal. Its yaw only
        // stretches an oval; it never changes the actor's public position.
        const radial = new THREE.Vector3(point.x, point.y, point.z).normalize();
        const x = Math.atan2(radial.x, radial.z) * PLANET_RADIUS, z = -Math.asin(THREE.MathUtils.clamp(radial.y, -1, 1)) * PLANET_RADIUS;
        this.dummy.quaternion.copy(supportedPlanetFrame(x, z, yaw, normal));
        this.dummy.scale.set(rx, 1, rz);this.dummy.updateMatrix();mesh.setMatrixAt(index, this.dummy.matrix);
    }

    update(contacts: readonly PlanetActorContact[], day: number): void {
        if (this.disposed) return;
        let count = 0;
        for (const at of contacts) {
            if(count >= MAX_ACTORS)break;
            if(!planetCoordsValid(at.x,at.z)||!Number.isFinite(at.yaw)||!Number.isFinite(at.air))continue;
            const support = this.supportAt(at.x, at.z);
            if(!Number.isFinite(support.height)||![support.normal.x,support.normal.y,support.normal.z].every(Number.isFinite))continue;
            const i=count++, p = planetPoint(at.x, at.z, support.height);
            const spread = 1 + Math.min(1, Math.max(0, at.air)) * .25;
            this.place(this.actors, i, p, support.normal, (at.companion ? .37 : .32) * spread, (at.companion ? .45 : .26) * spread, at.yaw);
            this.strengths[i] = contactStrength(at.air);
        }
        this.actors.count=count;
        this.actors.instanceMatrix.needsUpdate = true;this.actorGeometry.getAttribute("contactWeight").needsUpdate = true;
        this.material.opacity = THREE.MathUtils.lerp(.25, .43, Number.isFinite(day)?THREE.MathUtils.clamp(day, 0, 1):0);
    }

    get state(): { fixed: number; actors: number; draws: number; disposed: boolean } {
        return { fixed: this.fixed.count, actors: this.actors.count, draws: Number(this.fixed.count > 0) + Number(this.actors.count > 0), disposed: this.disposed };
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;this.root.removeFromParent();this.root.clear();this.fixed.count=0;this.actors.count=0;
        this.fixed.dispose();this.actors.dispose();this.geometry.dispose();this.actorGeometry.dispose();this.material.dispose();this.texture.dispose();
    }
}
