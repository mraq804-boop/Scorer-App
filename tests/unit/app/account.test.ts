import { describe, expect, it } from "vitest";
import { displayName } from "@/lib/app/account";

describe("displayName", () => {
  it("shows the Google name, never the email", () => {
    expect(displayName({ full_name: " Abdul Qadeer " })).toBe("Abdul Qadeer");
    expect(displayName({ name: "AQ" })).toBe("AQ");
    expect(displayName({ email: "a@b.c" })).toBeNull();
    expect(displayName({ full_name: "  " })).toBeNull();
    expect(displayName(undefined)).toBeNull();
  });
});
