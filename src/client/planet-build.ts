// Original low-cost, volumetric Soundfolk architecture. No downloaded models.
import * as THREE from "three";
import { PLANET_RADIUS as R, PLANET_PLACES, PLANET_HUTS, planetBasis, planetPoint, planetDistance, planetLocal, type PlanetPlace } from "../shared/planet.js";
import { coastlineAt, createPlanetCoast, planetPierHeightAt } from "./planet-coast.js";
import type { PlacedSound } from "../shared/protocol.js";
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
    cafeState: { sourceIds: string[]; steam: boolean; music: boolean; company: boolean };
    setContributions(sounds: readonly PlacedSound[]): void;
    heightAt(x: number, z: number): number;
    inside(x: number, z: number): boolean;
    canStand(x: number, z: number, locked: ReadonlySet<string>, ownHut?: string): boolean;
    animate(seconds: number, reducedMotion: boolean): void;
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
    const cafeState: PlanetBuild["cafeState"] = { sourceIds: [], steam: false, music: false, company: false };
    const cafeSteam: THREE.Mesh[] = [], cafeCups: THREE.Group[] = [], cafeWindows: THREE.Mesh[] = [];
    const cafeCupParts: { mesh: THREE.InstancedMesh; offset: THREE.Matrix4 }[] = [];
    let cafeCupParent: THREE.Group | null = null;
    let cafeRecord: THREE.Mesh | null = null;
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    const mat = (colour: number, emissive = 0): THREE.MeshStandardMaterial => {
        const m = new THREE.MeshStandardMaterial({ color: colour, roughness: .93, metalness: 0, emissive, emissiveIntensity: .35 });
        materials.add(m);
        return m;
    };
    const sage = mat(0x64887a), cream = mat(0xeee3c9), timber = mat(0xb18a5d), terra = mat(0xba7a60), dark = mat(0x3e5b51);
    const sea = mat(0x76b4ad), stone = mat(0xd8c6a3), gold = mat(0xd8b778), paper = mat(0xe0d2ae);
    const rose = mat(0xc58c7b), shadow = mat(0x3b665f), roofMat = mat(0x67897f);
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
    const strut = (parent: THREE.Object3D, a: [number, number, number], b: [number, number, number], radius: number, m: THREE.Material): THREE.Mesh => {
        const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
        const object = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 6), m, parent);
        object.position.copy(from).add(to).multiplyScalar(.5);
        object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
        return object;
    };
    const place = (x: number, z: number): THREE.Group => { const g = new THREE.Group(); onPlanet(g, x, z); root.add(g); return g; };
    const globe = new THREE.SphereGeometry(R, 112, 64);
    geometries.add(globe);
    const pos = globe.getAttribute("position"), colours = [];
    for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
        const x = Math.atan2(v.x, v.z) * R, z = -Math.asin(v.y) * R;
        const grain = Math.sin(v.x * 19 + v.z * 8) * Math.sin(v.y * 17 - v.x * 11) * .018;
        const coastal = THREE.MathUtils.smoothstep(z, coastlineAt(x) - 6, coastlineAt(x) - 2);
        const c = new THREE.Color(0x8caa78).lerp(new THREE.Color(0xb5b786), coastal);
        c.multiplyScalar(1 + grain);
        colours.push(c.r, c.g, c.b);
    }
    globe.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    const earthMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    materials.add(earthMat);
    mesh(globe, earthMat);
    const coast = createPlanetCoast();
    root.add(coast.root);
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
            patch(p.x, p.z, p.kind === "tea" ? 4.85 : 3.5, paper);
    // Continuous ribbons replace a necklace of overlapping discs. Branches
    // arrive at the actual doors and porches, leaving the meeting green open.
    function path(points: [number, number][], width = 1.2, title = "village-path"): void {
        const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
        const samples = curve.getPoints(Math.max(12, Math.ceil(curve.getLength() / .3)));
        const vertices: number[] = [], indices: number[] = [];
        for (let i = 0; i < samples.length; i++) {
            const p = samples[i], a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
            const dx = b.x - a.x, dz = b.z - a.z, length = Math.max(.001, Math.hypot(dx, dz));
            for (const side of [-1, 1]) {
                const xx = p.x - dz / length * width / 2 * side / Math.max(.3, Math.cos(p.z / R));
                const zz = p.z + dx / length * width / 2 * side;
                const v = planetPoint(xx, zz, .055);
                vertices.push(v.x, v.y, v.z);
            }
            if (i < samples.length - 1) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices); geometry.computeVertexNormals();
        const object = mesh(geometry, stone); object.castShadow = false; object.name = title;
    }
    const promenade: [number, number][] = [];
    for (let i = 0; i <= 96; i++) promenade.push([-Math.PI * R + i * Math.PI * 2 * R / 96, 1.2 * Math.sin(i / 96 * Math.PI * 4)]);
    path(promenade, 1.65, "around-the-world-promenade");
    const villageRoutes: [number, number][][] = [
        [[-4, -.4], [-6.5, -1.4], [-9, -3.7]],
        [[5, .5], [7, -3], [10, -5.8]],
        [[-7, .8], [-10, 4], [-13, 10.1]],
        [[-.6, 3], [-4, 8], [-4.5, 12], [-2, 18.8]],
        [[7, 1], [9, 5], [10, 9], [14, 10]],
        [[14, 10], [16.5, 11.5], [16, 14]],
        [[-9, -3.7], [-15, -5], [-19, -8], [-21, -11.8]],
        [[55, -1.2], [54, -3], [55, -5]],
        [[16, 14], [20, 17], [20, coastlineAt(20) - .7]],
        [[3, 2], [7, 9], [7, coastlineAt(7) - 1.4]],
    ];
    for (const points of villageRoutes) path(points, 1.2);
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
        // Low timber lanterns belong to the village, rather than a repeated
        // line of tall city lamp-posts competing with the small buildings.
        box(.14, 1.35, .14, timber, parent, x, .68, z);
        const glow = mat(0xf6d694, 0xffc375);
        box(.3, .32, .3, glow, parent, x, 1.49, z);
        box(.4, .07, .4, dark, parent, x, 1.69, z);
        box(.36, .06, .36, dark, parent, x, 1.29, z);
        const light = new THREE.PointLight(0xffd2a0, 0, 8, 2);
        light.position.set(x, 1.5, z);
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
        g.name = `village-${p.kind}`;
        box(5, .18, 4.4, timber, g, 0, .06, 0);
        const glass = new THREE.MeshStandardMaterial({ color: 0x7caaa3, transparent: true, opacity: .28, roughness: .3, depthWrite: false });
        materials.add(glass);
        for (const x of [-2.4, 2.4]) {
            solids.push(box(.18, 1, 4.1, colour, g, x, .65, 0));
            solids.push(box(.18, .48, 4.1, colour, g, x, 2.63, 0));
            for (const z of [-1.7, -.55, .55, 1.7]) {
                solids.push(box(.2, 2.65, .12, cream, g, x, 1.45, z));
                if (z < 1) box(.03, 1.18, .97, glass, g, x, 1.76, z + .55);
            }
            box(.28, .12, 4.35, cream, g, x, 1.12, 0);
            box(.2, .15, 4.25, timber, g, x, .22, 0);
        }
        solids.push(box(4.9, 2.8, .17, colour, g, 0, 1.5, -2));
        if (!open)
            for (const x of [-1.65, 1.65]) {
                solids.push(box(1.55, 2.8, .17, colour, g, x, 1.5, 2));
                box(1.13, 1.05, .055, shadow, g, x, 1.75, 2.1);
                for (const xx of [-.61, .61]) box(.08, 1.25, .12, cream, g, x + xx, 1.75, 2.15);
                for (const yy of [1.17, 2.34]) box(1.3, .08, .12, cream, g, x, yy, 2.15);
                box(.055, 1.05, .11, timber, g, x, 1.75, 2.17);
                box(1.35, .18, .4, timber, g, x, 1.02, 2.25);
                for (let flower = 0; flower < 4; flower++) ball(.1, flower % 2 ? cream : rose, g, x - .45 + flower * .3, 1.18, 2.28);
            }
        if (p.kind === "reading") {
            const geometry = new THREE.CylinderGeometry(2.75, 2.75, 5.75, 28, 1, true, 0, Math.PI);
            geometry.rotateZ(Math.PI / 2); geometry.scale(1, .4, 1);
            const canopyMaterial = mat(0x719b90); canopyMaterial.side = THREE.DoubleSide;
            const roof = mesh(geometry, canopyMaterial, g); roof.position.y = 2.75; solids.push(roof);
            for (const x of [-2.65, 2.65]) strut(g, [x, 0, 2.35], [x, 3.05, 2.35], .07, timber);
        } else {
            const shape = new THREE.Shape();
            shape.moveTo(-2.85, 0); shape.lineTo(0, 1.25); shape.lineTo(2.85, 0); shape.closePath();
            const roofGeometry = new THREE.ExtrudeGeometry(shape, { depth: 5.1, bevelEnabled: true, bevelSize: .04, bevelThickness: .04, bevelSegments: 1, steps: 1 });
            const roof = mesh(roofGeometry, p.kind === "tea" ? terra : roofMat, g); roof.position.set(0, 2.95, -2.55); solids.push(roof);
            box(5.65, .12, 5.08, cream, g, 0, 2.94, 0);
            for (const z of [-2.6, 2.6]) {
                strut(g, [-2.85, 3, z], [0, 4.24, z], .055, cream);
                strut(g, [0, 4.24, z], [2.85, 3, z], .055, cream);
            }
            strut(g, [0, 4.25, -2.65], [0, 4.25, 2.65], .07, cream);
            const chimney = box(.48, 1.2, .55, cream, g, -1.35, 4.02, -.8);
            box(.64, .12, .7, terra, chimney, 0, .64, 0);
        }
        // A real shaded porch and framed entrance are readable from the path.
        box(5.1, .09, .8, timber, g, 0, .025, 2.5);
        for (const x of [-2.35, 2.35]) {
            strut(g, [x, .04, 2.65], [x, 2.95, 2.65], .075, dark);
            box(.28, .1, .28, cream, g, x, .08, 2.65);
        }
        sign(g, p.kind === "tea" ? "Coffee & company" : p.title, 2.69);
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
            const basin = mesh(new THREE.CylinderGeometry(.67, .67, .035, 24), sea, g);
            basin.position.y = .49;
            const rings = mesh(new THREE.TorusGeometry(.9, .055, 6, 48), gold, g);
            rings.rotation.x = Math.PI / 2;
            rings.position.y = .5;
            lamp(g, -4, -3);
            lamp(g, 4, 3);
        }
        else if (p.kind === "tea") {
            const g = house(p, sage, true); g.name = "village-coffee-house";
            cafeCupParent = g;
            // The open front and furnished patio explain what belongs here
            // from the path. Keep the original place ID and coordinates.
            const cup = (parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
                const group = new THREE.Group(); parent.add(group); group.position.set(x, y, z); cafeCups.push(group);
                return group;
            };
            for (const [x, z] of [[-1.25, .1], [1.25, .1], [-3.5, 1.4], [3.5, 1.4]]) {
                const table = new THREE.Group(); g.add(table); table.position.set(x, 0, z); table.name = "cafe-company-table";
                const top = mesh(new THREE.CylinderGeometry(.59, .59, .1, 18), timber, table); top.position.y = .84;
                box(.12, .8, .12, dark, table, 0, .4, 0);
                box(.64, .07, .12, dark, table, 0, .1, 0);
                cup(table, -.2, .9, 0); cup(table, .2, .9, .1);
                const vase = ball(.085, terra, table, 0, .99, -.18); vase.scale.y = 1.4;
                strut(table, [0, 1.02, -.18], [.02, 1.25, -.18], .01, sage);
                ball(.075, rose, table, .02, 1.27, -.18);
                for (const side of [-1, 1]) {
                    const chair = new THREE.Group(); table.add(chair); chair.position.set(side * .88, 0, .18); chair.rotation.y = side * Math.PI / 2;
                    box(.46, .08, .46, terra, chair, 0, .44, 0);
                    box(.46, .49, .065, terra, chair, 0, .72, -.2);
                    for (const xx of [-.16, .16]) for (const zz of [-.16, .16]) box(.045, .4, .045, dark, chair, xx, .2, zz);
                }
            }
            const counter = box(4, .91, .7, cream, g, 0, .6, -1.35); counter.name = "cafe-coffee-counter";
            box(4.15, .1, .82, timber, g, 0, 1.1, -1.35);
            for (let i = 0; i < 6; i++) box(.54, .57, .04, sage, g, -1.65 + i * .66, .62, -.975);
            const machine = box(.84, .58, .44, terra, g, -.6, 1.44, -1.3); machine.name = "cafe-espresso-machine";
            box(.72, .17, .06, dark, machine, 0, .01, .245);
            for (const x of [-.2, .2]) {
                const dial = mesh(new THREE.CylinderGeometry(.065, .065, .027, 10), cream, machine); dial.rotation.x = Math.PI / 2; dial.position.set(x, .1, .25);
                box(.045, .18, .045, gold, machine, x, -.14, .28);
            }
            cup(g, -.8, 1.15, -.99); cup(g, -.4, 1.15, -.99);
            for (let i = 0; i < 6; i++) {
                const m = new THREE.MeshBasicMaterial({ color: 0xf9efd9, transparent: true, opacity: .2, depthWrite: false }); materials.add(m);
                const steam = mesh(new THREE.SphereGeometry(.09, 7, 5), m, g); steam.castShadow = false; steam.receiveShadow = false;
                steam.name = "cafe-source-steam"; steam.visible = false; cafeSteam.push(steam);
            }
            const cake = mesh(new THREE.CylinderGeometry(.25, .27, .14, 16), rose, g); cake.position.set(1.25, 1.24, -1.25);
            ball(.045, terra, g, 1.25, 1.34, -1.25);
            const glass = new THREE.MeshStandardMaterial({ color: 0xc2dbcb, transparent: true, opacity: .18, roughness: .3, depthWrite: false }); materials.add(glass);
            box(.82, .44, .62, glass, g, 1.25, 1.34, -1.25);
            // A small record player makes a musical choice visible, without
            // fabricating a background soundtrack before somebody leaves one.
            box(.63, .1, .48, timber, g, -1.5, 1.2, -1.36);
            cafeRecord = mesh(new THREE.CylinderGeometry(.2, .2, .015, 24), dark, g); cafeRecord.position.set(-1.5, 1.27, -1.36); cafeRecord.name = "cafe-source-record";
            const label = mesh(new THREE.CylinderGeometry(.065, .065, .017, 16), gold, cafeRecord);
            const notch = box(.04, .019, .08, cream, cafeRecord, .12, .015, 0); notch.castShadow = false;
            box(.025, .025, .23, gold, g, -1.27, 1.31, -1.35);
            for (const x of [-1.45, 1.45]) {
                const window = box(.43, .1, .025, mat(0xe6bd83, 0xf2b35e), g, x, 2.24, -1.9);
                window.name = "cafe-source-warmth"; cafeWindows.push(window);
            }
            // Two striped side parasols frame the porch without extending a
            // solid roof over the arrival camera or blocking the central path.
            const canopyGeometry = new THREE.ConeGeometry(1.1, .46, 8, 1, true).toNonIndexed();
            const canopyPositions = canopyGeometry.getAttribute("position"), canopyColours: number[] = [];
            for (let i = 0; i < canopyPositions.count; i += 3) {
                let x = 0, z = 0;
                for (let j = 0; j < 3; j++) { x += canopyPositions.getX(i + j); z += canopyPositions.getZ(i + j); }
                const side = Math.floor(((Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4));
                const colour = new THREE.Color(side % 2 ? 0xeee3c9 : 0xba7a60);
                for (let j = 0; j < 3; j++) canopyColours.push(colour.r, colour.g, colour.b);
            }
            canopyGeometry.setAttribute("color", new THREE.Float32BufferAttribute(canopyColours, 3));
            const canopyFabric = mat(0xffffff); canopyFabric.side = THREE.DoubleSide; canopyFabric.vertexColors = true;
            for (const x of [-3.5, 3.5]) {
                const canopy = new THREE.Group(); g.add(canopy); canopy.position.set(x, 2.45, 1.4);
                mesh(canopyGeometry, canopyFabric, canopy);
                box(.055, 2.2, .055, timber, g, x, 1.3, 1.4);
            }
            const menu = new THREE.Group(); g.add(menu); menu.position.set(-1.65, 0, 2.58); menu.rotation.y = -.12;
            box(.7, .95, .08, dark, menu, 0, .62, 0);
            for (const y of [.91, .68, .48]) box(.43, .025, .018, cream, menu, 0, y, .055);
            const bean = ball(.075, gold, menu, 0, .96, .065); bean.scale.set(1.6, .8, .25);
            for (const x of [-.27, .27]) box(.05, .28, .4, timber, menu, x, .14, 0);
            // Ten detailed cups cost four draw calls, with a shared geometry
            // and the same small company gesture as their actual group frames.
            for (const [geometry, material, position] of [
                [new THREE.CylinderGeometry(.16, .16, .025, 12), cream, [0, .015, 0]],
                [new THREE.CylinderGeometry(.095, .07, .13, 12), cream, [0, .085, 0]],
                [new THREE.CylinderGeometry(.081, .081, .009, 12), dark, [0, .153, 0]],
                [new THREE.TorusGeometry(.055, .014, 4, 10), cream, [.1, .09, 0]],
            ] as const) {
                geometries.add(geometry); const part = new THREE.InstancedMesh(geometry, material, cafeCups.length);
                part.castShadow = true; part.receiveShadow = true; g.add(part);
                cafeCupParts.push({ mesh: part, offset: new THREE.Matrix4().makeTranslation(position[0], position[1], position[2]) });
            }
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
            g.name = "village-sail-stage";
            const plinth = mesh(new THREE.CylinderGeometry(3.1, 3.25, .22, 32), timber, g);
            plinth.position.y = .12;
            for (const x of [-2.6, 2.6]) for (const z of [-2.1, 2.1]) {
                strut(g, [x, .1, z], [x, 3.55, z], .085, timber);
                box(.25, .12, .25, cream, g, x, .19, z);
            }
            const canvas = new THREE.BufferGeometry();
            canvas.setAttribute("position", new THREE.Float32BufferAttribute([0, 3.12, 0, -2.85, 3.62, -2.4, 2.85, 3.45, -2.4, 2.85, 3.65, 2.4, -2.85, 3.85, 2.4], 3));
            canvas.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]); canvas.computeVertexNormals();
            const sail = mat(0xe5d2a8); sail.side = THREE.DoubleSide;
            solids.push(mesh(canvas, sail, g));
            for (const z of [-2.4, 2.4]) strut(g, [-2.85, z < 0 ? 3.62 : 3.85, z], [2.85, z < 0 ? 3.45 : 3.65, z], .025, cream);
            sign(g, "Pocket jam", 2.75);
            lamp(g, -2.5, 1.8); lamp(g, 2.5, 1.8);
            const drum = mesh(new THREE.CylinderGeometry(.43, .35, .65, 16), terra, g);
            drum.position.set(-1, .55, -1);
            const skin = mesh(new THREE.CylinderGeometry(.44, .44, .035, 20), cream, g); skin.position.set(-1, .89, -1);
            for (const x of [-1.28, -.72]) strut(g, [x, .1, -1], [x, .38, -1], .035, dark);
            const lower = ball(.29, gold, g, 1, .68, -1); lower.scale.set(.9, 1, .35);
            const upper = ball(.23, gold, g, 1, .98, -1); upper.scale.set(.9, 1, .35);
            box(.11, .7, .1, timber, g, 1, 1.4, -1);
            const hole = mesh(new THREE.CircleGeometry(.07, 16), dark, g); hole.position.set(1, .92, -.89);
            box(.16, .2, .12, terra, g, 1, 1.81, -1);
        }
        else if (p.kind === "conservatory") {
            const g = place(p.x, p.z);
            g.name = "village-conservatory";
            for (const x of [-2.5, 0, 2.5]) {
                const arch = mesh(new THREE.TorusGeometry(2.7, .075, 6, 32, Math.PI), sage, g);
                arch.rotation.y = Math.PI / 2;
                arch.position.set(x, .15, 0);
            }
            for (const z of [-2.6, 2.6])
                box(5.3, .1, .1, sage, g, 0, .2, z);
            for (const x of [-1.65, 1.65]) {
                box(1.1, .45, 3.4, terra, g, x, .23, 0);
                box(1.18, .08, 3.5, cream, g, x, .48, 0);
                box(.94, .04, 3.2, dark, g, x, .5, 0);
            }
            for (const z of [-2.6, 0, 2.6]) strut(g, [-2.5, z === 0 ? 2.85 : .2, z], [2.5, z === 0 ? 2.85 : .2, z], .04, cream);
            const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.15, 0), gold, 40);
            geometries.add(flowers.geometry);
            g.add(flowers);
            const dummy = new THREE.Object3D();
            for (let i = 0; i < 40; i++) {
                const a = i * 2.4, rr = 1 + ((i * 7) % 11) / 8;
                dummy.position.set(i % 2 ? 1.65 : -1.65, .65 + ((i * 3) % 5) * .08, Math.sin(a) * rr * .65);
                dummy.updateMatrix();
                flowers.setMatrixAt(i, dummy.matrix);
            }
            blossoms.push({ mesh: flowers, x: p.x, z: p.z });
            sign(g, "Rain conservatory", 3.3);
            lamp(g, 2.5, 0);
        }
        else if (p.kind === "pool") {
            const poolWater = mat(0x78b5ba, 0x286f91); poolWater.emissiveIntensity = .18;
            patch(p.x, p.z, 3, poolWater);
            const g = place(p.x, p.z);
            for (let i = 0; i < 10; i++) {
                const a = i * Math.PI / 5;
                // An open mouth faces the sea; seated visitors and a ring of
                // boulders must not hide the coast at first-person eye level.
                if (Math.cos(a) > .6) continue;
                const rock = ball(.32 + (i % 3) * .1, stone, g, Math.sin(a) * 3.1, .10, Math.cos(a) * 3.1);
                rock.scale.y = .65;
            }
            const seat = new THREE.Group(); seat.position.set(-3.8, 0, 1); seat.rotation.y = Math.PI / 2; g.add(seat);
            bench(seat, 0, 0);
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
        solids.push(box(3.4, .15, 3.4, cream, g, 0, 2.9, 0));
        const hutRoofShape = new THREE.Shape();
        hutRoofShape.moveTo(-1.8, 0); hutRoofShape.lineTo(0, .72); hutRoofShape.lineTo(1.8, 0); hutRoofShape.closePath();
        const hutRoof = mesh(new THREE.ExtrudeGeometry(hutRoofShape, { depth: 3.6, bevelEnabled: false }), h.kind.endsWith("toilet") ? terra : roofMat, g);
        hutRoof.position.set(0, 2.98, -1.8); solids.push(hutRoof);
        for (const x of [-1.48, 1.48]) box(.16, 2.85, .16, cream, g, x, 1.45, 1.55);
        for (const z of [-1.82, 1.82]) {
            strut(g, [-1.8, 2.98, z], [0, 3.7, z], .04, cream);
            strut(g, [0, 3.7, z], [1.8, 2.98, z], .04, cream);
        }
        const hinge = new THREE.Group();
        hinge.position.set(-.5, 0, 1.51);
        g.add(hinge);
        const leaf = box(1, 2.55, .10, sage, hinge, .5, 1.3, 0);
        box(.055, .15, .065, gold, leaf, .34, -.13, .09);
        solids.push(leaf);
        const signal = ball(.09, mat(0x74be92, 0x48ad79), g, .83, 1.7, 1.65);
        doors.push({ id: h.id, group: hinge, leaf, signal, open: 0 });
        const fixture = mesh(new THREE.CylinderGeometry(.3, .23, .48, 16), cream, g);
        fixture.position.set(0, .29, -.8);
        lamp(g, 1, -.4);
        sign(g, h.kind.endsWith("toilet") ? "Restroom" : "Shower", 3.03);
    }
    // Grouped groves have three silhouettes: wide orchard trees, layered
    // pines and wind-shaped coastal crowns. Shared instancing keeps the
    // authored irregularity inexpensive, without rows of lollipop trees.
    const trunkGeo = new THREE.CylinderGeometry(.10, .17, 2, 8), crownGeo = new THREE.IcosahedronGeometry(1, 1);
    const pineGeo = new THREE.CylinderGeometry(.08, 1, 1.2, 9);
    for (const geometry of [trunkGeo, crownGeo, pineGeo]) geometries.add(geometry);
    const trunks = new THREE.InstancedMesh(trunkGeo, timber, 150);
    const treeMaterial = mat(0xffffff);
    const crowns = new THREE.InstancedMesh(crownGeo, treeMaterial, 640), pines = new THREE.InstancedMesh(pineGeo, treeMaterial, 300);
    trunks.name = "village-tree-trunks"; crowns.name = "village-irregular-canopies"; pines.name = "village-pines";
    let ti = 0, ci = 0, pi = 0;
    const d = new THREE.Object3D();
    const tint = new THREE.Color();
    const palette = [0x668469, 0x53745f, 0x8b9b6c, 0x749578, 0x5f8275];
    const nearPath = (x: number, z: number): boolean => {
        if (Math.abs(z - 1.2 * Math.sin((x + Math.PI * R) / (Math.PI * 2 * R) * Math.PI * 4)) < 2) return true;
        return villageRoutes.some(route => route.some((a, i) => {
            const b = route[i + 1]; if (!b) return false;
            const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
            const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / Math.max(.001, length2), 0, 1);
            return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < 1.6;
        }));
    };
    const clearMeeting = (x: number, z: number): boolean => PLANET_PLACES.some(p => planetDistance({ x, z }, p) < 5.4) || PLANET_HUTS.some(h => x > h.x0 - 1 && x < h.x1 + 1 && z > h.z0 - 1 && z < h.z1 + 1);
    for (let i = 0; i < 650 && ti < 150; i++) {
        const y = 1 - 2 * (i + .5) / 650, lon = i * 2.399963, lat = Math.asin(y);
        const x = ((lon + Math.PI) % (2 * Math.PI) - Math.PI) * R, z = lat * R;
        const grove = Math.sin(x * .22 + Math.sin(z * .3)) + Math.cos(z * .23 - x * .11);
        const villageVista = x > -3 && x < 6 && z > 4 && z < 14;
        if (villageVista || clearMeeting(x, z) || nearPath(x, z) || z > coastlineAt(x) - 4 || grove < -.6) continue;
        const q = surfaceFrame(x, z), kind = i % 5, scale = .85 + (i % 7) * .075, lean = Math.sin(i * 1.7) * .11;
        const trunk = planetPoint(x, z, scale);
        d.position.set(trunk.x, trunk.y, trunk.z);
        d.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), lean));
        d.scale.set(.85 * scale, scale, .85 * scale); d.updateMatrix();
        trunks.setMatrixAt(ti++, d.matrix);
        if (kind < 2) {
            for (let layer = 0; layer < 4; layer++) {
                const p = planetPoint(x, z, (1.9 + layer * .53) * scale);
                const offset = new THREE.Vector3(lean * (2 + layer), 0, Math.sin(i + layer) * .12).applyQuaternion(q);
                d.position.set(p.x, p.y, p.z).add(offset); d.quaternion.copy(q);
                const width = (1.35 - layer * .25) * scale;
                d.scale.set(width, .82 * scale, width); d.updateMatrix();
                pines.setMatrixAt(pi, d.matrix); pines.setColorAt(pi++, tint.setHex(palette[(i + layer) % palette.length]));
            }
        } else {
            for (let lobe = 0; lobe < 4; lobe++) {
                const angle = lobe * 2.4 + i, wide = kind === 4 ? 1.25 : .9;
                const p = planetPoint(x, z, (2.4 + Math.sin(i + lobe) * .28) * scale);
                const offset = new THREE.Vector3(Math.sin(angle) * .6 * wide + lean * 3, lobe === 3 ? .45 : 0, Math.cos(angle) * .5).applyQuaternion(q);
                d.position.set(p.x, p.y, p.z).add(offset); d.quaternion.copy(q);
                d.scale.set((.88 + (lobe % 2) * .2) * scale * wide, (kind === 4 ? .52 : .77) * scale, .85 * scale); d.updateMatrix();
                crowns.setMatrixAt(ci, d.matrix); crowns.setColorAt(ci++, tint.setHex(palette[(i + lobe) % palette.length]));
            }
        }
    }
    trunks.count = ti; crowns.count = ci; pines.count = pi;
    for (const trees of [trunks, crowns, pines]) { trees.castShadow = true; trees.receiveShadow = true; root.add(trees); }

    // Deliberate garden drifts and dune tufts replace otherwise bare grass.
    // They stay outside the actual doors, central gathering pads and route.
    const bladeGeometry = new THREE.BufferGeometry();
    bladeGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-.035, 0, 0, .035, 0, 0, .12, .48, 0], 3));
    bladeGeometry.computeVertexNormals(); geometries.add(bladeGeometry);
    const grassMaterial = mat(0x8d9f75); grassMaterial.side = THREE.DoubleSide;
    const grass = new THREE.InstancedMesh(bladeGeometry, grassMaterial, 2300);
    const flowerGeometry = new THREE.IcosahedronGeometry(.075, 0); geometries.add(flowerGeometry);
    const flowers = new THREE.InstancedMesh(flowerGeometry, cream, 360);
    grass.name = "village-meadow-and-dune-grass"; flowers.name = "village-garden-daisies";
    let gi = 0, fi = 0;
    for (let i = 0; i < 1500 && gi < 2296; i++) {
        const x = -Math.PI * R + ((i * 47.31) % (Math.PI * R * 2));
        const z = -24 + ((i * 23.71) % 48);
        if (z > coastlineAt(x) - .85 || nearPath(x, z) || clearMeeting(x, z)) continue;
        const drift = Math.sin(x * .7) * Math.cos(z * .6);
        if (drift < -.15 && z < coastlineAt(x) - 4) continue;
        const q = surfaceFrame(x, z);
        for (let blade = 0; blade < 3; blade++) {
            const p = planetPoint(x + Math.sin(blade * 2.4) * .13, z + Math.cos(blade * 2.4) * .13, .04);
            d.position.set(p.x, p.y, p.z); d.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 2.4 + blade * 1.8));
            d.scale.setScalar(.65 + ((i + blade) % 7) * .12); d.updateMatrix(); grass.setMatrixAt(gi++, d.matrix);
        }
        if (i % 4 === 0 && fi < 360 && z < coastlineAt(x) - 4) {
            const p = planetPoint(x, z, .28); d.position.set(p.x, p.y, p.z); d.quaternion.copy(q); d.scale.set(1, .65, 1); d.updateMatrix();
            flowers.setMatrixAt(fi, d.matrix); flowers.setColorAt(fi++, tint.setHex(i % 3 ? 0xe9dbb3 : 0xc69682));
        }
    }
    grass.count = gi; flowers.count = fi; root.add(grass, flowers);
    // Fewer lanterns, grouped by the places and junctions rather than a ring
    // of identical poles. The continuous path itself provides wayfinding.
    for (const [x, z] of [[-6, 2.8], [6, -2.5], [23, 2.8], [42, -2.8], [-35, 2.8], [-54, -2.8]]) lamp(place(x, z), 0, 0);
    const buildings = PLANET_PLACES.filter(p => ["tea", "reading", "workshop"].includes(p.kind));
    function heightAt(x: number, z: number): number {
        const pier = planetPierHeightAt(x, z);
        if (pier !== null) return pier;
        const p = buildings.find(p => { const local = planetLocal({ x, z }, p); return Math.abs(local.x) < 2.5 && Math.abs(local.z) < 2.2; });
        const h = PLANET_HUTS.find(h => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);
        const center = p ?? (h ? { x: (h.x0 + h.x1) / 2, z: (h.z0 + h.z1) / 2 } : null);
        if (center)
            return (R + .16) / Math.cos(planetDistance({ x, z }, center) / R) - R;
        const stage = PLANET_PLACES.find(p => p.kind === "stage")!;
        return planetDistance({ x, z }, stage) < 3 ? (R + .24) / Math.cos(planetDistance({ x, z }, stage) / R) - R : 0;
    }
    function canStand(x: number, z: number, locked: ReadonlySet<string>, ownHut?: string): boolean {
        // Water is visibly water. The continuous land promenade still wraps
        // the whole planet; only the actual timber pier carries people at sea.
        if (z > coastlineAt(x) + .12 && planetPierHeightAt(x, z) === null) return false;
        for (const p of buildings) {
            const { x: dx, z: dz } = planetLocal({ x, z }, p);
            if (Math.abs(dx) > 2.7 || Math.abs(dz) > 2.5)
                continue;
            if (Math.abs(dx) > 2.15 || dz < -1.75)
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
    function setContributions(sounds: readonly PlacedSound[]): void {
        const cafe = PLANET_PLACES.find(place => place.kind === "tea")!;
        const live = sounds.filter(source => !source.removedAt && !source.whileIn && planetDistance(source, cafe) <= 8)
            .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
        cafeState.sourceIds = [...new Set(live.map(source => source.id))];
        cafeState.steam = live.some(source => source.soundId === "espresso");
        cafeState.music = live.some(source => ["cafe-music", "guitar", "chorus-chords", "chorus-pulse", "chorus-bells"].includes(source.soundId));
        cafeState.company = live.some(source => ["cafe-chatter", "cafe-dishes"].includes(source.soundId));
    }
    function animate(seconds: number, reducedMotion: boolean): void {
        coast.animate(seconds, reducedMotion);
        for (let i = 0; i < cafeSteam.length; i++) {
            const steam = cafeSteam[i], progress = reducedMotion ? (i + 1) / 7 : ((seconds * .35 + i / cafeSteam.length) % 1 + 1) % 1;
            steam.visible = cafeState.steam;
            steam.position.set(-.6 + Math.sin(i * 2.4 + progress * 2) * .12, 1.78 + progress * .95, -1.3 + Math.cos(i * 2.4) * .07);
            steam.scale.setScalar(.35 + progress * 1.6);
            (steam.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * .35;
        }
        if (cafeRecord) cafeRecord.rotation.y = cafeState.music && !reducedMotion ? seconds * .9 : 0;
        for (let i = 0; i < cafeCups.length; i++) cafeCups[i].rotation.z = cafeState.company && !reducedMotion ? Math.sin(seconds * 1.5 + i) * .025 : 0;
        if (cafeCupParent) {
            cafeCupParent.updateWorldMatrix(true, true);
            const inverse = cafeCupParent.matrixWorld.clone().invert();
            for (const part of cafeCupParts) {
                for (let i = 0; i < cafeCups.length; i++) part.mesh.setMatrixAt(i, inverse.clone().multiply(cafeCups[i].matrixWorld).multiply(part.offset));
                part.mesh.instanceMatrix.needsUpdate = true;
            }
        }
        for (const window of cafeWindows) (window.material as THREE.MeshStandardMaterial).emissiveIntensity = cafeState.company ? .9 : .12;
    }
    return { root, solids, doors, lamps, lanterns, blossoms, cafeState, setContributions, heightAt, inside, canStand, animate, dispose: () => {
            coast.dispose();
            root.traverse(o => { const t = o.userData.signTexture as THREE.Texture | undefined; t?.dispose(); if (o instanceof THREE.InstancedMesh) o.dispose(); });
            for (const g of geometries)
                g.dispose();
            for (const m of materials)
                m.dispose();
            root.removeFromParent();
        } };
}
