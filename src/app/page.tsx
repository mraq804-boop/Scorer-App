import { AppBar } from "@/components/app/app-bar";
import { HomeTitle } from "@/components/app/home-title";
import { Copyright } from "@/components/copyright";
import { GuestSession } from "@/components/guest-session";
import { MatchList } from "@/components/match-list";
import { InstallCard, InstallIcon } from "@/components/pwa/install-app";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { TeamCacheRefresh } from "@/components/team/team-cache-refresh";

export default function Home() {
  return (
    <>
      <AppBar title={<HomeTitle />} actions={<InstallIcon />} />
      <main className="app-screen mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-5 pb-8">
        <MatchList />
        <InstallCard />
        <Copyright />
        <TeamCacheRefresh />
        <GuestSession />
        <PwaRegister />
      </main>
    </>
  );
}
