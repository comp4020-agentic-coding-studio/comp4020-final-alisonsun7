// The wire shapes between server and client: SSE (server → client) plus JSON
// POSTs (client → server). A place's live state is who is there, where they
// stand, what they say, and the sounds people have left in it (ADR 011).

export type Avatar = "cat" | "dog";
export const AVATARS: Avatar[] = ["cat", "dog"];

export interface Position {
  x: number;
  z: number;
  yaw: number;
}

// A private hut is claimed by the first accepted move into it. A rejected
// page returns to its last accepted position (or the door on first arrival).
export type MoveResult =
  | { ok: true }
  | { ok: false; code: "hut_taken"; hutId: string; position: Position }
  | { ok: false; code: "no_session" | "bad_request" };

// A person as others see them in one place: participant id, never the user
// id or anything from their cookie.
export interface Person {
  id: string;
  name: string;
  avatar: Avatar;
}

// A sound someone left, where they stood when they left it (ADR 011).
export interface PlacedSound {
  id: string;
  soundId: string;
  x: number;
  z: number;
  by: string; // the name of whoever left it
  byId: string; // their participant id
  at: string; // when, ISO
  // the toilet or shower it was left in, if it lasts only while they're
  // inside (ADR 013)
  whileIn?: string;
}

// Sent on every (re)connect.
export interface Snapshot {
  type: "snapshot";
  sessionId: string;
  sceneId: string;
  serverNow: string;
  online: Person[];
  you: Person | null; // null for someone looking before they've joined
  sounds: PlacedSound[];
}

export interface Presence {
  type: "presence";
  sessionId: string;
  online: Person[];
}

// Where everyone who has joined is standing, a few times a second. Never
// stored.
export interface Moves {
  type: "moves";
  sessionId: string;
  people: (Person & { x: number; z: number; yaw: number })[];
}

// Something someone said, sent only to people standing near them. Never
// stored.
export interface Said {
  type: "said";
  sessionId: string;
  by: string; // participant id
  name: string;
  text: string;
}

export interface SoundLeft {
  type: "sound-left";
  sessionId: string;
  sound: PlacedSound;
}

export interface SoundRemoved {
  type: "sound-removed";
  sessionId: string;
  id: string;
  soundId: string;
  by: string; // the name of whoever removed it
  byId: string;
  // it went because whoever left it came out of the toilet or shower
  // (ADR 013), rather than because someone removed it
  left?: boolean;
}

export type ServerMessage = Snapshot | Presence | Moves | Said | SoundLeft | SoundRemoved;
