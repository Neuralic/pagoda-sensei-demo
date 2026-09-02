"use client";

import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BUDGET_OPTIONS,
  CAMBODIA_EXPERIENCES,
  CHINA_EXPERIENCES,
  EXPERIENCES_TO_AVOID,
  ITINERARY_BUILD_MODES,
  JAPAN_EXPERIENCES,
  SOUTH_KOREA_EXPERIENCES,
  TAIWAN_EXPERIENCES,
  THAILAND_EXPERIENCES,
  TOUR_STYLES,
  TRANSPORTATION_PREFERENCES,
  TRAVEL_STYLES,
  TRAVELER_TYPES,
  VIETNAM_EXPERIENCES,
  importantDestinationsFromStays,
  toggleListValue,
  totalDestinationNights,
  type DestinationStay,
  type ItineraryBuildMode,
  type ItineraryIntakeData,
} from "@/lib/itinerary-intake";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  buildMode: ItineraryBuildMode;
  onBuildModeChange: (mode: ItineraryBuildMode) => void;
  intake: ItineraryIntakeData;
  onIntakeChange: (patch: Partial<ItineraryIntakeData>) => void;
  arrivalDate?: string;
  departureDate?: string;
  onDatesChange?: (patch: { arrivalDate?: string; departureDate?: string }) => void;
  disabled?: boolean;
};

function CheckboxGroup({
  options,
  selected,
  onToggle,
  disabled,
  ranked,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
  ranked?: boolean;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
      {options.map((t) => {
        const idx = selected.indexOf(t);
        const isOn = idx >= 0;
        return (
          <label
            key={t}
            className={cn(
              "flex items-start gap-2.5 text-sm cursor-pointer rounded-md py-1.5 pr-2",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-border accent-[#D4AA25]"
              checked={isOn}
              disabled={disabled}
              onChange={() => onToggle(t)}
            />
            <span className="leading-snug">
              {ranked && isOn ? (
                <span className="font-medium text-[#8a6b0f] mr-1">{idx + 1}.</span>
              ) : null}
              {t}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function RadioGroup({
  name,
  options,
  value,
  onChange,
  disabled,
}: {
  name: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
      {options.map((opt) => (
        <label
          key={opt}
          className={cn(
            "flex items-start gap-2.5 text-sm cursor-pointer rounded-md py-1.5 pr-2",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <input
            type="radio"
            name={name}
            className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-border accent-[#D4AA25]"
            checked={value === opt}
            onChange={() => onChange(opt)}
            disabled={disabled}
          />
          <span className="leading-snug">{opt}</span>
        </label>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 border-t border-border pt-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function FieldLabel({
  children,
  required,
  hint,
}: {
  children: ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className={cn("block mb-1.5", hint && "min-h-11")}>
      <span className="text-sm font-medium">
        {children}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {hint ? (
        <span className="block text-xs font-normal text-muted-foreground mt-0.5">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/** Inclusive calendar days between arrival and departure (e.g. 8/1–8/15 → 15 days). */
function tripDayCapacity(arrivalDate?: string, departureDate?: string): number | null {
  if (!arrivalDate || !departureDate) return null;
  const a = new Date(`${arrivalDate}T12:00:00`);
  const d = new Date(`${departureDate}T12:00:00`);
  if (Number.isNaN(+a) || Number.isNaN(+d) || d < a) return null;
  return Math.round((+d - +a) / 86400000) + 1;
}

/**
 * Hotel nights for a trip = calendar days − 1
 * (arrive 1st / depart 15th → 15 days, 14 nights).
 */
function tripNightCapacity(tripDays: number | null): number | null {
  if (tripDays == null) return null;
  return Math.max(0, tripDays - 1);
}

function DestinationStayEditor({
  stays,
  onChange,
  disabled,
  arrivalDate,
  departureDate,
}: {
  stays: DestinationStay[];
  onChange: (next: DestinationStay[]) => void;
  disabled?: boolean;
  arrivalDate?: string;
  departureDate?: string;
}) {
  const rows = stays.length > 0 ? stays : [{ city: "", nights: 0 }];
  const totalNights = totalDestinationNights(rows);
  const tripDays = tripDayCapacity(arrivalDate, departureDate);
  const expectedNights = tripNightCapacity(tripDays);
  const remainingNights =
    expectedNights == null ? null : Math.max(0, expectedNights - totalNights);
  const canAddCity = remainingNights == null || remainingNights > 0;

  const updateRow = (index: number, patch: Partial<DestinationStay>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    if (patch.nights != null && expectedNights != null) {
      const others = next.reduce(
        (sum, row, i) => (i === index ? sum : sum + (Number(row.nights) || 0)),
        0
      );
      const maxForRow = Math.max(0, expectedNights - others);
      next[index] = {
        ...next[index],
        nights: Math.min(Math.max(0, Number(patch.nights) || 0), maxForRow),
      };
    }
    onChange(next);
  };

  const addRow = () => {
    if (!canAddCity) return;
    const nights =
      remainingNights == null ? 1 : Math.min(1, remainingNights);
    onChange([...rows, { city: "", nights: Math.max(1, nights) }]);
  };

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length ? next : [{ city: "", nights: 0 }]);
  };

  return (
    <div className="space-y-2">
      <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_7rem_2.5rem] gap-2 text-xs text-muted-foreground px-0.5">
        <span>City / destination</span>
        <span>Hotel name</span>
        <span>Nights</span>
        <span />
      </div>
      {rows.map((row, index) => (
        <div
          key={index}
          className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_7rem_2.5rem] gap-2 items-center"
        >
          <Input
            value={row.city}
            onChange={(e) => updateRow(index, { city: e.target.value })}
            disabled={disabled}
            placeholder={
              index === 0
                ? "e.g. Tokyo"
                : index === 1
                  ? "e.g. Kyoto"
                  : "City name"
            }
            aria-label={`City ${index + 1}`}
          />
          <Input
            value={row.hotelName ?? ""}
            onChange={(e) => updateRow(index, { hotelName: e.target.value })}
            disabled={disabled}
            placeholder="Hotel name (optional)"
            aria-label={`Hotel for city ${index + 1}`}
          />
          <Input
            type="number"
            min={0}
            max={expectedNights ?? 365}
            inputMode="numeric"
            value={row.nights || ""}
            onChange={(e) =>
              updateRow(index, {
                nights: Math.max(0, parseInt(e.target.value, 10) || 0),
              })
            }
            disabled={disabled}
            placeholder="Nights"
            aria-label={`Nights in city ${index + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
            disabled={disabled || rows.length <= 1}
            onClick={() => removeRow(index)}
            aria-label="Remove city"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={disabled || !canAddCity}
            onClick={addRow}
            title={
              !canAddCity && expectedNights != null
                ? `All ${expectedNights} night${expectedNights === 1 ? "" : "s"} are already assigned`
                : undefined
            }
          >
            <Plus className="h-4 w-4" />
            Add city
          </Button>
          {!canAddCity && expectedNights != null ? (
            <p className="text-xs text-amber-700">
              All trip nights are assigned — reduce a city&apos;s nights to add another.
            </p>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Total nights entered: <strong>{totalNights}</strong>
          {expectedNights != null ? (
            <>
              {" "}
              of <strong>{expectedNights}</strong> expected
            </>
          ) : null}
          {tripDays != null ? (
            <>
              {" "}
              · Trip length: <strong>{tripDays}</strong> day
              {tripDays === 1 ? "" : "s"}
              {totalNights > 0 && expectedNights != null && totalNights !== expectedNights ? (
                <span className="text-amber-700">
                  {" "}
                  — adjust nights or dates so nights = days − 1
                </span>
              ) : null}
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

export function ItineraryIntakeFields({
  buildMode,
  onBuildModeChange,
  intake,
  onIntakeChange,
  arrivalDate,
  departureDate,
  onDatesChange,
  disabled,
}: Props) {
  const pagodaBuild = buildMode === "pagoda_build";
  const req = pagodaBuild;
  const [openCountries, setOpenCountries] = useState<Record<string, boolean>>({
    Japan: true,
  });

  const setTravelers = (patch: Partial<ItineraryIntakeData>) => {
    const adults = patch.adults ?? intake.adults ?? 0;
    const children = patch.children ?? intake.children ?? 0;
    const infants = patch.infants ?? intake.infants ?? 0;
    onIntakeChange({
      ...patch,
      adults,
      children,
      infants,
      totalTravelers: adults + children + infants,
    });
  };

  const countrySections: {
    name: string;
    title: string;
    key: keyof ItineraryIntakeData;
    options: readonly string[];
  }[] = [
    {
      name: "Japan",
      title: "Japan experiences of interest",
      key: "japanExperiences",
      options: JAPAN_EXPERIENCES,
    },
    {
      name: "Thailand",
      title: "Thailand experiences of interest",
      key: "thailandExperiences",
      options: THAILAND_EXPERIENCES,
    },
    {
      name: "Vietnam",
      title: "Vietnam experiences of interest",
      key: "vietnamExperiences",
      options: VIETNAM_EXPERIENCES,
    },
    {
      name: "Cambodia",
      title: "Cambodia experiences of interest",
      key: "cambodiaExperiences",
      options: CAMBODIA_EXPERIENCES,
    },
    {
      name: "South Korea",
      title: "South Korea experiences of interest",
      key: "southKoreaExperiences",
      options: SOUTH_KOREA_EXPERIENCES,
    },
    {
      name: "China",
      title: "China experiences of interest",
      key: "chinaExperiences",
      options: CHINA_EXPERIENCES,
    },
    {
      name: "Taiwan",
      title: "Taiwan experiences of interest",
      key: "taiwanExperiences",
      options: TAIWAN_EXPERIENCES,
    },
  ];

  return (
    <div className="space-y-6 border-t border-border pt-6">
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">How would you like to proceed?</h2>
        <div className="space-y-2">
          {ITINERARY_BUILD_MODES.map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                buildMode === opt.value
                  ? "border-[#D4AA25] bg-[#D4AA25]/5"
                  : "border-border hover:bg-muted/40"
              )}
            >
              <input
                type="radio"
                name="buildMode"
                value={opt.value}
                checked={buildMode === opt.value}
                onChange={() => onBuildModeChange(opt.value)}
                disabled={disabled}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <span>
                <span className="block text-sm font-medium">{opt.label}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">{opt.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">
          Asia Luxury Travel Request Form
        </h2>
        <p className="text-xs text-muted-foreground">
          {pagodaBuild ? "Required fields marked when Pagoda builds your proposal." : ""}
        </p>
      </div>

      <Section title="Section 1 — Advisor Information">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel required={req}>Travel Advisor Name</FieldLabel>
            <Input
              value={intake.advisorName ?? ""}
              onChange={(e) => onIntakeChange({ advisorName: e.target.value })}
              disabled={disabled}
              placeholder="Your name"
            />
          </div>
          <div>
            <FieldLabel>Agency Name</FieldLabel>
            <Input
              value={intake.agencyName ?? ""}
              onChange={(e) => onIntakeChange({ agencyName: e.target.value })}
              disabled={disabled}
              placeholder="Agency"
            />
          </div>
          <div>
            <FieldLabel required={req}>Client Full Name</FieldLabel>
            <Input
              value={intake.clientFullName ?? ""}
              onChange={(e) => onIntakeChange({ clientFullName: e.target.value })}
              disabled={disabled}
              placeholder="Client name"
            />
          </div>
          <div>
            <FieldLabel>Client Email</FieldLabel>
            <Input
              type="email"
              value={intake.clientEmail ?? ""}
              onChange={(e) => onIntakeChange({ clientEmail: e.target.value })}
              disabled={disabled}
              placeholder="client@email.com"
            />
          </div>
        </div>
      </Section>

      <Section title="Section 2 — Travel Dates">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel required={req}>Arrival Date</FieldLabel>
              <Input
                type="date"
                value={arrivalDate ?? ""}
                onChange={(e) => onDatesChange?.({ arrivalDate: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div>
              <FieldLabel required={req}>Departure Date</FieldLabel>
              <Input
                type="date"
                value={departureDate ?? ""}
                onChange={(e) => onDatesChange?.({ departureDate: e.target.value })}
                disabled={disabled}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <FieldLabel hint="All travelers">Total</FieldLabel>
              <Input
                type="number"
                min={0}
                max={99}
                value={
                  intake.totalTravelers ??
                  (intake.adults ?? 0) + (intake.children ?? 0) + (intake.infants ?? 0)
                }
                onChange={(e) =>
                  onIntakeChange({
                    totalTravelers: Math.max(0, parseInt(e.target.value, 10) || 0),
                  })
                }
                disabled={disabled}
              />
            </div>
            <div>
              <FieldLabel required={req} hint="12+ years">
                Adults
              </FieldLabel>
              <Input
                type="number"
                min={0}
                max={99}
                value={intake.adults ?? 2}
                onChange={(e) =>
                  setTravelers({ adults: Math.max(0, parseInt(e.target.value, 10) || 0) })
                }
                disabled={disabled}
              />
            </div>
            <div>
              <FieldLabel hint="2–11 years">Children</FieldLabel>
              <Input
                type="number"
                min={0}
                max={99}
                value={intake.children ?? 0}
                onChange={(e) =>
                  setTravelers({ children: Math.max(0, parseInt(e.target.value, 10) || 0) })
                }
                disabled={disabled}
              />
            </div>
            <div>
              <FieldLabel hint="Under 2 years">Infants</FieldLabel>
              <Input
                type="number"
                min={0}
                max={99}
                value={intake.infants ?? 0}
                onChange={(e) =>
                  setTravelers({ infants: Math.max(0, parseInt(e.target.value, 10) || 0) })
                }
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Section 3 - In country destinations">
        <DestinationStayEditor
          stays={intake.destinationStays ?? []}
          disabled={disabled}
          arrivalDate={arrivalDate}
          departureDate={departureDate}
          onChange={(destinationStays) =>
            onIntakeChange({
              destinationStays,
              importantDestinations: importantDestinationsFromStays(destinationStays),
            })
          }
        />
      </Section>

      <Section title="Section 4 — Traveler Profile">
        <FieldLabel>Traveler Type</FieldLabel>
        <CheckboxGroup
          options={TRAVELER_TYPES}
          selected={intake.travelerTypes ?? []}
          onToggle={(v) =>
            onIntakeChange({
              travelerTypes: toggleListValue(intake.travelerTypes ?? [], v),
            })
          }
          disabled={disabled}
        />
      </Section>

      <Section title="Section 5 — Budget & Trip Style">
        <div className="space-y-4">
          <div>
            <FieldLabel required={req}>
              Estimated Budget per Person (Excluding International Flights and Accommodation)
            </FieldLabel>
            <RadioGroup
              name="estimatedBudget"
              options={BUDGET_OPTIONS}
              value={intake.estimatedBudget ?? ""}
              onChange={(estimatedBudget) => onIntakeChange({ estimatedBudget })}
              disabled={disabled}
            />
          </div>
          <div>
            <FieldLabel required={req}>Special Interests</FieldLabel>
            <CheckboxGroup
              options={TRAVEL_STYLES}
              selected={intake.travelStyles ?? []}
              onToggle={(v) =>
                onIntakeChange({
                  travelStyles: toggleListValue(intake.travelStyles ?? [], v),
                })
              }
              disabled={disabled}
            />
          </div>
        </div>
      </Section>

      <Section title="Section 6 — Country experiences">
        <p className="text-xs text-muted-foreground -mt-1">
          Select experiences that matter for the countries your clients will visit.
        </p>
        <div className="space-y-2">
          {countrySections.map((section) => {
            const selected = (intake[section.key] as string[] | undefined) ?? [];
            const isOpen = Boolean(openCountries[section.name]);
            const selectedCount = selected.length;
            return (
              <div
                key={section.name}
                className="rounded-lg border border-border bg-background overflow-hidden"
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setOpenCountries((prev) => ({
                      ...prev,
                      [section.name]: !prev[section.name],
                    }))
                  }
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <span className="text-sm font-medium text-foreground">
                    {section.name}
                    {section.name !== "Japan" ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (coming in 2027)
                      </span>
                    ) : null}
                    {selectedCount > 0 ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ({selectedCount} selected)
                      </span>
                    ) : null}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
                {isOpen ? (
                  <div className="border-t border-border px-3 py-3">
                    <CheckboxGroup
                      options={section.options}
                      selected={selected}
                      onToggle={(v) =>
                        onIntakeChange({
                          [section.key]: toggleListValue(selected, v),
                        })
                      }
                      disabled={disabled}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Section 7 — Tour Structure">
        <div className="space-y-4">
          <div>
            <FieldLabel>Preferred Tour Style</FieldLabel>
            <CheckboxGroup
              options={TOUR_STYLES}
              selected={intake.tourStyles ?? []}
              onToggle={(v) =>
                onIntakeChange({
                  tourStyles: toggleListValue(intake.tourStyles ?? [], v),
                })
              }
              disabled={disabled}
            />
          </div>
          <div>
            <FieldLabel>Transportation Preferences</FieldLabel>
            <CheckboxGroup
              options={TRANSPORTATION_PREFERENCES}
              selected={intake.transportationPreferences ?? []}
              onToggle={(v) =>
                onIntakeChange({
                  transportationPreferences: toggleListValue(
                    intake.transportationPreferences ?? [],
                    v
                  ),
                })
              }
              disabled={disabled}
            />
          </div>
          <div>
            <FieldLabel>Must-Have Experiences</FieldLabel>
            <Textarea
              placeholder="List ONLY highly specific experiences not already selected above."
              value={intake.mustHaveExperiences ?? ""}
              onChange={(e) => onIntakeChange({ mustHaveExperiences: e.target.value })}
              disabled={disabled}
              rows={3}
              className="resize-none"
            />
          </div>
          <div>
            <FieldLabel>Additional Notes for Planning Team</FieldLabel>
            <Textarea
              placeholder="Include operational details, accessibility notes, celebrations, or special requests."
              value={intake.additionalNotes ?? ""}
              onChange={(e) => onIntakeChange({ additionalNotes: e.target.value })}
              disabled={disabled}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>
      </Section>

      <Section title="Section 8 — Preferences & Restrictions">
        <FieldLabel>Experiences to Avoid</FieldLabel>
        <CheckboxGroup
          options={EXPERIENCES_TO_AVOID}
          selected={intake.experiencesToAvoid ?? []}
          onToggle={(v) =>
            onIntakeChange({
              experiencesToAvoid: toggleListValue(intake.experiencesToAvoid ?? [], v),
            })
          }
          disabled={disabled}
        />
      </Section>
    </div>
  );
}
