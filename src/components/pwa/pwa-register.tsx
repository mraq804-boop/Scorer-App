"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let acceptedUpdate = false;

    const offerUpdate = (worker: ServiceWorker) =>
      toast(t("pwa.updateReady"), {
        duration: Infinity,
        action: {
          label: t("pwa.reload"),
          onClick: () => {
            acceptedUpdate = true;
            worker.postMessage("SKIP_WAITING");
          },
        },
      });

    const onControllerChange = () => {
      if (acceptedUpdate) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let onVisible: (() => void) | undefined;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const next = registration.installing;
          next?.addEventListener("statechange", () => {
            if (next.state === "installed" && navigator.serviceWorker.controller) offerUpdate(next);
          });
        });
        onVisible = () => {
          if (document.visibilityState === "visible") registration.update().catch(() => undefined);
        };
        document.addEventListener("visibilitychange", onVisible);
      })
      .catch((error) => console.warn("Service worker registration failed", error));

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
