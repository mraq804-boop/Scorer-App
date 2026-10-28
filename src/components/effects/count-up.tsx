"use client";

import { useEffect, useRef, useState } from "react";
import { browserEffectsEnabled, countUpStep } from "./motion";

const DURATION_MS = 600;

export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (element === null || value === 0 || !browserEffectsEnabled() || typeof IntersectionObserver === "undefined") return;
    let frame = 0;
    let firstLook = true;
    const observer = new IntersectionObserver((entries) => {
      const step = countUpStep(firstLook, entries.some((entry) => entry.isIntersecting));
      firstLook = false;
      if (step === "wait") return;
      if (step === "zero") {
        setShown(0);
        return;
      }
      observer.disconnect();
      if (step === "pulse") {
        setPulse(true);
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / DURATION_MS);
        setShown(Math.round(value * (1 - (1 - progress) ** 3)));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <span ref={ref} className={pulse ? "tile-pulse inline-block" : undefined}>
      {shown}
    </span>
  );
}
