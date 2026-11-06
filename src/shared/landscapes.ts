// Scenic destinations within the existing shared world, never separate rooms.
export interface Landscape {
  zoneId: string;
  label: string;
  kind: string;
  detail: string;
}

export const LANDSCAPES: readonly Landscape[] = [
  { zoneId: "forest", label: "Forest trail", kind: "Under the pines", detail: "A quiet trail between tall trees and ferns." },
  { zoneId: "creek", label: "Creek & footbridge", kind: "Cross the water", detail: "A timber bridge on the way down to the shore." },
  { zoneId: "forest-edge", label: "Forest edge", kind: "First sight of the sea", detail: "Where pine shade opens into coastal grass." },
  { zoneId: "boardwalk", label: "Boardwalk", kind: "Along the shore", detail: "Little shops, beach huts and familiar faces." },
  { zoneId: "beach", label: "Beach", kind: "Beside the water", detail: "Open sand with a view across the bay." },
  { zoneId: "pier", label: "Pier", kind: "Out over the bay", detail: "Walk above the water and look back at the shore." },
  { zoneId: "counter", label: "Café counter", kind: "Come inside", detail: "The espresso cart and pastries at the counter." },
  { zoneId: "tables", label: "Café tables", kind: "Stay a little", detail: "Round tables under warm hanging lamps." },
  { zoneId: "window", label: "Café window", kind: "Watch the shore", detail: "A place by the glass, facing the sea." },
];
