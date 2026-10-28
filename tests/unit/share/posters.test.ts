import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { PREVIEW_SIZE, PreviewImage } from "@/server/share/preview-image";
import { renderPng } from "@/server/share/render";
import { RESULT_POSTER_SIZE, ResultPoster } from "@/server/share/result-poster";
import { TestMatch } from "../../helpers/match";

const OUT = join(tmpdir(), "cricket-posters");
const PNG = [0x89, 0x50, 0x4e, 0x47];

async function png(name: string, element: ReactElement, size: { width: number; height: number }): Promise<Uint8Array> {
  const bytes = new Uint8Array(await (await renderPng(element, size, "no-store")).arrayBuffer());
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.png`), bytes);
  return bytes;
}

function finishedMatch(teams?: [string, string], openers?: [string, string]): TestMatch {
  const m = new TestMatch({ overs: 1, teams, openers });
  for (const runs of [4, 6, 1, 0, 2, 0]) m.ball({ runs, boundary: runs >= 4 });
  m.endInnings("overs");
  m.startInnings2(["Zain", "Faisal"], openers?.[1] ?? "Usman");
  for (const runs of [1, 0, 0, 0, 0, 0]) m.ball({ runs });
  m.endInnings("overs");
  return m;
}

describe("match posters", { timeout: 30_000 }, () => {
  it("posters render without any brand", async () => {
    const bytes = await png("result-plain", createElement(ResultPoster, { state: finishedMatch().state, brand: null }), RESULT_POSTER_SIZE);
    expect([...bytes.slice(0, 4)]).toEqual(PNG);
    expect(RESULT_POSTER_SIZE).toEqual({ width: 1080, height: 1350 });
  });

  it("posters render a 40-character Urdu name", async () => {
    const long = "لاہور قلندرز کرکٹ کلب گلبرگ لاہور پاکستان".slice(0, 40);
    const state = finishedMatch([long, "کراچی کنگز"], ["محمد عبدالقادر خان صاحب لاہور والے کھلاڑی", "عثمان"]).state;
    const bytes = await png("result-urdu", createElement(ResultPoster, { state, brand: null }), RESULT_POSTER_SIZE);
    expect([...bytes.slice(0, 4)]).toEqual(PNG);
  });

  it("the preview renders for a match in progress", async () => {
    const m = new TestMatch();
    m.ball({ runs: 4, boundary: true });
    const bytes = await png("preview-live", createElement(PreviewImage, { state: m.state, brand: null }), PREVIEW_SIZE);
    expect([...bytes.slice(0, 4)]).toEqual(PNG);
  });
});
