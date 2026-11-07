// In-world access to the existing nearby chat and authoritative private stays.
// Chat remains transient and local to twelve metres; this module stores none.
import { PLANET_HUTS, planetDistance, sceneHutAt } from "../shared/planet.js";
import { privateSound, type Hut } from "../shared/huts.js";
import type { Person, Position, PlacedSound } from "../shared/protocol.js";
import type { NpcRoutineFrame } from "../shared/npc-routines.js";

interface Options {
    at(): Position;
    you(): Person | null;
    people(): readonly (Person & Position)[];
    npcs(): readonly NpcRoutineFrame[];
    sounds(): readonly PlacedSound[];
    joined(): boolean;
    connected(): boolean;
    project(x: number, z: number, height: number): { x: number; y: number; visible: boolean };
    openChat(): void;
    closeChat(): void;
    walk(target: Position): void;
    stay(soundId: string): Promise<string | null>;
    notice(text: string): void;
}
interface Words { element: HTMLElement; expires: number; }
const text = (element: HTMLElement, value: string): void => {if (element.textContent !== value) element.textContent = value;};
const doorPoint = (hut: Hut): Position => ({ x: (hut.door.x0 + hut.door.x1) / 2, z: hut.z1 + 1.25, yaw: Math.PI });

export class PlanetSocial {
    readonly talk: HTMLButtonElement;
    readonly restroom: HTMLElement;
    private title: HTMLElement;
    private status: HTMLElement;
    private enter: HTMLButtonElement;
    private leave: HTMLButtonElement;
    private stay: HTMLButtonElement;
    private switchRoom: HTMLButtonElement;
    private tucked: HTMLButtonElement;
    private words = new Map<string, Words>();
    private abort = new AbortController();
    private activeHut: string | null = null;
    private dismissed = false;
    private stayPending = false;
    private disposed = false;
    private nextFrame = 0;

    constructor(private host: HTMLElement, private opts: Options) {
        const button = (id: string, text: string, action: () => void): HTMLButtonElement => {
            const b = document.createElement("button");b.type = "button";b.id = id;b.textContent = text;b.onclick = action;return b;
        };
        this.talk = button("planet-talk", "Talk nearby", () => this.opts.openChat());
        this.talk.className = "planet-talk";
        this.talk.setAttribute("aria-controls", "planet-chat");
        this.talk.setAttribute("aria-expanded", "false");
        this.talk.title = "Talk to friends within twelve metres · T";
        this.restroom = document.createElement("section");this.restroom.id = "planet-restroom-card";this.restroom.className = "planet-restroom-card";this.restroom.hidden = true;
        this.restroom.setAttribute("aria-labelledby", "planet-restroom-title");
        const heading = document.createElement("div");heading.className = "planet-restroom-heading";
        this.title = document.createElement("strong");this.title.id = "planet-restroom-title";
        const dismiss = button("planet-restroom-dismiss", "Close", () => { this.dismissed = true;this.renderRestroom();this.tucked.focus(); });
        dismiss.setAttribute("aria-label", "Close restroom controls");heading.append(this.title, dismiss);
        this.status = document.createElement("p");this.status.id = "planet-restroom-live";this.status.setAttribute("role", "status");
        this.enter = button("planet-enter-room", "Walk into restroom", () => {
            const hut = this.nearestHut();if (!hut) return;
            this.opts.walk({ x: (hut.door.x0 + hut.door.x1) / 2, z: hut.z1 - 1.5, yaw: Math.PI });
        });
        this.leave = button("planet-leave-room", "Walk outside", () => { const hut = sceneHutAt("planet", this.opts.at().x, this.opts.at().z);if (hut) this.opts.walk(doorPoint(hut)); });
        this.stay = button("planet-stay-action", "Flush", () => { void this.playStay(); });
        this.switchRoom = button("planet-switch-room", "Go to shower", () => {
            const current = this.nearestHut(), other = PLANET_HUTS.find(hut => hut.id !== current?.id);if (other) this.opts.walk(doorPoint(other));
        });
        const actions = document.createElement("div");actions.className = "planet-restroom-actions";actions.append(this.enter, this.stay, this.leave, this.switchRoom);
        this.restroom.append(heading, this.status, actions);
        this.tucked = button("planet-restroom-reopen", "Restroom controls", () => { this.dismissed = false;this.renderRestroom();this.restroom.querySelector<HTMLButtonElement>("button")?.focus(); });
        this.tucked.className = "planet-restroom-reopen";this.tucked.hidden = true;
        host.append(this.talk, this.restroom, this.tucked);
        document.addEventListener("keydown", event => {
            const target = event.target;
            if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
            if (event.key.toLowerCase() === "t" && target instanceof HTMLCanvasElement && !document.querySelector("dialog:modal")) {
                event.preventDefault();this.opts.openChat();
            } else if (event.key === "Escape" && !document.getElementById("planet-chat")?.hidden && !document.querySelector("dialog:modal")) {
                event.preventDefault();this.opts.closeChat();
            }
        }, { signal: this.abort.signal });
        this.frame();
    }

    private nearestHut(): Hut | undefined {
        const at = this.opts.at(), inside = sceneHutAt("planet", at.x, at.z);
        if (inside) return inside;
        // Controls belong to the front doorway, rather than inviting a path
        // through a back wall. The physical room remains freely walkable.
        return [...PLANET_HUTS].sort((a, b) => planetDistance(at, doorPoint(a)) - planetDistance(at, doorPoint(b)))
            .find(hut => at.z >= hut.z1 - .15 && planetDistance(at, doorPoint(hut)) <= 4.5);
    }
    private renderRestroom(): void {
        const hut = this.nearestHut(), key = hut?.id ?? null;
        if (key !== this.activeHut) { this.activeHut = key;this.dismissed = false; }
        const modal = !!document.querySelector("dialog:modal"), chatting = !document.getElementById("planet-chat")?.hidden;
        this.restroom.hidden = !hut || this.dismissed || modal || chatting;
        this.tucked.hidden = !hut || !this.dismissed || modal || chatting;
        if (!hut) return;
        const own = sceneHutAt("planet", this.opts.at().x, this.opts.at().z)?.id === hut.id;
        const npc = this.opts.npcs().find(frame => frame.hutId === hut.id && frame.occupying);
        const other = this.opts.people().find(person => person.id !== this.opts.you()?.id && sceneHutAt("planet", person.x, person.z)?.id === hut.id);
        const occupied = !!npc || !!other;
        const source = this.opts.sounds().find(sound => sound.whileIn === hut.id && !sound.removedAt && sound.byId === this.opts.you()?.id);
        const shower = hut.kind.endsWith("shower"), available = this.opts.joined() && this.opts.connected();
        text(this.title, shower ? "The little shower" : "The little restroom");
        this.restroom.dataset.hut = hut.id;this.restroom.dataset.occupied = String(occupied || own);this.restroom.dataset.inside = String(own);
        text(this.status, !this.opts.connected() ? "Reconnecting. Door actions will return when connected." : own
            ? (source ? shower ? "Shower running for this visit. It stops when you walk outside." : "Flush started for this visit. Walk outside to release the room." : "You are inside. The red lamp and lock keep this room yours until you leave.")
            : npc ? "Rowan is using the restroom. The red lamp means the door is locked."
            : other ? `${other.name} is inside. The door is locked until they leave.`
            : "Green lamp · free. Walk through the door; it locks while you are inside.");
        this.enter.hidden = own;this.enter.disabled = !available || occupied;text(this.enter, occupied ? "Occupied · door locked" : shower ? "Walk into shower" : "Walk into restroom");
        this.leave.hidden = !own;this.leave.disabled = !available;
        this.stay.hidden = !own;this.stay.disabled = !available || this.stayPending || !!source;
        text(this.stay, this.stayPending ? "Starting…" : source ? shower ? "Shower running" : "Flush started" : shower ? "Run shower" : "Flush");
        this.switchRoom.hidden = own;this.switchRoom.disabled = !available;text(this.switchRoom, shower ? "Go to restroom" : "Go to shower");
    }
    private async playStay(): Promise<void> {
        if (this.stayPending || !this.opts.connected()) return;
        const at = this.opts.at(), hut = sceneHutAt("planet", at.x, at.z), id = hut && privateSound(hut);if (!id) return;
        this.stayPending = true;this.renderRestroom();
        try { const error = await this.opts.stay(id);if (!this.disposed && error) this.opts.notice(error); }
        catch { if (!this.disposed) this.opts.notice("Connection interrupted. Your stay sound was not started."); }
        finally { this.stayPending = false;if (!this.disposed) this.renderRestroom(); }
    }
    receiveWords(id: string, name: string, text: string): void {
        if (this.disposed) return;
        this.words.get(id)?.element.remove();
        const element = document.createElement("p");element.className = "planet-speech";element.setAttribute("aria-hidden", "true");element.dataset.speaker = id;element.textContent = `${name}: ${text}`;
        this.host.append(element);this.words.set(id, { element, expires: performance.now() + 5000 });
        this.nextFrame = 0;this.frame();
    }
    frame(): void {
        if (this.disposed || performance.now() < this.nextFrame) return;this.nextFrame = performance.now() + 100;
        const at = this.opts.at(), ownId = this.opts.you()?.id;
        const nearby = this.opts.people().filter(person => person.id !== ownId && planetDistance(at, person) <= 12);
        const chat = document.getElementById("planet-chat"), chatting = !!chat && !chat.hidden;
        text(this.talk, nearby.length ? `Talk · ${nearby.length} nearby` : "Talk nearby");
        this.talk.setAttribute("aria-label", nearby.length ? `Talk with ${nearby.map(person => person.name).join(", ")}` : "Talk nearby; no friend within twelve metres yet");
        this.talk.setAttribute("aria-expanded", String(chatting));
        this.talk.hidden = !!document.querySelector("dialog:modal") || chatting;
        const heading = document.getElementById("planet-chat-to");if (heading) text(heading, nearby.length ? `Talk with ${nearby.map(person => person.name).join(", ")}` : "Talk nearby · no friend in range yet");
        for (const [id, words] of this.words) {
            if (words.expires <= performance.now()) { words.element.remove();this.words.delete(id);continue; }
            const person = id === ownId ? at : this.opts.people().find(person => person.id === id);
            const projected = person ? this.opts.project(person.x, person.z, 2.2) : null;
            words.element.hidden = !projected?.visible || !!document.querySelector("dialog:modal");
            if (projected?.visible) {words.element.style.left = `${projected.x}px`;words.element.style.top = `${projected.y}px`;}
        }
        this.renderRestroom();
    }
    dispose(): void {
        if (this.disposed) return;this.disposed = true;this.abort.abort();this.talk.remove();this.restroom.remove();this.tucked.remove();
        for (const words of this.words.values()) words.element.remove();this.words.clear();
    }
}
