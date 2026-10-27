import { t } from "@/lib/i18n";

export function Copyright() {
  return <footer className="pt-2 text-center text-xs text-muted-foreground">{t("app.copyright")}</footer>;
}
