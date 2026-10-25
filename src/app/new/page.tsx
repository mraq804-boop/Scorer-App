import { PwaRegister } from "@/components/pwa/pwa-register";
import { t } from "@/lib/i18n";

export default function NewMatchPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-3xl font-bold">{t("home.newMatch")}</h1>
      <PwaRegister />
    </main>
  );
}
