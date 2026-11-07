// Original low-cost, volumetric Soundfolk architecture. No downloaded models.
import * as THREE from "three";
import { PLANET_RADIUS as R, PLANET_PLACES, PLANET_HUTS, planetBasis, planetPoint, planetDistance, planetLocal, type PlanetPlace } from "../shared/planet.js";
export interface PlanetDoor {
    id: string;
    group: THREE.Group;
    leaf: THREE.Mesh;
    signal: THREE.Mesh;
    open: number;
}
export interface PlanetBuild {
    root: THREE.Group;
    solids: THREE.Object3D[];
    doors: PlanetDoor[];
    lamps: THREE.PointLight[];
    lanterns: {
        mesh: THREE.Mesh;
        x: number;
        z: number;
    }[];
    blossoms: {
        mesh: THREE.InstancedMesh;
        x: number;
        z: number;
    }[];
    heightAt(x: number, z: number): number;
    inside(x: number, z: number): boolean;
    canStand(x: number, z: number, locked: ReadonlySet<string>, ownHut?: string): boolean;
    dispose(): void;
}
export function surfaceFrame(x: number, z: number): THREE.Quaternion {
    const b = planetBasis(x, z), v = (p: {
        x: number;
        y: number;
        z: number;
    }): THREE.Vector3 => new THREE.Vector3(p.x, p.y, p.z);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(b.east), v(b.up), v(b.south)));
}
export function onPlanet(object: THREE.Object3D, x: number, z: number, height = 0, yaw = 0): void {
    const p = planetPoint(x, z, height);
    object.position.set(p.x, p.y, p.z);
    object.quaternion.copy(surfaceFrame(x, z)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
}
export function buildPlanet(): PlanetBuild {
    const root = new THREE.Group(), solids: THREE.Object3D[] = [], doors: PlanetDoor[] = [], lamps: THREE.PointLight[] = [];
    const lanterns: PlanetBuild["lanterns"] = [], blossoms: PlanetBuild["blossoms"] = [];
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    const mat = (colour: number, emissive = 0): THREE.MeshStandardMaterial => {
        const m = new THREE.MeshStandardMaterial({ color: colour, roughness: .93, metalness: 0, emissive, emissiveIntensity: .35 });
        materials.add(m);
        return m;
    };
    const sage = mat(0x668879), cream = mat(0xf0e5ce), timber = mat(0xb68c53), terra = mat(0xb8795d), dark = mat(0x40564e), leaves = mat(0x698d6a);
    const sea = mat(0x67aaa8), stone = mat(0xd1c8a5), gold = mat(0xdfb46c), paper = mat(0xdce2c2);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = root): THREE.Mesh => {
        geometries.add(g);
        const o = new THREE.Mesh(g, m);
        o.castShadow = true;
        o.receiveShadow = true;
        parent.add(o);
        return o;
    };
    const box = (w: number, h: number, d: number, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh => { const o = mesh(new THREE.BoxGeometry(w, h, d), m, parent); o.position.set(x, y, z); return o; };
    const ball = (size: number, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh => { const o = mesh(new THREE.SphereGeometry(size, 12, 8), m, parent); o.position.set(x, y, z); return o; };
    const place = (x: number, z: number): THREE.Group => { const g = new THREE.Group(); onPlanet(g, x, z); root.add(g); return g; };
    const globe = new THREE.SphereGeometry(R, 112, 64);
    geometries.add(globe);
    const pos = globe.getAttribute("position"), colours = [];
    for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
        const grain = Math.sin(v.x * 19 + v.z * 8) * Math.sin(v.y * 17 - v.x * 11) * .025;
        const c = new THREE.Color().setRGB(.45 + grain, .57 + grain, .36 + grain);
        colours.push(c.r, c.g, c.b);
    }
    globe.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    const earthMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    materials.add(earthMat);
    mesh(globe, earthMat);
    // Curved patches follow the real sphere, rather than floating flat discs.
    function patch(x: number, z: number, r: number, m: THREE.Material): void {
        const segments = 48, rings = Math.ceil(r / .35), q = surfaceFrame(x, z), base = planetPoint(x, z), vertices: number[] = [], indices: number[] = [];
        const vertex = (xx: number, zz: number): void => { const v = new THREE.Vector3(xx, 0, zz).applyQuaternion(q).add(new THREE.Vector3(base.x, base.y, base.z)).normalize().multiplyScalar(R + .035); vertices.push(v.x, v.y, v.z); };
        vertex(0, 0);
        for (let ring = 1; ring <= rings; ring++)
            for (let i = 0; i < segments; i++)
                vertex(Math.cos(i / segments * Math.PI * 2) * r * ring / rings, -Math.sin(i / segments * Math.PI * 2) * r * ring / rings);
        for (let i = 0; i < segments; i++)
            indices.push(0, 1 + i, 1 + (i + 1) % segments);
        for (let ring = 1; ring < rings; ring++)
            for (let i = 0; i < segments; i++) {
                const a = 1 + (ring - 1) * segments + i, b = 1 + ring * segments + i, c = 1 + ring * segments + (i + 1) % segments, d = 1 + (ring - 1) * segments + (i + 1) % segments;
                indices.push(a, b, c, a, c, d);
            }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        geo.setIndex(indices);
        geo.userData.surfacePatch = true;
        geo.computeVertexNormals();
        const o = mesh(geo, m);
        o.castShadow = false;
    }
    patch(0, 0, 5.6, stone);
    for (const p of PLANET_PLACES)
        if (p.kind !== "pool" && p.kind !== "restrooms")
            patch(p.x, p.z, 3.5, paper);
    // A winding, continuous great-circle promenade is a visible meeting route.
    for (let i = 0; i < 96; i++) {
        const x = -Math.PI * R + i * Math.PI * 2 * R / 96, z = 1.2 * Math.sin(i / 96 * Math.PI * 4);
        patch(x, z, .86, stone);
    }
    function sign(parent: THREE.Object3D, text: string, y = 3.8): void {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 96;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#f2e8d2";
        ctx.fillRect(0, 0, 512, 96);
        ctx.fillStyle = "#34564c";
        ctx.font = "600 37px Georgia";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 256, 48, 490);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side: THREE.DoubleSide });
        materials.add(m);
        const o = box(3.5, .66, .08, m, parent, 0, y, 2.04);
        o.userData.signTexture = texture;
    }
    function lamp(parent: THREE.Object3D, x: number, z: number): void {
        box(.09, 2.65, .09, dark, parent, x, 1.32, z);
        const glow = mat(0xf6d694, 0xffc375);
        ball(.18, glow, parent, x, 2.66, z);
        const light = new THREE.PointLight(0xffd2a0, 0, 8, 2);
        light.position.set(x, 2.5, z);
        parent.add(light);
        lamps.push(light);
    }
    function bench(parent: THREE.Object3D, x: number, z: number): void {
        box(1.9, .13, .6, timber, parent, x, .48, z);
        box(1.9, .57, .08, sage, parent, x, .85, z - .28);
        for (const dx of [-.7, .7])
            box(.1, .44, .44, dark, parent, x + dx, .22, z);
    }
    function house(p: PlanetPlace, colour: THREE.Material, open = false): THREE.Group {
        const g = place(p.x, p.z);
        box(5, .18, 4.4, timber, g, 0, .06, 0);
        for (const x of [-2.4, 2.4])
            solids.push(box(.18, 2.8, 4.1, colour, g, x, 1.5, 0));
        solids.push(box(4.9, 2.8, .17, colour, g, 0, 1.5, -2));
        if (!open)
            for (const x of [-1.65, 1.65])
                solids.push(box(1.55, 2.8, .17, colour, g, x, 1.5, 2));
        const roof = mesh(new THREE.ConeGeometry(3.7, 1.35, 4), terra, g);
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 3.65;
        roof.scale.z = .88;
        solids.push(roof);
        sign(g, p.title, 2.95);
        lamp(g, -1.7, -.6);
        lamp(g, 1.7, -.6);
        return g;
    }
    for (const p of PLANET_PLACES) {
        if (p.kind === "green") {
            const g = place(p.x, p.z);
            for (let i = 0; i < 4; i++) {
                const a = i * Math.PI / 2, b = new THREE.Group();
                b.rotation.y = a;
                b.position.set(Math.sin(a) * 3.7, 0, Math.cos(a) * 3.7);
                g.add(b);
                bench(b, 0, 0);
            }
            const fountain = mesh(new THREE.CylinderGeometry(.75, 1, .45, 20), stone, g);
            fountain.position.y = .25;
            const rings = mesh(new THREE.TorusGeometry(.9, .055, 6, 48), gold, g);
            rings.rotation.x = Math.PI / 2;
            rings.position.y = .5;
            lamp(g, -4, -3);
            lamp(g, 4, 3);
        }
        else if (p.kind === "tea") {
            const g = house(p, sage);
            for (const x of [-1.25, 1.25]) {
                const top = mesh(new THREE.CylinderGeometry(.65, .65, .12, 20), timber, g);
                top.position.set(x, .92, .1);
                box(.12, .9, .12, dark, g, x, .45, .1);
                bench(g, x, -.7);
                ball(.11, cream, g, x, .99, .1);
            }
            box(4, .9, .7, cream, g, 0, .55, -1.35);
        }
        else if (p.kind === "reading") {
            const g = house(p, cream, true);
            for (let j = 0; j < 3; j++) {
                box(3.8, .09, .4, timber, g, 0, .6 + j * .58, -1.65);
                for (let i = 0; i < 12; i++)
                    box(.18, .36, .27, [sage, terra, gold, sea][(i + j) % 4], g, -1.65 + i * .29, .83 + j * .58, -1.65);
            }
            bench(g, 0, .6);
        }
        else if (p.kind === "stage") {
            const g = place(p.x, p.z);
            const plinth = mesh(new THREE.CylinderGeometry(3.1, 3.25, .22, 32), timber, g);
            plinth.position.y = .12;
            for (const x of [-2.5, 2.5]) {
                box(.12, 3.2, .12, sage, g, x, 1.6, -1.8);
                lamp(g, x, 1.8);
            }
            box(5.2, .15, .3, gold, g, 0, 3.2, -1.8);
            sign(g, "Pocket jam", 3.7);
            const drum = mesh(new THREE.CylinderGeometry(.43, .35, .65, 16), terra, g);
            drum.position.set(-1, .55, -1);
            ball(.25, gold, g, 1, 1, -1);
        }
        else if (p.kind === "conservatory") {
            const g = place(p.x, p.z);
            for (const x of [-2.5, 0, 2.5]) {
                const arch = mesh(new THREE.TorusGeometry(2.7, .075, 6, 32, Math.PI), sage, g);
                arch.rotation.y = Math.PI / 2;
                arch.position.set(x, .15, 0);
            }
            for (const z of [-2.6, 2.6])
                box(5.3, .1, .1, sage, g, 0, .2, z);
            const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.15, 0), gold, 40);
            geometries.add(flowers.geometry);
            g.add(flowers);
            const dummy = new THREE.Object3D();
            for (let i = 0; i < 40; i++) {
                const a = i * 2.4, rr = 1 + ((i * 7) % 11) / 8;
                dummy.position.set(Math.sin(a) * rr, .3 + ((i * 3) % 5) * .08, Math.cos(a) * rr);
                dummy.updateMatrix();
                flowers.setMatrixAt(i, dummy.matrix);
            }
            blossoms.push({ mesh: flowers, x: p.x, z: p.z });
            sign(g, "Rain conservatory", 3.3);
            lamp(g, 2.5, 0);
        }
        else if (p.kind === "pool") {
            patch(p.x, p.z, 3, sea);
            const g = place(p.x, p.z);
            for (let i = 0; i < 10; i++) {
                const a = i * Math.PI / 5, rock = ball(.45 + (i % 3) * .13, stone, g, Math.sin(a) * 3.1, .15, Math.cos(a) * 3.1);
                rock.scale.y = .65;
            }
            bench(g, 0, 4);
            lamp(g, -3.5, 2);
        }
        else if (p.kind === "workshop") {
            const g = house(p, terra, true);
            box(3.7, .13, 1, timber, g, 0, 1, -1);
            for (let i = 0; i < 6; i++) {
                const x = -1.85 + i * .74;
                box(.025, 1.3, .025, dark, g, x, 2.7, .25);
                const m = mat(0xe6c577, 0xb87234);
                const l = ball(.22, m, g, x, 2.08, .25);
                l.scale.y = 1.3;
                lanterns.push({ mesh: l, x: p.x, z: p.z });
            }
        }
        else if (p.kind === "observatory") {
            const g = place(p.x, p.z);
            const base = mesh(new THREE.CylinderGeometry(2.4, 2.6, .25, 24), stone, g);
            base.position.y = .13;
            const dome = mesh(new THREE.SphereGeometry(2.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), sage, g);
            dome.position.y = .18;
            dome.rotation.z = .12;
            const tube = mesh(new THREE.CylinderGeometry(.2, .25, 1.8, 12), cream, g);
            tube.position.set(0, 2.1, 1.4);
            tube.rotation.x = .7;
            lamp(g, -2.7, 0);
        }
    }
    for (const h of PLANET_HUTS) {
        const cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2, g = place(cx, cz), colour = h.kind.endsWith("toilet") ? cream : sea;
        box(3.1, .15, 3.1, timber, g, 0, .04, 0);
        for (const x of [-1.5, 1.5])
            solids.push(box(.13, 2.8, 3.1, colour, g, x, 1.4, 0));
        solids.push(box(3.1, 2.8, .13, colour, g, 0, 1.4, -1.5));
        for (const x of [-1.05, 1.05])
            solids.push(box(.95, 2.8, .13, colour, g, x, 1.4, 1.5));
        solids.push(box(3.4, .25, 3.4, terra, g, 0, 2.95, 0));
        const hinge = new THREE.Group();
        hinge.position.set(-.5, 0, 1.51);
        g.add(hinge);
        const leaf = box(1, 2.55, .10, sage, hinge, .5, 1.3, 0);
        solids.push(leaf);
        const signal = ball(.09, mat(0x74be92, 0x48ad79), g, .83, 1.7, 1.65);
        doors.push({ id: h.id, group: hinge, leaf, signal, open: 0 });
        const fixture = mesh(new THREE.CylinderGeometry(.3, .23, .48, 16), cream, g);
        fixture.position.set(0, .29, -.8);
        lamp(g, 1, -.4);
        sign(g, h.kind.endsWith("toilet") ? "Restroom" : "Shower", 3.5);
    }
    // Instanced trees across the whole sphere, leaving meeting areas legible.
    const trunkGeo = new THREE.CylinderGeometry(.08, .14, 1.55, 7), crownGeo = new THREE.IcosahedronGeometry(.85, 1);
    geometries.add(trunkGeo);
    geometries.add(crownGeo);
    const trunks = new THREE.InstancedMesh(trunkGeo, timber, 130), crowns = new THREE.InstancedMesh(crownGeo, leaves, 390);
    let ti = 0, ci = 0;
    const d = new THREE.Object3D();
    for (let i = 0; i < 280; i++) {
        const y = 1 - 2 * (i + .5) / 280, lon = i * 2.399963, lat = Math.asin(y), x = ((lon + Math.PI) % (2 * Math.PI) - Math.PI) * R, z = lat * R;
        if (PLANET_PLACES.some(p => planetDistance({ x, z }, p) < 5.5) || Math.abs(z - 1.2 * Math.sin((x + Math.PI * R) / (Math.PI * 2 * R) * Math.PI * 4)) < 2.2 || ti >= 130)
            continue;
        const q = surfaceFrame(x, z), p = planetPoint(x, z, .74);
        d.position.set(p.x, p.y, p.z);
        d.quaternion.copy(q);
        d.scale.setScalar(1);
        d.updateMatrix();
        trunks.setMatrixAt(ti++, d.matrix);
        for (let j = 0; j < 3; j++) {
            const centre = planetPoint(x, z, 1.75 + j * .43), v = new THREE.Vector3(j === 1 ? .25 : -.12, 0, j === 2 ? .22 : 0).applyQuaternion(q);
            d.position.set(centre.x, centre.y, centre.z).add(v);
            d.scale.set(.9 - j * .1, .65, .9 - j * .1);
            d.updateMatrix();
            crowns.setMatrixAt(ci++, d.matrix);
        }
    }
    trunks.count = ti;
    crowns.count = ci;
    trunks.castShadow = crowns.castShadow = true;
    trunks.receiveShadow = crowns.receiveShadow = true;
    root.add(trunks, crowns);
    for (let i = 0; i < 20; i++) {
        const g = place(-Math.PI * R + i * Math.PI * 2 * R / 20, 3.5);
        lamp(g, 0, 0);
    }
    const buildings = PLANET_PLACES.filter(p => ["tea", "reading", "workshop"].includes(p.kind));
    function heightAt(x: number, z: number): number {
        const p = buildings.find(p => { const local = planetLocal({ x, z }, p); return Math.abs(local.x) < 2.5 && Math.abs(local.z) < 2.2; });
        const h = PLANET_HUTS.find(h => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);
        const center = p ?? (h ? { x: (h.x0 + h.x1) / 2, z: (h.z0 + h.z1) / 2 } : null);
        if (center)
            return (R + .16) / Math.cos(planetDistance({ x, z }, center) / R) - R;
        const stage = PLANET_PLACES.find(p => p.kind === "stage")!;
        return planetDistance({ x, z }, stage) < 3 ? (R + .24) / Math.cos(planetDistance({ x, z }, stage) / R) - R : 0;
    }
    function canStand(x: number, z: number, locked: ReadonlySet<string>, ownHut?: string): boolean {
        for (const p of buildings) {
            const { x: dx, z: dz } = planetLocal({ x, z }, p);
            if (Math.abs(dx) > 2.7 || Math.abs(dz) > 2.5)
                continue;
            if (Math.abs(dx) > 2.15 || dz < -1.75)
                return false;
            if (p.kind === "tea" && dz > 1.65 && Math.abs(dx) > .65)
                return false;
        }
        for (const h of PLANET_HUTS) {
            if (x < h.x0 - .25 || x > h.x1 + .25 || z < h.z0 - .25 || z > h.z1 + .25)
                continue;
            if (x < h.x0 + .25 || x > h.x1 - .25 || z < h.z0 + .25)
                return false;
            if (z > h.z1 - .3 && (x < h.door.x0 + .15 || x > h.door.x1 - .15))
                return false;
            if (locked.has(h.id) && h.id !== ownHut)
                return false;
        }
        return true;
    }
    const inside = (x: number, z: number): boolean => buildings.some(p => { const local = planetLocal({ x, z }, p); return Math.abs(local.x) < 2.3 && Math.abs(local.z) < 1.95; });
    return { root, solids, doors, lamps, lanterns, blossoms, heightAt, inside, canStand, dispose: () => {
            root.traverse(o => { const t = o.userData.signTexture as THREE.Texture | undefined; t?.dispose(); });
            for (const g of geometries)
                g.dispose();
            for (const m of materials)
                m.dispose();
            root.removeFromParent();
        } };
}
