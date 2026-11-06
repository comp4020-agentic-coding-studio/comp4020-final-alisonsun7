// A guide for someone new to the place: a short tour of the controls the
// first time they come in, then, the first time they reach each part of
// the place, a card saying what's there, what to try, and a button to the
// next part, so they find their way from the forest to the end of the pier.
// What they've seen is remembered in this browser only; if it can't be,
// they see it again, which does no harm.
import type { Room } from "./places.js";

const KEY = "soac-guide";

interface Seen {
  tour: boolean;
  places: string[];
}

function load(): Seen {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Seen> | null;
    return { tour: raw?.tour === true, places: Array.isArray(raw?.places) ? raw.places.filter((p) => typeof p === "string") : [] };
  } catch {
    return { tour: false, places: [] };
  }
}

function save(seen: Seen): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // private window or blocked storage: it's only a convenience
  }
}

interface Step {
  // the control it's about, outlined while the step shows
  target?: string;
  text: string;
  joinedOnly?: boolean;
}

const TOUR: Step[] = [
  { target: "#shared-sound-toggle", text: "This is a place we make by listening. Open Our soundscape to find what people have left, see who is here, and follow their sound conversations." },
  { text: "Walk with W A S D or the arrow keys, drag to look around, or click the floor to walk there. On a phone, use the stick." },
  { target: "#zones", text: "In Tools, Go to takes you straight to any part of the place, from the forest trail to the end of the pier." },
  { target: "#leave-sound", text: "Leave a sound where you stand, for everyone to hear. It stays after you go, until someone beside it removes it. Beside another person's sound, choose Reply with a sound to leave an answer.", joinedOnly: true },
  { target: "#sound-switch", text: "Turn the sound on or off here." },
  { text: "Other people here are cats and dogs with their names over them. Walk up to someone to talk." },
];

// What each part of the place offers, and where to go next. The café's
// three parts share one card.
interface Place {
  title: string;
  text: string;
  next?: { zone: string; label: string };
}

const PLACES: Record<string, Place> = {
  forest: {
    title: "The forest trail",
    text: "Follow the trail downhill to the creek. Listen for sounds someone has left among the pines, then leave Bird sounds or an answer of your own.",
    next: { zone: "creek", label: "Take me to the creek" },
  },
  creek: {
    title: "The creek",
    text: "Stand by the water and listen to what is already here. Leave a trickling stream, or answer a nearby sound before crossing the footbridge towards the sea.",
    next: { zone: "boardwalk", label: "Take me to the boardwalk" },
  },
  "forest-edge": {
    title: "The edge of the forest",
    text: "The trees thin out: the boardwalk and the sea are just ahead.",
    next: { zone: "boardwalk", label: "Take me to the boardwalk" },
  },
  boardwalk: {
    title: "The boardwalk",
    text: "Meet by the Corner Café and listen to Mateo's guitar. Leave a sound along the boardwalk or answer someone nearby. The toilets and showers lock while occupied; a red light means someone's in.",
    next: { zone: "counter", label: "Take me into the café" },
  },
  cafe: {
    title: "The Corner Café",
    text: "Make the café sound like a place people share: leave the espresso machine, café chatter or café music, or answer someone else's contribution. Outside, people hear it through the walls.",
    next: { zone: "beach", label: "Take me to the beach" },
  },
  beach: {
    title: "The beach",
    text: "Children are playing ball. Follow the shore, listen for shared sounds, and add waves or children playing to what someone else has made.",
    next: { zone: "pier", label: "Take me to the pier" },
  },
  pier: {
    title: "The pier",
    text: "Walk out over the water and listen back to the shore. Follow a contribution in Our soundscape, or leave something for the next person to discover.",
    next: { zone: "forest", label: "Back to the forest trail" },
  },
  shop: {
    title: "The souvenir shop",
    text: "Beach balls, buckets and spades, shells and snow globes. Have a look around.",
  },
};

const placeOf = (zone: string): string => (zone === "counter" || zone === "tables" || zone === "window" ? "cafe" : zone);

export class Guide {
  private seen = load();
  private card: HTMLDivElement | null = null;
  private started = false;
  private step = 0;
  private zone: string;

  constructor(
    private stage: HTMLElement,
    zone: string,
    private opts: { joined: () => boolean; goTo: (zone: string) => void; refocus: () => void },
  ) {
    this.zone = zone;
  }

  // Once they've come in: the tour if they haven't had it, then the card
  // for where they are.
  begin(): void {
    if (this.started) return;
    this.started = true;
    if (!this.seen.tour) this.showStep();
    else this.arrived(this.zone);
  }

  // They reached a part of the place (a zone id).
  arrived(zone: string): void {
    this.zone = zone;
    if (!this.started || !this.seen.tour) return;
    this.offer(placeOf(zone));
  }

  // They went into a room with a door; only the shop has a card (the
  // toilets and showers ask their own question).
  entered(room: Room | null): void {
    if (room?.id === "shop" && this.started && this.seen.tour) this.offer("shop");
  }

  private offer(id: string): void {
    const place = PLACES[id];
    if (!place || this.seen.places.includes(id)) return;
    this.seen.places.push(id);
    save(this.seen);
    const answers: [string, () => void][] = [];
    if (place.next) {
      const next = place.next;
      answers.push([next.label, () => this.opts.goTo(next.zone)]);
    }
    answers.push(["Got it", () => {}]);
    this.show(place.title, place.text, answers);
  }

  private showStep(): void {
    const steps = TOUR.filter((s) => !s.joinedOnly || this.opts.joined());
    const s = steps[this.step];
    for (const el of document.querySelectorAll(".guide-target")) el.classList.remove("guide-target");
    if (!s) return this.finish();
    if (s.target) document.querySelector(s.target)?.classList.add("guide-target");
    const last = this.step === steps.length - 1;
    this.show(`${this.step + 1} of ${steps.length}`, s.text, [
      [last ? "Start exploring" : "Next", () => {
        this.step++;
        this.showStep();
      }],
      ...(last ? [] : ([["Skip the tour", () => this.finish()]] as [string, () => void][])),
    ]);
  }

  private finish(): void {
    for (const el of document.querySelectorAll(".guide-target")) el.classList.remove("guide-target");
    this.card?.remove();
    this.card = null;
    this.seen.tour = true;
    save(this.seen);
    this.arrived(this.zone);
  }

  private show(title: string, text: string, answers: [string, () => void][]): void {
    this.card?.remove();
    const card = document.createElement("div");
    card.className = "guide-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", title);
    const h = document.createElement("p");
    h.className = "guide-title";
    h.textContent = title;
    const p = document.createElement("p");
    p.textContent = text;
    const row = document.createElement("div");
    row.className = "prompt-actions";
    answers.forEach(([label, act], i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = i === 0 ? "btn primary" : "btn";
      b.textContent = label;
      b.onclick = () => {
        if (this.card === card) this.card = null;
        card.remove();
        act();
        this.opts.refocus();
      };
      row.append(b);
    });
    card.append(h, p, row);
    this.stage.append(card);
    this.card = card;
  }
}
