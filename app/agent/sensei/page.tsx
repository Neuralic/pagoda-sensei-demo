"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Users, Calendar, DollarSign, FileText, Sparkles } from "lucide-react";

type SuggestedTour = {
  name: string;
  duration_days: number;
  price_per_person: number;
};

type MatchedOperator = {
  operator: { name: string; destinations: string[] };
  match_score: number;
  match_reasoning: string;
  suggested_tours: SuggestedTour[];
};

type DayEntry = {
  day: number;
  location: string;
  title: string;
  description: string;
  activities: string[];
};

type MatchResponse = {
  matched_operators: MatchedOperator[];
  preliminary_itinerary: {
    day_by_day: DayEntry[];
    estimated_budget: string;
    notes: string;
  };
  ai_notes: string;
};

type FormState = {
  destinations: string;
  total_travelers: string;
  arrival_date: string;
  departure_date: string;
  total_budget_usd: string;
  special_notes: string;
};

const EMPTY_FORM: FormState = {
  destinations: "",
  total_travelers: "",
  arrival_date: "",
  departure_date: "",
  total_budget_usd: "",
  special_notes: "",
};

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const bg =
    pct >= 80
      ? "bg-green-100 text-green-800 border-green-200"
      : pct >= 60
      ? "bg-yellow-100 text-yellow-800 border-yellow-200"
      : "bg-red-100 text-red-800 border-red-200";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${bg}`}>
      {pct}% match
    </span>
  );
}

function OperatorCard({ op }: { op: MatchedOperator }) {
  return (
    <div className="rounded-xl border border-border bg-white shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[#0E1F3D] text-base leading-tight">{op.operator.name}</h3>
          {op.operator.destinations.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {op.operator.destinations.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full"
                >
                  <MapPin className="w-3 h-3" />
                  {d}
                </span>
              ))}
            </div>
          )}
        </div>
        <ScoreBadge score={op.match_score} />
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">{op.match_reasoning}</p>

      {op.suggested_tours.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[#0E1F3D] uppercase tracking-wide mb-2">
            Suggested Tours
          </p>
          <div className="flex flex-col gap-2">
            {op.suggested_tours.map((tour, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">{tour.name}</span>
                <div className="flex items-center gap-3 text-muted-foreground text-xs shrink-0 ml-3">
                  <span>{tour.duration_days}d</span>
                  <span className="font-semibold text-[#0E1F3D]">
                    ${tour.price_per_person.toLocaleString()}/person
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DayTimeline({ days }: { days: DayEntry[] }) {
  return (
    <ol className="relative border-l-2 border-[#D4AA25]/40 ml-3 flex flex-col gap-6">
      {days.map((entry) => (
        <li key={entry.day} className="relative pl-6">
          <span className="absolute -left-[11px] top-1 w-5 h-5 rounded-full bg-[#D4AA25] flex items-center justify-center text-white text-[10px] font-bold shadow">
            {entry.day}
          </span>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-[#D4AA25] uppercase tracking-wide">
              {entry.location}
            </span>
          </div>
          <p className="font-semibold text-[#0E1F3D] text-sm">{entry.title}</p>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{entry.description}</p>
          {entry.activities.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {entry.activities.map((act, i) => (
                <li
                  key={i}
                  className="text-xs bg-[#0E1F3D]/5 text-[#0E1F3D] px-2 py-0.5 rounded-full border border-[#0E1F3D]/10"
                >
                  {act}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function SenseiPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResponse | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const totalTravelers = parseInt(form.total_travelers, 10);
    const totalBudget = parseFloat(form.total_budget_usd);

    if (!form.destinations.trim()) {
      toast.error("Please enter at least one destination.");
      return;
    }
    if (!totalTravelers || totalTravelers < 1) {
      toast.error("Number of travelers must be at least 1.");
      return;
    }
    if (!form.arrival_date || !form.departure_date) {
      toast.error("Please enter both arrival and departure dates.");
      return;
    }
    if (form.departure_date < form.arrival_date) {
      toast.error("Departure date must be after arrival date.");
      return;
    }
    if (!totalBudget || totalBudget <= 0) {
      toast.error("Please enter a valid total budget.");
      return;
    }

    const destinations = form.destinations
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    const body = {
      advisor: {
        first_name: "Pagoda",
        last_name: "Agent",
        email: "agent@pagoda.travel",
      },
      lead_traveler_name: "Sensei Test Client",
      group: {
        total_travelers: totalTravelers,
        adults: totalTravelers,
        children_under_12: 0,
      },
      arrival_date: form.arrival_date,
      departure_date: form.departure_date,
      destinations,
      budget: {
        total_budget_usd: totalBudget,
        per_person_budget_usd: totalBudget / totalTravelers,
        budget_range: "luxury",
      },
      travel_styles: ["cultural", "luxury", "food"],
      top_priorities: ["culture_history", "food"],
      special_notes: form.special_notes,
    };

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("https://pagoda-ai.vercel.app/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        console.log("Sensei error response:", data);
        const firstDetail =
          Array.isArray(data?.detail) && data.detail.length > 0
            ? (data.detail[0]?.msg ?? data.detail[0])
            : null;
        const msg =
          firstDetail ||
          data?.error ||
          data?.message ||
          `Request failed (${res.status})`;
        toast.error(String(msg));
        return;
      }

      setResult(data as MatchResponse);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error — could not reach Sensei.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-[#D4AA25]" />
            <span className="text-xs font-semibold text-[#D4AA25] uppercase tracking-widest">
              AI Matching
            </span>
          </div>
          <h1 className="text-3xl font-bold text-[#0E1F3D]">Sensei</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Describe your client's trip and Sensei will find the best-matched operators and draft a
            preliminary itinerary.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-white shadow-sm p-6 mb-8"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Destinations */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[#0E1F3D] mb-1.5">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Destinations
                </span>
              </label>
              <Input
                name="destinations"
                value={form.destinations}
                onChange={handleChange}
                placeholder="e.g. Tokyo, Kyoto, Osaka"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground mt-1">Separate multiple destinations with commas.</p>
            </div>

            {/* Travelers */}
            <div>
              <label className="block text-sm font-medium text-[#0E1F3D] mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Number of Travelers
                </span>
              </label>
              <Input
                type="number"
                name="total_travelers"
                value={form.total_travelers}
                onChange={handleChange}
                placeholder="e.g. 4"
                min={1}
                disabled={loading}
              />
            </div>

            {/* Budget */}
            <div>
              <label className="block text-sm font-medium text-[#0E1F3D] mb-1.5">
                <span className="flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" />
                  Total Budget (USD)
                </span>
              </label>
              <Input
                type="number"
                name="total_budget_usd"
                value={form.total_budget_usd}
                onChange={handleChange}
                placeholder="e.g. 12000"
                min={1}
                disabled={loading}
              />
            </div>

            {/* Arrival */}
            <div>
              <label className="block text-sm font-medium text-[#0E1F3D] mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Arrival Date
                </span>
              </label>
              <Input
                type="date"
                name="arrival_date"
                value={form.arrival_date}
                onChange={handleChange}
                disabled={loading}
              />
            </div>

            {/* Departure */}
            <div>
              <label className="block text-sm font-medium text-[#0E1F3D] mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Departure Date
                </span>
              </label>
              <Input
                type="date"
                name="departure_date"
                value={form.departure_date}
                onChange={handleChange}
                disabled={loading}
              />
            </div>

            {/* Special Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[#0E1F3D] mb-1.5">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Special Notes
                </span>
              </label>
              <textarea
                name="special_notes"
                value={form.special_notes}
                onChange={handleChange}
                placeholder="Dietary restrictions, accessibility needs, interests, pace preferences…"
                rows={3}
                disabled={loading}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="submit"
              disabled={loading}
              className="bg-[#0E1F3D] hover:bg-[#0E1F3D]/90 text-white px-8 gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Matching…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Find Matches
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4 animate-pulse">
            <div className="h-6 w-48 bg-muted rounded" />
            <div className="h-32 bg-muted rounded-xl" />
            <div className="h-32 bg-muted rounded-xl" />
          </div>
        )}

        {/* Results */}
        {!loading && result && (
          <div className="space-y-10">
            {/* AI Notes */}
            {result.ai_notes && (
              <div className="rounded-xl border border-[#D4AA25]/40 bg-[#D4AA25]/8 px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-[#D4AA25]" />
                  <span className="text-sm font-semibold text-[#0E1F3D]">Sensei Notes</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{result.ai_notes}</p>
              </div>
            )}

            {/* Matched Operators */}
            {result.matched_operators.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-[#0E1F3D] mb-4">
                  Matched Operators
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({result.matched_operators.length})
                  </span>
                </h2>
                <div className="flex flex-col gap-4">
                  {result.matched_operators.map((op, i) => (
                    <OperatorCard key={i} op={op} />
                  ))}
                </div>
              </section>
            )}

            {/* Preliminary Itinerary */}
            {result.preliminary_itinerary?.day_by_day?.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="text-lg font-bold text-[#0E1F3D]">Preliminary Itinerary</h2>
                  {result.preliminary_itinerary.estimated_budget && (
                    <span className="text-sm text-muted-foreground">
                      Est.{" "}
                      <span className="font-semibold text-[#0E1F3D]">
                        {result.preliminary_itinerary.estimated_budget}
                      </span>
                    </span>
                  )}
                </div>

                <DayTimeline days={result.preliminary_itinerary.day_by_day} />

                {result.preliminary_itinerary.notes && (
                  <p className="mt-5 text-sm text-muted-foreground italic leading-relaxed">
                    {result.preliminary_itinerary.notes}
                  </p>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
