import { describe, it, expect } from "vitest";
import { invitationHref, invitationWork } from "../src/shared/chorus-invitation.js";
describe("a public work invitation", () => {
  it("keeps only an existing-work identifier, never a redirect or credential", () => {
    expect(invitationHref("sound-123")).toBe("/planet?work=sound-123");
    expect(invitationHref("sound-123", "/planet?view=2d")).toBe("/planet?view=2d&work=sound-123");
    for (const value of [null, "", "https://other.test", "../../secret", "a&user=other", "x".repeat(97)]) {
      expect(invitationWork(value)).toBeNull();expect(invitationHref(value)).toBe("/planet");
    }
  });
});
