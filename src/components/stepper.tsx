import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

type StepperProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

export function Stepper({ label, value, min, max, onChange }: StepperProps) {
  return (
    <div role="group" aria-label={label} className="flex min-h-12 items-center justify-between gap-4">
      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="outline"
          className="size-11 rounded-xl"
          aria-label={t("setup.decrease", { label })}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Minus aria-hidden />
        </Button>
        <span aria-live="polite" className="num w-9 text-center text-base font-semibold">
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          className="size-11 rounded-xl"
          aria-label={t("setup.increase", { label })}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus aria-hidden />
        </Button>
      </div>
    </div>
  );
}
