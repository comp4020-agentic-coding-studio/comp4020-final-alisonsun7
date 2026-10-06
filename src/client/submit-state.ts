export interface Draft {
  category: string;
  title: string;
}

export type SubmitState =
  | { status: "idle" }
  | { status: "saving"; requestKey: string; draft: Draft }
  | { status: "saved" }
  | { status: "error"; requestKey: string; draft: Draft; message: string };

const sameDraft = (a: Draft, b: Draft): boolean => a.category === b.category && a.title === b.title;

// A retry of the same failed attempt (identical draft) reuses its request
// key, so an ambiguous network response can't create a duplicate idea; any
// other draft is a new intention and gets a fresh key.
export function startSubmit(prev: SubmitState, draft: Draft, newKey: () => string): SubmitState {
  if (prev.status === "error" && sameDraft(prev.draft, draft)) {
    return { status: "saving", requestKey: prev.requestKey, draft };
  }
  return { status: "saving", requestKey: newKey(), draft };
}

export const succeed = (): SubmitState => ({ status: "saved" });

export function fail(prev: SubmitState, message: string): SubmitState {
  if (prev.status !== "saving") throw new Error("fail() called outside a saving attempt");
  return { status: "error", requestKey: prev.requestKey, draft: prev.draft, message };
}
