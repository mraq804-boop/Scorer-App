import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppBar } from "@/components/app/app-bar";

describe("AppBar", () => {
  it("renders a heading with back and actions", () => {
    const html = renderToStaticMarkup(
      createElement(AppBar, { title: "My team", heading: true, back: "/", actions: createElement("button", null, "Share") }),
    );
    expect(html).toContain("<h1");
    expect(html).toContain('href="/"');
    expect(html).toContain('aria-label="Back"');
    expect(html).toContain("Share");
  });

  it("a 40-character Urdu title truncates inside bdi", () => {
    const title = "لاہور قلندرز کرکٹ کلب گلبرگ لاہور پاکستان".slice(0, 40);
    const html = renderToStaticMarkup(createElement(AppBar, { title }));
    expect(html).toContain('<bdi class="truncate');
    expect(html).not.toContain("<h1");
  });
});
