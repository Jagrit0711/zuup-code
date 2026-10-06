import { ChevronDown } from "lucide-react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

/**
 * Building blocks for the settings dialog: a row (label and one-line description on the left,
 * the control on the right) and the quiet controls that go in it.
 */

interface RowProps {
  label: string;
  description?: ReactNode;
  /** Id of the control, so clicking the label focuses it. */
  htmlFor?: string;
  /** Id for the label text, for controls labelled with aria-labelledby. */
  labelId?: string;
  descriptionId?: string;
  children: ReactNode;
}

export const SettingRow = ({ label, description, htmlFor, labelId, descriptionId, children }: RowProps) => (
  <div className="flex flex-col gap-2.5 border-b border-rule py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
    <div className="min-w-0 max-w-[26rem]">
      {htmlFor ? (
        <label id={labelId} htmlFor={htmlFor} className="block text-[13px] font-medium text-foreground">
          {label}
        </label>
      ) : (
        <div id={labelId} className="text-[13px] font-medium text-foreground">
          {label}
        </div>
      )}
      {description ? (
        <p id={descriptionId} className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
    <div className="flex shrink-0 items-center">{children}</div>
  </div>
);

export const SectionHeading = ({ children, note }: { children: ReactNode; note?: ReactNode }) => (
  <div className="mb-1">
    <h3 className="text-[15px] font-semibold text-foreground">{children}</h3>
    {note ? <p className="mt-0.5 text-[12px] text-muted-foreground">{note}</p> : null}
  </div>
);

/** A monochrome switch: rose is kept for the primary action and the active indicator. */
export const Toggle = ({
  id,
  checked,
  onCheckedChange,
  describedBy,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  describedBy?: string;
}) => (
  <SwitchPrimitive.Root
    id={id}
    checked={checked}
    onCheckedChange={onCheckedChange}
    aria-describedby={describedBy}
    className="peer relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-rule transition-colors duration-150 data-[state=checked]:border-transparent data-[state=checked]:bg-foreground/85 data-[state=unchecked]:bg-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-raised motion-reduce:transition-none"
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-3 w-3 rounded-full transition-transform duration-150 data-[state=checked]:translate-x-[15px] data-[state=checked]:bg-ink data-[state=unchecked]:translate-x-[2px] data-[state=unchecked]:bg-muted-foreground motion-reduce:transition-none" />
  </SwitchPrimitive.Root>
);

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

/** A single-choice row of buttons in one hairline frame. Arrow keys move the choice. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  labelledBy,
  mono,
}: {
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  labelledBy?: string;
  mono?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className="inline-flex h-8 items-stretch rounded-md border border-rule bg-ink p-0.5"
    >
      {options.map((o, i) => {
        const selected = i === index;
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-w-[2.25rem] rounded-[5px] px-2.5 text-[12px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
              mono && "font-mono",
              selected ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Native select (accessible, works with every input method) dressed as a design-system input. */
export function Select<T extends string | number>({
  id,
  value,
  options,
  onChange,
  describedBy,
  className,
}: {
  id: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  describedBy?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-44", className)}>
      <select
        id={id}
        value={String(value)}
        aria-describedby={describedBy}
        onChange={(e) => {
          const hit = options.find((o) => String(o.value) === e.target.value);
          if (hit) onChange(hit.value);
        }}
        className="h-8 w-full cursor-pointer appearance-none rounded-md border border-rule bg-ink pl-2.5 pr-8 text-[13px] text-foreground transition-colors hover:border-faint focus-visible:border-primary/60 focus-visible:outline-none"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)} className="bg-raised">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

/** − 14 px + : a number with step buttons. Typing a number works too. */
export const Stepper = ({
  id,
  value,
  min,
  max,
  unit,
  onChange,
  describedBy,
  label,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
  describedBy?: string;
  /** Accessible name for the step buttons, e.g. "font size". */
  label: string;
}) => {
  const unitId = useId();
  const step = (d: number) => onChange(Math.min(max, Math.max(min, value + d)));
  const btn =
    "flex w-8 items-center justify-center text-[15px] leading-none text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary";
  return (
    <div className="inline-flex h-8 items-stretch overflow-hidden rounded-md border border-rule bg-ink">
      <button type="button" className={btn} onClick={() => step(-1)} disabled={value <= min} aria-label={`Decrease ${label}`}>
        −
      </button>
      <div className="flex items-center border-x border-rule px-1">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          aria-describedby={[describedBy, unit ? unitId : undefined].filter(Boolean).join(" ") || undefined}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))));
          }}
          className="w-8 bg-transparent text-center text-[13px] tabular-nums text-foreground [appearance:textfield] focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {unit ? (
          <span id={unitId} className="pr-1 text-[12px] text-faint">
            {unit}
          </span>
        ) : null}
      </div>
      <button type="button" className={btn} onClick={() => step(1)} disabled={value >= max} aria-label={`Increase ${label}`}>
        +
      </button>
    </div>
  );
};
