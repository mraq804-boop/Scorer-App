import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { CachedTeam } from "@/lib/local/db";
import { CORS, TINY_PNG, fulfillJson } from "./support/fake-sync";
import { ALI, fakeAccount, openNewMatch, team, waitForSession } from "./support/team";

type Storage = { uploads: string[]; bodies: Buffer[]; removed: string[] };
type Rgb = [number, number, number];

async function signIn(page: Page, server: CachedTeam) {
  await fakeAccount(page, "google", server);
  await openNewMatch(page);
  await waitForSession(page);
}

async function stubStorage(page: Page): Promise<Storage> {
  const storage: Storage = { uploads: [], bodies: [], removed: [] };
  await page.route("**/storage/v1/object/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (request.method() === "GET") return route.fulfill({ body: TINY_PNG, contentType: "image/png", headers: CORS });
    if (request.method() === "DELETE") {
      storage.removed.push(...((request.postDataJSON() as { prefixes: string[] }).prefixes ?? []));
      return fulfillJson(route, []);
    }
    storage.uploads.push(new URL(request.url()).pathname.replace("/storage/v1/object/team-media/", ""));
    storage.bodies.push(request.postDataBuffer() ?? Buffer.alloc(0));
    return fulfillJson(route, { Key: "team-media/x", Id: "1" });
  });
  return storage;
}

async function stubRpc(page: Page, name: string, status = 200) {
  const calls: unknown[] = [];
  await page.route(`**/rest/v1/rpc/${name}`, (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    calls.push(route.request().postDataJSON());
    if (status === 200) return fulfillJson(route, null);
    return route.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify({ message: "boom" }) });
  });
  return calls;
}

async function drawPicture(page: Page, left: string, right = left): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const data = await page.evaluate(
    ({ left, right }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 100;
      const context = canvas.getContext("2d") as CanvasRenderingContext2D;
      context.fillStyle = left;
      context.fillRect(0, 0, 200, 100);
      context.fillStyle = right;
      context.fillRect(200, 0, 200, 100);
      return canvas.toDataURL("image/png").split(",")[1] ?? "";
    },
    { left, right },
  );
  return { name: "wide.png", mimeType: "image/png", buffer: Buffer.from(data, "base64") };
}

function savedJpeg(body: Buffer | undefined): Buffer {
  if (body === undefined) throw new Error("nothing uploaded");
  return body.subarray(body.indexOf(Buffer.from([0xff, 0xd8, 0xff])), body.lastIndexOf(Buffer.from([0xff, 0xd9])) + 2);
}

async function pixels(page: Page, jpeg: Buffer, points: [number, number][]): Promise<Rgb[]> {
  return page.evaluate(
    async ({ data, points }) => {
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d") as CanvasRenderingContext2D;
      context.drawImage(bitmap, 0, 0);
      return points.map(([x, y]) => {
        const [r = 0, g = 0, b = 0] = context.getImageData(x, y, 1, 1).data;
        return [r, g, b] as [number, number, number];
      });
    },
    { data: jpeg.toString("base64"), points },
  );
}

function hex(colour: string): Rgb {
  return [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16)) as Rgb;
}

function expectNear(actual: Rgb | undefined, colour: string) {
  const expected = hex(colour);
  expect(actual, `expected about ${colour}`).toBeDefined();
  actual?.forEach((value, index) => expect(Math.abs(value - (expected[index] ?? 0)), `${colour} vs ${actual.join(",")}`).toBeLessThan(20));
}

const picture = { name: "logo.png", mimeType: "image/png", buffer: TINY_PNG };
const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
const VERSION = Math.floor((NOW - Date.UTC(2026, 0, 1)) / 1000);
const RED = "#dc2626";
const BLUE = "#1d4ed8";
const CRIMSON = "#A32D2D";

test("an owner picks a colour and uploads a logo", async ({ page }) => {
  await signIn(page, team());
  const storage = await stubStorage(page);
  const colours = await stubRpc(page, "set_team_colour");
  const logos = await stubRpc(page, "set_team_logo");
  await page.clock.setFixedTime(NOW);
  await page.goto("/team?section=settings");
  const look = page.getByRole("region", { name: "Team look" });

  await look.getByRole("radio", { name: "Ocean" }).click();
  await expect.poll(() => colours).toEqual([{ p_colour: "ocean" }]);

  await look.getByLabel("Upload logo").setInputFiles(picture);
  const sheet = page.getByRole("dialog", { name: "Adjust logo" });
  await expect(sheet.getByText("How it will look")).toBeVisible();
  await sheet.getByRole("button", { name: "Use this" }).click();

  await expect.poll(() => logos).toEqual([{ p_version: VERSION }]);
  expect(storage.uploads).toEqual([`teams/abcd2345/logo-${VERSION}.jpg`]);
  await expect(sheet).toHaveCount(0);
});

test("an owner adds a player photo", async ({ page }) => {
  await signIn(page, team());
  const storage = await stubStorage(page);
  const photos = await stubRpc(page, "set_player_photo");
  await page.clock.setFixedTime(NOW);
  await page.goto("/team");

  await page.getByRole("region", { name: "Squad" }).getByLabel("Add a photo of Ali").setInputFiles(picture);
  await page.getByRole("dialog", { name: "Adjust photo" }).getByRole("button", { name: "Use this" }).click();

  await expect.poll(() => photos).toEqual([{ p_player: ALI, p_version: VERSION }]);
  expect(storage.uploads).toEqual([`teams/abcd2345/players/${ALI}-${VERSION}.jpg`]);
});

test("cancelling the adjust sheet keeps the old logo and uploads nothing", async ({ page }) => {
  await signIn(page, team({ logoVersion: 2 }));
  const storage = await stubStorage(page);
  const logos = await stubRpc(page, "set_team_logo");
  await page.goto("/team?section=settings");
  const look = page.getByRole("region", { name: "Team look" });

  await look.getByLabel("Change logo").setInputFiles(picture);
  const sheet = page.getByRole("dialog", { name: "Adjust logo" });
  await sheet.getByRole("button", { name: "Cancel" }).click();

  await expect(sheet).toHaveCount(0);
  expect(storage.uploads).toEqual([]);
  expect(logos).toEqual([]);
  await expect(look.getByRole("img", { name: "Lions logo" })).toHaveAttribute("src", /\/teams\/abcd2345\/logo-2\.jpg$/);
});

test("a logo zoomed all the way out fits whole, with the team colour around it", async ({ page }) => {
  await signIn(page, team({ colour: "crimson" }));
  const storage = await stubStorage(page);
  const logos = await stubRpc(page, "set_team_logo");
  await page.goto("/team?section=settings");

  await page.getByRole("region", { name: "Team look" }).getByLabel("Upload logo").setInputFiles(await drawPicture(page, BLUE));
  const sheet = page.getByRole("dialog", { name: "Adjust logo" });
  await sheet.getByRole("slider", { name: "Zoom" }).press("Home");
  await sheet.getByRole("button", { name: "Use this" }).click();
  await expect.poll(() => logos.length).toBe(1);

  const [top, centre, bottom] = await pixels(page, savedJpeg(storage.bodies[0]), [
    [256, 24],
    [256, 256],
    [256, 488],
  ]);
  expectNear(top, CRIMSON);
  expectNear(centre, BLUE);
  expectNear(bottom, CRIMSON);
});

test("dragging the picture changes what is saved", async ({ page }) => {
  await signIn(page, team());
  const storage = await stubStorage(page);
  const logos = await stubRpc(page, "set_team_logo");
  await page.goto("/team?section=settings");

  await page.getByRole("region", { name: "Team look" }).getByLabel("Upload logo").setInputFiles(await drawPicture(page, RED, BLUE));
  const sheet = page.getByRole("dialog", { name: "Adjust logo" });
  const box = await sheet.getByRole("group", { name: "Picture position" }).boundingBox();
  if (box === null) throw new Error("no picture area");
  for (let drag = 0; drag < 3; drag += 1) {
    await page.mouse.move(box.x + 50, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 230, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
  }
  await sheet.getByRole("button", { name: "Use this" }).click();
  await expect.poll(() => logos.length).toBe(1);

  const [left, right] = await pixels(page, savedJpeg(storage.bodies[0]), [
    [40, 256],
    [470, 256],
  ]);
  expectNear(left, RED);
  expectNear(right, RED);
});

test("the arrow keys move the picture", async ({ page }) => {
  await signIn(page, team());
  const storage = await stubStorage(page);
  await stubRpc(page, "set_team_logo");
  await page.goto("/team?section=settings");

  await page.getByRole("region", { name: "Team look" }).getByLabel("Upload logo").setInputFiles(await drawPicture(page, RED, BLUE));
  const sheet = page.getByRole("dialog", { name: "Adjust logo" });
  const area = sheet.getByRole("group", { name: "Picture position" });
  await area.focus();
  for (let press = 0; press < 40; press += 1) await area.press("ArrowLeft");
  await sheet.getByRole("button", { name: "Use this" }).click();
  await expect.poll(() => storage.bodies.length).toBe(1);

  const [left, right] = await pixels(page, savedJpeg(storage.bodies[0]), [
    [40, 256],
    [470, 256],
  ]);
  expectNear(left, BLUE);
  expectNear(right, BLUE);
});

test("a failed save keeps the old logo", async ({ page }) => {
  await signIn(page, team({ logoVersion: 2 }));
  const storage = await stubStorage(page);
  await stubRpc(page, "set_team_logo", 500);
  await page.clock.setFixedTime(NOW);
  await page.goto("/team?section=settings");
  const look = page.getByRole("region", { name: "Team look" });
  await expect(look.getByRole("img", { name: "Lions logo" })).toHaveAttribute("src", /\/teams\/abcd2345\/logo-2\.jpg$/);

  await look.getByLabel("Change logo").setInputFiles(picture);
  await page.getByRole("dialog", { name: "Adjust logo" }).getByRole("button", { name: "Use this" }).click();

  await expect(look.getByRole("alert")).toBeVisible();
  expect(storage.uploads).toEqual([`teams/abcd2345/logo-${VERSION}.jpg`]);
  expect(storage.removed).toEqual([]);
  await expect(look.getByRole("img", { name: "Lions logo" })).toHaveAttribute("src", /\/teams\/abcd2345\/logo-2\.jpg$/);
});

test("a picture that can't be read says so without opening the adjust sheet", async ({ page }) => {
  await signIn(page, team());
  const storage = await stubStorage(page);
  await page.goto("/team?section=settings");
  const look = page.getByRole("region", { name: "Team look" });

  await look.getByLabel("Upload logo").setInputFiles({ name: "notes.png", mimeType: "image/png", buffer: Buffer.from("not a picture") });

  await expect(look.getByRole("alert")).toContainText("Couldn't read that picture");
  await expect(page.getByRole("dialog", { name: "Adjust logo" })).toHaveCount(0);
  expect(storage.uploads).toEqual([]);
});

test("a scorer sees no brand controls", async ({ page }) => {
  await signIn(page, team({ role: "scorer" }));
  await page.goto("/team");

  await expect(page.getByText("You score for this team")).toBeVisible();
  await expect(page.getByRole("region", { name: "Team look" })).toHaveCount(0);
  await expect(page.getByLabel(/^Add a photo of/)).toHaveCount(0);
});

test("a photo that won't load shows the player's initials instead of a broken image", async ({ page }) => {
  const base = team();
  await signIn(page, team({ squad: base.squad.map((player) => (player.id === ALI ? { ...player, photoVersion: 5 } : player)) }));
  await page.route("**/storage/v1/object/public/**", (route) => route.fulfill({ status: 404, headers: CORS, body: "" }));
  await page.goto("/team");
  const squad = page.getByRole("region", { name: "Squad" });

  await expect(squad.getByLabel("Change the photo of Ali")).toBeAttached();
  await expect(squad.locator(`img[src*="players/${ALI}-5.jpg"]`)).toHaveCount(0);
  await expect(squad.getByText("A", { exact: true })).toBeVisible();
});

test("a photo is removed from the Edit player sheet", async ({ page }) => {
  const base = team();
  await signIn(page, team({ squad: base.squad.map((player) => (player.id === ALI ? { ...player, photoVersion: 5 } : player)) }));
  await stubStorage(page);
  const photos = await stubRpc(page, "set_player_photo");
  await page.goto("/team");

  await page.getByRole("region", { name: "Squad" }).getByRole("button", { name: "Edit Ali" }).click();
  await page.getByRole("dialog", { name: "Edit player" }).getByRole("button", { name: "Remove photo" }).click();

  await expect.poll(() => photos).toEqual([{ p_player: ALI, p_version: null }]);
  await expect(page.getByRole("dialog", { name: "Edit player" })).toHaveCount(0);
});

test("a failed photo removal says so inside the Edit player sheet", async ({ page }) => {
  const base = team();
  await signIn(page, team({ squad: base.squad.map((player) => (player.id === ALI ? { ...player, photoVersion: 5 } : player)) }));
  await stubStorage(page);
  await stubRpc(page, "set_player_photo", 500);
  await page.goto("/team");

  await page.getByRole("region", { name: "Squad" }).getByRole("button", { name: "Edit Ali" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit player" });
  await sheet.getByRole("button", { name: "Remove photo" }).click();

  await expect(sheet.getByRole("alert")).toBeVisible();
});
