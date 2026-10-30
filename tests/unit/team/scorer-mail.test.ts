import { describe, expect, it } from "vitest";
import { scorerInviteHref } from "@/lib/team/scorer-mail";

describe("scorerInviteHref", () => {
  it("opens the email app addressed to the player with the team and how to sign in", () => {
    const href = scorerInviteHref({ email: "ali@gmail.com", player: "Ali Khan", team: "Lions & Co", site: "https://scorer.example" });
    const url = new URL(href);

    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("ali@gmail.com");
    expect(url.searchParams.get("subject")).toBe("Score Lions & Co matches");
    const body = url.searchParams.get("body") ?? "";
    expect(body).toContain("Hi Ali Khan");
    expect(body).toContain("https://scorer.example/team");
    expect(body).toContain("ali@gmail.com");
    expect(body).toContain("Tap Join");
  });

  it("keeps the address in the address part even with a plus sign", () => {
    const href = scorerInviteHref({ email: "ali+club@gmail.com", player: "Ali", team: "Lions", site: "https://scorer.example" });

    expect(href.startsWith("mailto:ali%2Bclub@gmail.com?subject=")).toBe(true);
    expect(decodeURIComponent(new URL(href).pathname)).toBe("ali+club@gmail.com");
  });
});
