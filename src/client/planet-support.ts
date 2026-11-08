// The visible walking surface, rather than a universal clearance above it.
// All queries retain the planet's historical longitude/latitude coordinates.
import * as THREE from "three";
import { PLANET_RADIUS as R, planetBasis, planetNormal, type Vec3 } from "../shared/planet.js";

export interface PlanetSupport {
    height: number;
    normal: Vec3;
    kind: "ground" | "floor" | "pier" | "shower";
    id: string;
}
export interface PlanetContactAnchor {
    id: string;
    point: Vec3;
    normal: Vec3;
    rx: number;
    rz: number;
    yaw: number;
}
type Surface = {
    object: THREE.Mesh;
    id: string;
    kind: PlanetSupport["kind"];
    radius?: number;
    inverse: THREE.Matrix4;
    normal: THREE.Vector3;
    plane: number;
    bounds: THREE.Box3;
};

export function horizontalGeometryBounds(geometry: THREE.BufferGeometry, top: boolean): THREE.Box3 {
    geometry.computeBoundingBox();const bounds = geometry.boundingBox!, y = top ? bounds.max.y : bounds.min.y;
    const result = new THREE.Box3(), position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) if (Math.abs(position.getY(i) - y) < 1e-6)
        result.expandByPoint(new THREE.Vector3(position.getX(i), y, position.getZ(i)));
    return result;
}

/** Adjacent treads share a radial edge instead of leaving an angular gap
 * between a high rectangle and a lower one on a small spherical world. */
export function radialStairGeometry(start: number, depth: number, width: number, top: number, thickness: number, referenceHeight: number): THREE.BoxGeometry {
    const geometry = new THREE.BoxGeometry(width, thickness, depth), positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
        const y = top - thickness / 2 + positions.getY(i), scale = (R + y) / (R + referenceHeight);
        positions.setXYZ(i, positions.getX(i) * scale, y, (start + depth / 2 + positions.getZ(i)) * scale);
    }
    geometry.computeVertexNormals();return geometry;
}

/** Cache actual transformed floor tops once, including the enlarged cafe.
 * No per-frame raycast, coordinate remapping, admission or collision changes.
 */
export class PlanetSupportSurfaces {
    private surfaces: Surface[] = [];
    add(object: THREE.Mesh, id: string, kind: PlanetSupport["kind"] = "floor", radius?: number): void {
        this.surfaces.push({ object, id, kind, radius, inverse: new THREE.Matrix4(), normal: new THREE.Vector3(), plane: 0, bounds: horizontalGeometryBounds(object.geometry, true) });
    }
    refresh(): void {
        for (const surface of this.surfaces) {
            surface.object.updateWorldMatrix(true, false);
            surface.inverse.copy(surface.object.matrixWorld).invert();
            surface.normal.set(0, 1, 0).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(surface.object.matrixWorld)).normalize();
            const top = new THREE.Vector3(0, surface.bounds.max.y, 0).applyMatrix4(surface.object.matrixWorld);
            surface.plane = top.dot(surface.normal);
        }
    }
    at(x: number, z: number, ground: PlanetSupport): PlanetSupport {
        const radial = planetNormal(x, z), direction = new THREE.Vector3(radial.x, radial.y, radial.z);
        let result = ground;
        for (const surface of this.surfaces) {
            const facing = surface.normal.dot(direction);
            // A tangent rectangle repeats at its antipode. It is never a floor
            // on the back hemisphere (ADR032), even if the local x/z fit.
            if (facing <= 0) continue;
            const radius = surface.plane / facing, height = radius - R;
            if (!Number.isFinite(height) || height < result.height - 1e-8) continue;
            const point = direction.clone().multiplyScalar(radius).applyMatrix4(surface.inverse), b = surface.bounds;
            let edgeRadius = surface.radius;
            if (edgeRadius !== undefined && surface.object.geometry instanceof THREE.CylinderGeometry) {
                const step = Math.PI * 2 / surface.object.geometry.parameters.radialSegments;
                const angle = ((Math.atan2(point.x, point.z) % step) + step) % step - step / 2;
                edgeRadius *= Math.cos(step / 2) / Math.cos(angle);
            }
            if (edgeRadius !== undefined ? Math.hypot(point.x, point.z) > edgeRadius + 1e-7
                : point.x < b.min.x - 1e-7 || point.x > b.max.x + 1e-7 || point.z < b.min.z - 1e-7 || point.z > b.max.z + 1e-7) continue;
            result = { height, normal: { x: surface.normal.x, y: surface.normal.y, z: surface.normal.z }, kind: surface.kind, id: surface.id };
        }
        return result;
    }
}

/** Keep the player's spherical heading, but put both soles on the real plane.
 * Cameras may retain radial gravity; this frame is for supported objects.
 */
export function supportedPlanetFrame(x: number, z: number, yaw: number, normal: Vec3): THREE.Quaternion {
    const basis = planetBasis(x, z), up = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
    const forward = new THREE.Vector3(basis.south.x, basis.south.y, basis.south.z).multiplyScalar(Math.cos(yaw))
        .addScaledVector(new THREE.Vector3(basis.east.x, basis.east.y, basis.east.z), Math.sin(yaw));
    forward.addScaledVector(up, -forward.dot(up));
    if (forward.lengthSq() < 1e-10) forward.set(basis.east.x, basis.east.y, basis.east.z).addScaledVector(up, -new THREE.Vector3(basis.east.x, basis.east.y, basis.east.z).dot(up));
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
}

/** A real closed skirt, from an existing flat floor's underside to the globe.
 * Its lower ring is buried 2cm in the ground; no shadow or transparent decal
 * is used to conceal the otherwise metre-high gap below a wide terrace.
 */
export function curvedFoundationGeometry(object: THREE.Mesh, outline: readonly { x: number; z: number }[], bottomY: number): THREE.BufferGeometry {
    object.updateWorldMatrix(true, false);
    const inverse = object.matrixWorld.clone().invert(), normal = new THREE.Vector3(0, 1, 0)
        .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(object.matrixWorld)).normalize();
    const points: number[] = [], indices: number[] = [];
    for (const p of outline) {
        const top = new THREE.Vector3(p.x, bottomY, p.z), world = top.clone().applyMatrix4(object.matrixWorld);
        const dot = world.dot(normal), discriminant = dot * dot - world.lengthSq() + (R - .02) ** 2;
        const distance = discriminant > 0 ? dot - Math.sqrt(discriminant) : 0;
        const base = (object.userData.radialFoundation ? world.clone().normalize().multiplyScalar(R - .02)
            : world.clone().addScaledVector(normal, -Math.max(.01, distance))).applyMatrix4(inverse);
        points.push(top.x, top.y, top.z, base.x, base.y, base.z);
    }
    for (let i = 0; i < outline.length; i++) {
        const a = i * 2, b = ((i + 1) % outline.length) * 2;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    geometry.userData.groundFoundation = true;
    return geometry;
}
