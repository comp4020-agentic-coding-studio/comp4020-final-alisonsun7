// The wire shapes between server and client: SSE (server → client) plus JSON
// POSTs (client → server). With sound taken out (ADR 010), a place's live
// state is who is there, where they stand, and what they say.

export type Avatar = "cat" | "dog";
export const AVATARS: Avatar[] = ["cat", "dog"];

// A person as others see them in one place: participant id, never the user
// id or anything from their cookie.
export interface Person {
  id: string;
  name: string;
  avatar: Avatar;
}

// Sent on every (re)connect.
export interface Snapshot {
  type: "snapshot";
  sessionId: string;
  sceneId: string;
  serverNow: string;
  online: Person[];
  you: Person | null; // null for someone looking before they've joined
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

export type ServerMessage = Snapshot | Presence | Moves | Said;
