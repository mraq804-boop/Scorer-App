import { t } from "@/lib/i18n";

type ScorerInvite = { email: string; player: string; team: string; site: string };

export function scorerInviteHref({ email, player, team, site }: ScorerInvite): string {
  const subject = t("team.squad.invite.subject", { team });
  const body = t("team.squad.invite.body", { name: player, team, url: `${site}/team`, email });
  const address = email.split("@").map(encodeURIComponent).join("@");
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
