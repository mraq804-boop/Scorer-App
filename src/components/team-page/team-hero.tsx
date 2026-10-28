import { Confetti } from "@/components/effects/confetti";
import { CountUp } from "@/components/effects/count-up";
import { colourFor, logoUrl } from "@/lib/brand";
import type { TeamColour } from "@/lib/brand";
import { t } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import type { FormResult, TeamPageData, TeamRecord } from "@/lib/team";
import { Avatar } from "./avatar";
import { OutcomePill } from "./match-list";

const GOLD = "#e2a322";

export function HeroStripes({ colour }: { colour: TeamColour }) {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: colour.dark, clipPath: "polygon(60% 0, 100% 0, 100% 100%, 34% 100%)" }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: GOLD, clipPath: "polygon(57% 0, 60% 0, 34% 100%, 31% 100%)" }}
      />
    </>
  );
}

type TeamHeroProps = { page: TeamPageData; record: TeamRecord; form: FormResult[] };

export function TeamHero({ page, record, form }: TeamHeroProps) {
  const { team } = page;
  const colour = colourFor(team.colour, team.name);
  const tiles: [MessageKey, number][] = [
    ["teamPage.tile.played", record.played],
    ["teamPage.tile.won", record.won],
    ["teamPage.tile.lost", record.lost],
    ...(record.tied > 0 ? [["teamPage.tile.tied", record.tied] as [MessageKey, number]] : []),
    ["teamPage.tile.noResult", record.noResult],
  ];
  return (
    <header className="relative -mx-4 -mt-6 overflow-hidden px-4 pt-7 pb-5" style={{ background: colour.base, color: colour.on }}>
      <HeroStripes colour={colour} />
      {form[0] === "won" && <Confetti colours={[GOLD, colour.light, "#D4537E", "#5DCAA5"]} />}
      <div className="relative flex items-center gap-4">
        <Avatar
          name={team.name}
          url={logoUrl(team.code, team.logoVersion)}
          size={76}
          colour={colour}
          alt={t("brand.logoAlt", { name: team.name })}
          className="ring-4 ring-haldi"
        />
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-3xl font-extrabold">
            <bdi>{team.name}</bdi>
          </h1>
          {team.homeGround !== null && (
            <p className="truncate text-sm font-medium">
              <bdi>{team.homeGround}</bdi>
            </p>
          )}
        </div>
      </div>
      <dl
        className="relative mt-5 grid gap-2 text-center"
        style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}
      >
        {tiles.map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse rounded-xl bg-black/25 py-2">
            <dt className="text-xs font-semibold">{t(label)}</dt>
            <dd className="num text-2xl font-extrabold">
              <CountUp value={value} />
            </dd>
          </div>
        ))}
      </dl>
      {form.length > 0 && (
        <div className="relative mt-4 flex items-center gap-2">
          <span className="text-sm font-semibold">{t("teamPage.form")}</span>
          <ol data-testid="form-strip" className="flex gap-1.5">
            {form.map((result, index) => (
              <li key={index} className="rounded-full ring-2 ring-white/80">
                <OutcomePill outcome={result} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </header>
  );
}
