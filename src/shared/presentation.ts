// The author retained 3D. Old comparison links find the same existing room.
export const PRESENTATIONS = ["3d"] as const;
export type Presentation = typeof PRESENTATIONS[number];
export const presentation = (_value: unknown): Presentation => "3d";
export const presentationHref = (_view: Presentation): string => "/planet";
export const presentationLabel = (_view: Presentation): string => "3D Little planet";

// No new room, identity or position handoff. Preserve work/place query context
// while removing only the retired view selector, always to a same-site path.
export function retiredPresentationHref(url: URL): string | null {
  const alias = ["/2d", "/2.5d", "/planet/flat", "/planet/2d", "/planet/2.5d"].includes(url.pathname);
  if (!alias && !(["/planet", "/scene/planet"].includes(url.pathname) && url.searchParams.has("view"))) return null;
  const query = new URLSearchParams(url.searchParams);query.delete("view");
  return "/planet" + (query.size ? "?" + query.toString() : "");
}
