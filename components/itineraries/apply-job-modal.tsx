"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Check, User, Hash, MapPin, Clock, Calendar, Users, Search, Globe } from "lucide-react";
import toast from "react-hot-toast";

interface ApplyJobModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobTitle?: string;
  jobId?: string;
  jobSummary?: { location?: string; duration?: string; groupSize?: string; date?: string };
  onApplicationSubmitted?: () => void;
}

export function ApplyJobModal({
  open,
  onOpenChange,
  jobTitle,
  jobSummary,
  jobId,
  onApplicationSubmitted,
}: ApplyJobModalProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [guideNumber, setGuideNumber] = useState("");
  const [availabilityConfirmed, setAvailabilityConfirmed] = useState(false);
  const [availabilityNotes, setAvailabilityNotes] = useState("");
  const [languages, setLanguages] = useState<Set<string>>(new Set(["English", "Japanese"]));
  const [whyText, setWhyText] = useState("");
  const [certifications, setCertifications] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [guidePrice, setGuidePrice] = useState("");
  const [pricePerAdult, setPricePerAdult] = useState("");
  const [pricePerChild, setPricePerChild] = useState("");
  const [pricePerInfant, setPricePerInfant] = useState("");
  /** Aligns with tour library: per age bands vs one base + additional per extra person */
  const [pricingMethod, setPricingMethod] = useState<"per_person" | "group_rate">("per_person");
  const [baseRate, setBaseRate] = useState("");
  const [baseGroupSize, setBaseGroupSize] = useState("");
  const [additionalPerPerson, setAdditionalPerPerson] = useState("");
  const [maxGroupSize, setMaxGroupSize] = useState("");
  const [jobParticipants, setJobParticipants] = useState<{ adults: number; children: number; infants: number } | null>(null);
  const [isTourLibrary, setIsTourLibrary] = useState<boolean | null>(null);
  const [isTourOwner, setIsTourOwner] = useState(false);
  const [user, setUser] = useState<{ id?: string; guideNumber?: string } | null>(null);
  const [guideData, setGuideData] = useState<Record<string, unknown> | null>(null);
  const [guideFound, setGuideFound] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", country: "", city: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const showPriceField = isTourLibrary !== true || !isTourOwner;

  useEffect(() => {
    if (!open || !jobId) return;
    setStep(1);
    setGuidePrice("");
    setPricePerAdult("");
    setPricePerChild("");
    setPricePerInfant("");
    setPricingMethod("per_person");
    setBaseRate("");
    setBaseGroupSize("");
    setAdditionalPerPerson("");
    setMaxGroupSize("");
    setJobParticipants(null);
    setIsTourLibrary(null);
    setIsTourOwner(false);
    (async () => {
      try {
        const res = await fetch(`/api/jobs?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        const job = data?.job;
        if (job) {
          setIsTourLibrary(!!job.tour_id);
          const tourOwnerId = (job.tour as { user_id?: string } | null)?.user_id;
          const meRes = await fetch("/api/auth/me", { cache: "no-store" });
          const meData = await meRes.json().catch(() => null);
          const userId = meData?.user?.id;
          setIsTourOwner(!!(job.tour_id && userId === tourOwnerId));
          const a = Number((job as { adults?: number | null }).adults) || 0;
          const c = Number((job as { children?: number | null }).children) || 0;
          const i = Number((job as { infants?: number | null }).infants) || 0;
          setJobParticipants(a + c + i > 0 ? { adults: a || 1, children: c, infants: i } : { adults: 1, children: 0, infants: 0 });
        }
      } catch {
        setIsTourLibrary(null);
        setIsTourOwner(false);
        setJobParticipants(null);
      }
    })();
  }, [open, jobId]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        if (data?.ok && data?.user) {
          setUser(data.user);
          if (data.user.guideNumber) {
            setGuideNumber(String(data.user.guideNumber));
            setGuideFound(true);
            setForm({
              firstName: data.user.name || "",
              lastName: data.user.lastName || "",
              country: data.user.country || "",
              city: data.user.city || "",
            });
          }
        }
      } catch {
        setUser(null);
      }
    })();
  }, [open]);

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!String(guideNumber || "").trim()) e.guideNumber = "Guide number is required";
    if (!guideFound) e.guideNumber = "Please find and verify your guide information first";
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (!availabilityConfirmed) e.availabilityConfirmed = "Please confirm your availability";
    setErrors((prev) => ({ ...prev, ...e }));
    return Object.keys(e).length === 0;
  };
  const validateStep3 = () => {
    const e: Record<string, string> = {};
    if (!languages.has("English") || !languages.has("Japanese")) e.languages = "Select at least English and Japanese";
    if (!whyText.trim()) e.why = "Please provide a short explanation";
    setErrors((prev) => ({ ...prev, ...e }));
    return Object.keys(e).length === 0;
  };
  const validateStep4 = () => {
    const e: Record<string, string> = {};
    if (showPriceField) {
      if (jobParticipants) {
        const headcount =
          jobParticipants.adults + jobParticipants.children + jobParticipants.infants;
        if (pricingMethod === "group_rate") {
          const br = baseRate.trim() === "" ? NaN : parseFloat(baseRate.trim());
          const bgs = baseGroupSize.trim() === "" ? NaN : parseInt(baseGroupSize.trim(), 10);
          const add =
            additionalPerPerson.trim() === "" ? 0 : parseFloat(additionalPerPerson.trim());
          const maxRaw = maxGroupSize.trim();
          const maxG = maxRaw === "" ? null : parseInt(maxRaw, 10);
          if (!Number.isFinite(br) || br < 0) e.baseRate = "Enter base rate (¥), 0 allowed";
          if (!Number.isFinite(bgs) || bgs < 1) e.baseGroupSize = "Base group size must be at least 1";
          if (!Number.isFinite(add) || add < 0) e.additionalPerPerson = "Enter 0 or more";
          if (isTourLibrary === true) {
            if (maxG != null && (!Number.isFinite(maxG) || maxG < 1))
              e.maxGroupSize = "Maximum must be at least 1";
            if (
              maxG != null &&
              Number.isFinite(maxG) &&
              headcount > maxG
            ) {
              e.maxGroupSize = `This job has ${headcount} people; increase max or use per-person pricing`;
            }
          }
          if (
            Number.isFinite(br) &&
            br >= 0 &&
            Number.isFinite(bgs) &&
            bgs >= 1 &&
            Number.isFinite(add) &&
            add >= 0
          ) {
            const extra = Math.max(0, headcount - bgs);
            const total = br + extra * add;
            if (total < 0) e.guidePrice = "Total must be 0 or more";
          }
        } else {
          const pa = pricePerAdult.trim() === "" ? NaN : parseFloat(pricePerAdult.trim());
          const pc = pricePerChild.trim() === "" ? NaN : parseFloat(pricePerChild.trim());
          const pi = pricePerInfant.trim() === "" ? NaN : parseFloat(pricePerInfant.trim());
          if (!Number.isFinite(pa) || pa < 0) e.pricePerAdult = "Enter price per adult (¥)";
          if (!Number.isFinite(pc) || pc < 0) e.pricePerChild = "Enter price per child (¥)";
          if (!Number.isFinite(pi) || pi < 0) e.pricePerInfant = "Enter price per infant (¥)";
          if (Number.isFinite(pa) && Number.isFinite(pc) && Number.isFinite(pi)) {
            const total =
              jobParticipants.adults * pa +
              jobParticipants.children * pc +
              jobParticipants.infants * pi;
            if (total < 0) e.guidePrice = "Total must be 0 or more";
          }
        }
      } else {
        const p = guidePrice.trim();
        const n = p === "" ? NaN : parseFloat(p);
        if (p === "" || Number.isNaN(n) || n < 0) e.guidePrice = "Please enter your price (¥) for this job (0 = free)";
      }
    }
    setErrors((prev) => ({ ...prev, ...e }));
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) {
      toast.error("Please complete step 1");
      return;
    }
    if (step === 2 && !validateStep2()) {
      toast.error("Please confirm your availability");
      return;
    }
    if (step === 3 && !validateStep3()) {
      toast.error("Please complete the required fields");
      return;
    }
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => setStep((s) => Math.max(1, s - 1));

  const handleSubmitFinal = async () => {
    if (!validateStep4()) {
      toast.error(showPriceField ? "Please enter your price (¥) to continue" : "Please complete the required fields");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        job_id: jobId || null,
        job_title: jobTitle || null,
        job_summary: jobSummary || null,
        guide_number: guideNumber,
        guide_data: guideData,
        user_id: user?.id,
        availability: { confirmed: availabilityConfirmed, notes: availabilityNotes },
        languages: Array.from(languages),
        why: whyText,
        certification: Array.from(certifications),
        applied_at: new Date().toISOString(),
      };
      if (showPriceField) {
        if (jobParticipants) {
          if (pricingMethod === "group_rate") {
            payload.pricing_model = "group_rate";
            payload.base_rate = parseFloat(baseRate.trim());
            payload.base_group_size = parseInt(baseGroupSize.trim(), 10);
            payload.additional_per_person_rate =
              additionalPerPerson.trim() === "" ? 0 : parseFloat(additionalPerPerson.trim());
            if (isTourLibrary === true && maxGroupSize.trim() !== "") {
              payload.max_group_size = parseInt(maxGroupSize.trim(), 10);
            }
          } else {
            const pa = parseFloat(pricePerAdult.trim());
            const pc = parseFloat(pricePerChild.trim());
            const pi = parseFloat(pricePerInfant.trim());
            if (
              Number.isFinite(pa) &&
              pa >= 0 &&
              Number.isFinite(pc) &&
              pc >= 0 &&
              Number.isFinite(pi) &&
              pi >= 0
            ) {
              payload.pricing_model = "per_person";
              payload.price_per_adult = pa;
              payload.price_per_child = pc;
              payload.price_per_infant = pi;
            }
          }
        } else if (guidePrice.trim()) {
          const p = parseFloat(guidePrice.trim());
          if (Number.isFinite(p) && p >= 0) payload.guide_price = p;
        }
      }
      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));
      for (const f of files) formData.append("files", f);
      const res = await fetch("/api/applications", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Submit failed");
      setStep(5);
      toast.success("Application submitted successfully!");
      onApplicationSubmitted?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (step === 5) onApplicationSubmitted?.();
    setStep(1);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg px-6 rounded-2xl">
        <button onClick={handleClose} className="absolute right-4 top-4 p-2 hover:bg-gray-100 rounded-lg z-10 cursor-pointer">
          <X className="w-5 h-5" />
        </button>
        {step !== 5 && (
          <DialogHeader className="pt-2">
            <h1 className="text-2xl font-bold text-center">Apply For Job</h1>
            <p className="text-sm text-muted-foreground text-center">{jobTitle || ""}</p>
          </DialogHeader>
        )}

        <div className="space-y-6 py-4">
          {step !== 5 && (
            <div className="text-sm text-muted-foreground">
              Step {step} of 4
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Guide Number *</label>
                <div className="flex gap-2">
                  <Input
                    value={guideNumber}
                    onChange={(e) => {
                      setGuideNumber(e.target.value);
                      setGuideFound(false);
                    }}
                    placeholder="Enter your guide registration number"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!guideNumber.trim()) {
                        toast.error("Enter guide number first");
                        return;
                      }
                      try {
                        const res = await fetch(`/api/guides/${encodeURIComponent(guideNumber)}`);
                        const data = await res.json();
                        if (!data?.ok) {
                          toast.error(data?.error || "Guide not found");
                          return;
                        }
                        setGuideFound(true);
                        setGuideData(data.guide);
                        if (data.guide) {
                          setForm({
                            firstName: String(data.guide.firstName ?? data.guide.first_name ?? ""),
                            lastName: String(data.guide.lastName ?? data.guide.last_name ?? ""),
                            country: String(data.guide.country ?? ""),
                            city: String(data.guide.city ?? ""),
                          });
                        }
                      } catch {
                        toast.error("Could not find guide");
                      }
                    }}
                    className="bg-[#D4AA25] hover:bg-[#D4AA25] cursor-pointer"
                  >
                    Find
                  </Button>
                </div>
                {errors.guideNumber && <p className="text-sm text-red-600 mt-1">{errors.guideNumber}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">First Name</label>
                  <Input value={form.firstName} readOnly className="bg-muted" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Last Name</label>
                  <Input value={form.lastName} readOnly className="bg-muted" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Country</label>
                  <Input value={form.country} readOnly className="bg-muted" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">City</label>
                  <Input value={form.city} readOnly className="bg-muted" />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {jobSummary?.location || "—"}</span>
                <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {jobSummary?.duration || "—"}</span>
                <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {jobSummary?.groupSize || "—"}</span>
                <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {jobSummary?.date || "—"}</span>
              </div>
              <div>
                <label className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="availability"
                    checked={availabilityConfirmed}
                    onChange={() => setAvailabilityConfirmed(true)}
                  />
                  <span className="text-sm">Yes, I confirm my availability for the listed dates.</span>
                </label>
                {errors.availabilityConfirmed && <p className="text-sm text-red-600">{errors.availabilityConfirmed}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Additional notes (optional)</label>
                <textarea
                  value={availabilityNotes}
                  onChange={(e) => setAvailabilityNotes(e.target.value)}
                  className="w-full border rounded-md p-2 text-sm min-h-[80px]"
                  placeholder="Any availability notes..."
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Languages * (English and Japanese required)</label>
                <div className="flex flex-wrap gap-2">
                  {["English", "Japanese", "Mandarin", "French", "Spanish", "German"].map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => {
                        setLanguages((prev) => {
                          const next = new Set(prev);
                          if (next.has(lang)) next.delete(lang);
                          else next.add(lang);
                          return next;
                        });
                      }}
                      className={`px-3 py-1.5 rounded-md text-sm border cursor-pointer ${
                        languages.has(lang) ? "border-[#D4AA25] bg-[#D4AA25]/10" : "border-border"
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
                {errors.languages && <p className="text-sm text-red-600">{errors.languages}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Why are you a good fit? *</label>
                <textarea
                  value={whyText}
                  onChange={(e) => setWhyText(e.target.value)}
                  className="w-full border rounded-md p-2 text-sm min-h-[80px]"
                  placeholder="Short explanation..."
                />
                {errors.why && <p className="text-sm text-red-600">{errors.why}</p>}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              {showPriceField && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    Your price (guide quote, ¥) <span className="text-destructive">*</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {jobParticipants
                      ? `This job: ${jobParticipants.adults} adult(s), ${jobParticipants.children} child(ren), ${jobParticipants.infants} infant(s). Choose per-person rates or a group rate (like tour listings). Visible to you and the agent only.`
                      : "Enter your total guide price for this job. Visible to you and the agent only."}
                  </p>
                  {jobParticipants ? (
                    <>
                      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                        <p className="text-xs font-medium text-foreground">Pricing method</p>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="applyPricingMethod"
                            checked={pricingMethod === "per_person"}
                            onChange={() => {
                              setPricingMethod("per_person");
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next.baseRate;
                                delete next.baseGroupSize;
                                delete next.additionalPerPerson;
                                delete next.maxGroupSize;
                                return next;
                              });
                            }}
                          />
                          <span className="text-sm">Per person</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="applyPricingMethod"
                            checked={pricingMethod === "group_rate"}
                            onChange={() => {
                              setPricingMethod("group_rate");
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next.pricePerAdult;
                                delete next.pricePerChild;
                                delete next.pricePerInfant;
                                return next;
                              });
                            }}
                          />
                          <span className="text-sm">Group rate</span>
                        </label>
                        <p className="text-[11px] text-muted-foreground leading-snug pt-1">
                          <strong>Per person</strong>: separate ¥ for adults, children, infants.{" "}
                          <strong>Group rate</strong>: one base price for up to N people, then the same
                          additional ¥ per extra person (any age).{" "}
                          {isTourLibrary === false
                            ? "This job’s group size is set by the agent."
                            : "Headcount for this job is fixed above."}
                        </p>
                      </div>

                      {pricingMethod === "per_person" ? (
                        <>
                          <div>
                            <label className="block text-xs font-medium mb-1">Adults (12+) ¥</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">¥</span>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                placeholder="e.g. 10000"
                                value={pricePerAdult}
                                onChange={(e) => {
                                  setPricePerAdult(e.target.value);
                                  setErrors((prev) => ({ ...prev, pricePerAdult: "" }));
                                }}
                                className="pl-8"
                              />
                            </div>
                            {errors.pricePerAdult && (
                              <p className="text-sm text-red-600 mt-1">{errors.pricePerAdult}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Children (3–11) ¥</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">¥</span>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                placeholder="e.g. 5000"
                                value={pricePerChild}
                                onChange={(e) => {
                                  setPricePerChild(e.target.value);
                                  setErrors((prev) => ({ ...prev, pricePerChild: "" }));
                                }}
                                className="pl-8"
                              />
                            </div>
                            {errors.pricePerChild && (
                              <p className="text-sm text-red-600 mt-1">{errors.pricePerChild}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Infants (0–2) ¥</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">¥</span>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                placeholder="e.g. 0"
                                value={pricePerInfant}
                                onChange={(e) => {
                                  setPricePerInfant(e.target.value);
                                  setErrors((prev) => ({ ...prev, pricePerInfant: "" }));
                                }}
                                className="pl-8"
                              />
                            </div>
                            {errors.pricePerInfant && (
                              <p className="text-sm text-red-600 mt-1">{errors.pricePerInfant}</p>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="block text-xs font-medium mb-1">Base rate (¥)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">¥</span>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                placeholder="e.g. 50000"
                                value={baseRate}
                                onChange={(e) => {
                                  setBaseRate(e.target.value);
                                  setErrors((prev) => ({ ...prev, baseRate: "" }));
                                }}
                                className="pl-8"
                              />
                            </div>
                            {errors.baseRate && (
                              <p className="text-sm text-red-600 mt-1">{errors.baseRate}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Covers up to (people)</label>
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              placeholder="e.g. 4"
                              value={baseGroupSize}
                              onChange={(e) => {
                                setBaseGroupSize(e.target.value);
                                setErrors((prev) => ({ ...prev, baseGroupSize: "" }));
                              }}
                            />
                            {errors.baseGroupSize && (
                              <p className="text-sm text-red-600 mt-1">{errors.baseGroupSize}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Additional per extra person (¥)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">¥</span>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                placeholder="e.g. 5000"
                                value={additionalPerPerson}
                                onChange={(e) => {
                                  setAdditionalPerPerson(e.target.value);
                                  setErrors((prev) => ({ ...prev, additionalPerPerson: "" }));
                                }}
                                className="pl-8"
                              />
                            </div>
                            {errors.additionalPerPerson && (
                              <p className="text-sm text-red-600 mt-1">{errors.additionalPerPerson}</p>
                            )}
                          </div>
                          {isTourLibrary === true && (
                            <div>
                              <label className="block text-xs font-medium mb-1">
                                Maximum group size (optional)
                              </label>
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                placeholder="Leave empty for no cap"
                                value={maxGroupSize}
                                onChange={(e) => {
                                  setMaxGroupSize(e.target.value);
                                  setErrors((prev) => ({ ...prev, maxGroupSize: "" }));
                                }}
                              />
                              {errors.maxGroupSize && (
                                <p className="text-sm text-red-600 mt-1">{errors.maxGroupSize}</p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      {errors.guidePrice && <p className="text-sm text-red-600">{errors.guidePrice}</p>}
                    </>
                  ) : (
                    <>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">¥</span>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="e.g. 10000 (0 = free)"
                          value={guidePrice}
                          onChange={(e) => { setGuidePrice(e.target.value); setErrors((prev) => ({ ...prev, guidePrice: "" })); }}
                          className="pl-8"
                        />
                      </div>
                      {errors.guidePrice && <p className="text-sm text-red-600 mt-1">{errors.guidePrice}</p>}
                    </>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">Certifications</label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={certifications.has("license")}
                    onChange={(e) => {
                      setCertifications((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add("license");
                        else next.delete("license");
                        return next;
                      });
                    }}
                  />
                  <span className="text-sm">I have a valid tour guide license.</span>
                </label>
                <label className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={certifications.has("experience")}
                    onChange={(e) => {
                      setCertifications((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add("experience");
                        else next.delete("experience");
                        return next;
                      });
                    }}
                  />
                  <span className="text-sm">I have at least 2 years experience.</span>
                </label>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="text-center py-6">
              <div className="mx-auto w-14 h-14 rounded-full bg-[#F7E9C8] flex items-center justify-center mb-4">
                <Check className="w-7 h-7 text-[#D4AA25]" />
              </div>
              <h2 className="text-xl font-bold">You have applied successfully.</h2>
              <p className="text-sm text-muted-foreground mt-2">Explore other jobs.</p>
              <Button onClick={handleClose} className="mt-6 bg-[#D4AA25] hover:bg-[#D4AA25] cursor-pointer">
                Continue
              </Button>
            </div>
          )}

          {step < 5 && (
            <div className="flex gap-3 pt-4 border-t">
              <Button variant="outline" onClick={handleBack} disabled={step === 1} className="cursor-pointer">
                Back
              </Button>
              {step < 4 ? (
                <Button onClick={handleNext} className="ml-auto bg-[#D4AA25] hover:bg-[#D4AA25] cursor-pointer">
                  Next
                </Button>
              ) : (
                <Button
                  onClick={handleSubmitFinal}
                  disabled={submitting}
                  className="ml-auto bg-[#D4AA25] hover:bg-[#D4AA25] cursor-pointer"
                >
                  {submitting ? "Submitting…" : "Submit Application"}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
