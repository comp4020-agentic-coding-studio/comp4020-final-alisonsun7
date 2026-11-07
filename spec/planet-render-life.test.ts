import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { animateCafeIdle, CAFE_RESIDENT_HOMES, planetRenderScale } from "../src/client/planet-world.ts";
import { PLANET_PLACES, planetLocal } from "../src/shared/planet.ts";

describe("bounded antialiasing density", () => {
    it("uses retina pixels for small screens without exceeding the fixed drawing budget at larger sizes", () => {
        expect(planetRenderScale(390,844,3)).toBe(2);
        expect(planetRenderScale(1920,1080,1)).toBe(1.25);
        for (const [width,height] of [[390,844],[1920,1080],[3840,2160],[7680,4320]]) {
            const scale = planetRenderScale(width,height,3);
            expect(width*height*scale*scale).toBeLessThanOrEqual(6_000_001);
            expect(scale).toBeLessThanOrEqual(2);
        }
    });
    it("remains finite before a stage has dimensions or a browser reports a usable DPR", () => {
        expect(planetRenderScale(0,0,NaN)).toBe(1.25);
        expect(planetRenderScale(NaN,Infinity,0)).toBe(1.25);
    });
});

describe("café life remains scenery that yields to real sounds", () => {
    const rig = () => ({ body: new THREE.Group(),head: new THREE.Group(),left: new THREE.Group(),right: new THREE.Group() });
    const neighbour = () => { const figure = new THREE.Group();figure.userData.soundResident = { id: "coffee-barista",sourceId: null };return figure; };
    it("places six distinct cat and dog neighbours in the authored café frame without relocating the venue", () => {
        const cafe = PLANET_PLACES.find(place => place.kind === "tea")!;
        expect(cafe).toMatchObject({ x: -9,z: -7 });
        expect(new Set(CAFE_RESIDENT_HOMES.map(home => home.id)).size).toBe(6);
        expect(CAFE_RESIDENT_HOMES.filter(home => home.avatar === "cat")).toHaveLength(3);
        expect(CAFE_RESIDENT_HOMES.filter(home => home.avatar === "dog")).toHaveLength(3);
        for (const home of CAFE_RESIDENT_HOMES) {
            const local = planetLocal(home,cafe);
            expect(local.x).toBeCloseTo(home.local[0],8);
            expect(local.z).toBeCloseTo(home.local[1],8);
            expect(home.label).toContain("NPC");
        }
        expect(new Set(CAFE_RESIDENT_HOMES.map(home => home.facing)).size).toBeGreaterThan(3);
    });
    it("uses shared time for visible idle movement, freezes reduced motion and leaves source-driven poses untouched", () => {
        const a = rig(),b = rig(),c = rig(),figure = neighbour();
        animateCafeIdle(figure,a,1_800_000_000_000,false);
        animateCafeIdle(figure,b,1_800_000_000_000,false);
        expect(b.head.rotation.toArray()).toEqual(a.head.rotation.toArray());
        animateCafeIdle(figure,c,1_800_000_002_000,false);
        expect(c.head.rotation.toArray()).not.toEqual(a.head.rotation.toArray());
        const still = rig();animateCafeIdle(figure,still,1_800_000_000_000,true);
        const stillLater = rig();animateCafeIdle(figure,stillLater,1_800_000_030_000,true);
        expect(stillLater.head.rotation.toArray()).toEqual(still.head.rotation.toArray());
        for (const source of ["public-source",null]) {
            figure.userData.soundResident.sourceId = source;
            figure.userData.chorusWorkId = source ? null : "actual-work";
            const soundPose = rig();soundPose.head.rotation.set(.3,.4,.5);soundPose.right.rotation.x = -1.2;
            animateCafeIdle(figure,soundPose,1_800_000_000_000,false);
            expect(soundPose.head.rotation.toArray()).toEqual([.3,.4,.5,"XYZ"]);
            expect(soundPose.right.rotation.x).toBe(-1.2);
        }
    });
});
