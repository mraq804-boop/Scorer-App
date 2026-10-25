"use client";

import { useId } from "react";

type Option<T extends string | number> = { value: T; label: string };

type SegmentedControlProps<T extends string | number> = {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string | number>({ label, value, options, onChange }: SegmentedControlProps<T>) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span id={`${id}-label`} className="text-sm font-medium">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex gap-1 rounded-xl bg-muted p-1">
        {options.map((option) => (
          <label key={option.value} className="relative flex min-w-0 flex-1">
            <input
              type="radio"
              name={id}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-lg opacity-0"
            />
            <span className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/60">
              <span dir="auto" className="min-w-0 truncate">
                {option.label}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
