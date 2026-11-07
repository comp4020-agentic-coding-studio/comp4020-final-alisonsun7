// Presentation is a local lens on planet:morning, never a room or coordinate system.
export const PRESENTATIONS = ["2d", "2.5d", "3d"] as const;
export type Presentation = typeof PRESENTATIONS[number];
export const presentation = (value: unknown): Presentation => PRESENTATIONS.includes(value as Presentation) ? value as Presentation : "3d";
export const presentationHref = (view: Presentation): string => view === "3d" ? "/planet" : `/planet?view=${view}`;
export const presentationLabel = (view: Presentation): string => view === "2d" ? "2D Storybook" : view === "2.5d" ? "2.5D Paper theatre" : "3D Little planet";
