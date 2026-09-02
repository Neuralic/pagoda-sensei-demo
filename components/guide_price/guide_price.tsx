"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import toast from "react-hot-toast";

interface GuidePriceProps {
  isOpen: boolean;
  onClose: () => void;
  job_id: string;
  userId?: string;
  setOfferPrice: (value: string) => void;
  mode?: "accept" | "update";
  initialPrice?: number | null;
  onPriceUpdated?: () => void;
}

export default function GuidePrice({
  isOpen,
  onClose,
  job_id,
  userId,
  setOfferPrice,
  mode = "accept",
  initialPrice,
  onPriceUpdated,
}: GuidePriceProps) {
  const [price, setPrice] = useState("");
  const [pricePerAdult, setPricePerAdult] = useState("");
  const [pricePerChild, setPricePerChild] = useState("");
  const [pricePerInfant, setPricePerInfant] = useState("");
  const [pricingMethod, setPricingMethod] = useState<"per_person" | "group_rate">("per_person");
  const [baseRate, setBaseRate] = useState("");
  const [baseGroupSize, setBaseGroupSize] = useState("");
  const [additionalPerPerson, setAdditionalPerPerson] = useState("");
  const [maxGroupSize, setMaxGroupSize] = useState("");
  const [existingPrice, setExistingPrice] = useState<number | null>(null);
  const [jobParticipants, setJobParticipants] = useState<{ adults: number; children: number; infants: number } | null>(null);
  /** When null, tour-library jobs may show optional max group size on group-rate bids */
  const [jobTourId, setJobTourId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [guideDisplayName, setGuideDisplayName] = useState("");
  const [guideWhatsapp, setGuideWhatsapp] = useState("");
  const isUpdateMode = mode === "update";

  const fulfillmentPayload = () => ({
    pickup_date: pickupDate.trim(),
    pickup_time: pickupTime.trim(),
    pickup_location: pickupLocation.trim(),
    guide_display_name: guideDisplayName.trim(),
    guide_whatsapp: guideWhatsapp.trim(),
  });

  const validateFulfillmentFields = (): boolean => {
    const p = fulfillmentPayload();
    if (!p.pickup_date) {
      alert("Pickup date is required.");
      return false;
    }
    if (!p.pickup_time) {
      alert("Pickup time is required.");
      return false;
    }
    if (!p.pickup_location) {
      alert("Pickup location is required.");
      return false;
    }
    if (!p.guide_display_name) {
      alert("Your name is required.");
      return false;
    }
    if (!p.guide_whatsapp) {
      alert("Your WhatsApp number is required.");
      return false;
    }
    return true;
  };

  const renderFulfillmentFields = () => (
    <div className="space-y-3 mb-4 border-t border-gray-200 pt-4">
      <p className="text-sm font-medium text-gray-800">
        Pickup details for the traveler (required)
      </p>
      <div>
        <label className="block mb-1 text-sm font-medium">Pickup date *</label>
        <input
          type="date"
          className="w-full border p-2 rounded"
          value={pickupDate}
          onChange={(e) => setPickupDate(e.target.value)}
        />
      </div>
      <div>
        <label className="block mb-1 text-sm font-medium">Pickup time *</label>
        <input
          type="time"
          className="w-full border p-2 rounded"
          value={pickupTime}
          onChange={(e) => setPickupTime(e.target.value)}
        />
      </div>
      <div>
        <label className="block mb-1 text-sm font-medium">Pickup location *</label>
        <input
          type="text"
          className="w-full border p-2 rounded"
          value={pickupLocation}
          onChange={(e) => setPickupLocation(e.target.value)}
          placeholder="Hotel lobby, station, address…"
        />
      </div>
      <div>
        <label className="block mb-1 text-sm font-medium">Your name (as shown to traveler) *</label>
        <input
          type="text"
          className="w-full border p-2 rounded"
          value={guideDisplayName}
          onChange={(e) => setGuideDisplayName(e.target.value)}
        />
      </div>
      <div>
        <label className="block mb-1 text-sm font-medium">Your WhatsApp number *</label>
        <input
          type="tel"
          className="w-full border p-2 rounded"
          value={guideWhatsapp}
          onChange={(e) => setGuideWhatsapp(e.target.value)}
          placeholder="+81…"
        />
      </div>
    </div>
  );

  useEffect(() => {
    if (isUpdateMode && isOpen && !jobParticipants) {
      if (initialPrice != null && Number(initialPrice) > 0) setPrice(String(initialPrice));
      else setPrice("");
    }
  }, [isUpdateMode, isOpen, initialPrice, jobParticipants]);

  useEffect(() => {
    if (!isOpen || !job_id || !userId || isUpdateMode) {
      setExistingPrice(null);
      setJobParticipants(null);
      setJobTourId(null);
      return;
    }
    setLoading(true);
    Promise.all([
      fetch(`/api/applications?jobId=${encodeURIComponent(job_id)}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`/api/jobs?jobId=${encodeURIComponent(job_id)}`, { credentials: "include" }).then((r) => r.json()),
      fetch("/api/auth/me", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([data, jobData, meData]) => {
        const guidePrice = data?.guide_price;
        const has = guidePrice != null && Number(guidePrice) > 0;
        setExistingPrice(has ? Number(guidePrice) : null);
        const adults = data?.job_adults != null ? Number(data.job_adults) : 0;
        const children = data?.job_children != null ? Number(data.job_children) : 0;
        const infants = data?.job_infants != null ? Number(data.job_infants) : 0;
        setJobTourId(
          data?.job_tour_id != null && String(data.job_tour_id).trim() !== ""
            ? String(data.job_tour_id)
            : null
        );
        if (adults > 0 || children > 0 || infants > 0) {
          setJobParticipants({ adults, children, infants });
          const pa = data?.price_per_adult;
          const pc = data?.price_per_child;
          const pi = data?.price_per_infant;
          if (pa != null && pc != null && pi != null) {
            setPricingMethod("per_person");
            setPricePerAdult(String(pa));
            setPricePerChild(String(pc));
            setPricePerInfant(String(pi));
          } else {
            setPricingMethod("group_rate");
            setPricePerAdult("");
            setPricePerChild("");
            setPricePerInfant("");
            setBaseRate("");
            setBaseGroupSize("");
            setAdditionalPerPerson("");
            setMaxGroupSize("");
          }
        } else {
          setJobParticipants(null);
        }

        const job = jobData?.job as { start_time?: string; location?: string } | undefined;
        if (job?.start_time) {
          try {
            const d = new Date(job.start_time);
            if (!Number.isNaN(d.getTime())) {
              const ymd = d.toISOString().slice(0, 10);
              setPickupDate(ymd);
              const hh = String(d.getUTCHours()).padStart(2, "0");
              const mm = String(d.getUTCMinutes()).padStart(2, "0");
              setPickupTime(`${hh}:${mm}`);
            }
          } catch {
            // keep defaults
          }
        }
        if (job?.location) {
          setPickupLocation(String(job.location));
        }
        const user = meData?.user as { firstName?: string; lastName?: string; phone?: string } | undefined;
        if (user) {
          const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
          if (fullName) setGuideDisplayName(fullName);
          if (user.phone) setGuideWhatsapp(String(user.phone));
        }
      })
      .catch(() => {
        setExistingPrice(null);
        setJobParticipants(null);
        setJobTourId(null);
      })
      .finally(() => setLoading(false));
  }, [isOpen, job_id, userId, isUpdateMode]);

  const acceptWithExistingPrice = async () => {
    if (!validateFulfillmentFields()) return;
    const res = await fetch("/api/hire", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id, user_id: userId, ...fulfillmentPayload() }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Failed to accept offer");
    onClose();
    setOfferPrice(String(existingPrice ?? ""));
    toast.success("Offer accepted! You are now a candidate.");
    window.location.reload();
  };

  const submitPrice = async () => {
    if (!userId) return;

    if (isUpdateMode) {
      setUpdating(true);
      try {
        let body: Record<string, unknown> = { job_id, user_id: userId };
        if (jobParticipants) {
          if (pricingMethod === "group_rate") {
            const br = parseFloat(baseRate);
            const bgs = parseInt(baseGroupSize, 10);
            const add =
              additionalPerPerson.trim() === "" ? 0 : parseFloat(additionalPerPerson);
            const maxG =
              jobTourId && maxGroupSize.trim() !== ""
                ? parseInt(maxGroupSize, 10)
                : null;
            if (!Number.isFinite(br) || br < 0)
              return alert("Enter a valid base rate of 0 or more.");
            if (!Number.isFinite(bgs) || bgs < 1)
              return alert("Base group size must be at least 1.");
            if (!Number.isFinite(add) || add < 0)
              return alert("Additional per person must be 0 or more.");
            if (jobTourId) {
              if (maxG != null && (!Number.isFinite(maxG) || maxG < 1))
                return alert("Maximum group size must be at least 1 when set.");
              const hc =
                jobParticipants.adults +
                jobParticipants.children +
                jobParticipants.infants;
              if (maxG != null && hc > maxG)
                return alert(`This job has ${hc} people; your maximum (${maxG}) is too low.`);
            }
            body.pricing_model = "group_rate";
            body.base_rate = br;
            body.base_group_size = bgs;
            body.additional_per_person_rate = add;
            if (jobTourId && maxG != null) body.max_group_size = maxG;
          } else {
            const pa = parseFloat(pricePerAdult);
            const pc = parseFloat(pricePerChild);
            const pi = parseFloat(pricePerInfant);
            if (isNaN(pa) || isNaN(pc) || isNaN(pi) || pa < 0 || pc < 0 || pi < 0)
              return alert("Please enter valid non-negative prices for all participant types.");
            const total = jobParticipants.adults * pa + jobParticipants.children * pc + jobParticipants.infants * pi;
            if (total < 0) return alert("Total price (per person × participants) must be 0 or more.");
            body.price_per_adult = pa;
            body.price_per_child = pc;
            body.price_per_infant = pi;
            body.guide_price = total;
          }
        } else {
          const priceNum = parseFloat(price);
          if (price === "" || isNaN(priceNum) || priceNum < 0) return alert("Please enter a valid price (0 or more)");
          body.guide_price = priceNum;
        }
        const res = await fetch("/api/guide-price", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return alert(data.error || "Failed to update price");
        const updatedGp =
          (data as { data?: { guide_price?: number } })?.data?.guide_price;
        onClose();
        if (updatedGp != null) setOfferPrice(String(updatedGp));
        toast.success("Price updated successfully.");
        onPriceUpdated?.();
        window.location.reload();
      } finally {
        setUpdating(false);
      }
      return;
    }

    const priceNum = parseFloat(price);
    if (price === "" || isNaN(priceNum) || priceNum < 0) return alert("Please enter a valid price (0 or more)");
    if (!validateFulfillmentFields()) return;

    const res = await fetch("/api/hire", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id,
        user_id: userId,
        guide_price: priceNum,
        ...fulfillmentPayload(),
      }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Failed to accept offer");
    onClose();
    setOfferPrice(price);
    toast.success("Offer accepted! You are now a candidate.");
    window.location.reload();
  };

  const useExisting = existingPrice != null && existingPrice >= 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-6">
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-xl mb-4 font-semibold">
            {isUpdateMode ? "Update your price" : "Accept Offer & Set Price"}
          </h2>
          {isUpdateMode ? (
            loading ? (
              <p className="text-sm text-gray-600">Loading…</p>
            ) : jobParticipants ? (
              <>
                <p className="text-sm text-gray-600 mb-3">
                  Per-person or group rate (same idea as tour listings). Total is derived from this
                  job&apos;s participant counts.
                </p>
                <div className="flex flex-col gap-2 mb-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="guidePriceMethod"
                      checked={pricingMethod === "per_person"}
                      onChange={() => setPricingMethod("per_person")}
                    />
                    Per person
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="guidePriceMethod"
                      checked={pricingMethod === "group_rate"}
                      onChange={() => setPricingMethod("group_rate")}
                    />
                    Group rate
                  </label>
                </div>
                {pricingMethod === "per_person" ? (
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block mb-1 text-sm font-medium">Adults (12+) — ¥ per person *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="w-full border p-2 rounded pl-8"
                          value={pricePerAdult}
                          onChange={(e) => setPricePerAdult(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <span className="text-xs text-gray-500">× {jobParticipants.adults} = ¥{(jobParticipants.adults * (parseFloat(pricePerAdult) || 0)).toLocaleString()}</span>
                    </div>
                    <div>
                      <label className="block mb-1 text-sm font-medium">Children (3–11) — ¥ per person *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="w-full border p-2 rounded pl-8"
                          value={pricePerChild}
                          onChange={(e) => setPricePerChild(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <span className="text-xs text-gray-500">× {jobParticipants.children} = ¥{(jobParticipants.children * (parseFloat(pricePerChild) || 0)).toLocaleString()}</span>
                    </div>
                    <div>
                      <label className="block mb-1 text-sm font-medium">Infants (0–2) — ¥ per person *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="w-full border p-2 rounded pl-8"
                          value={pricePerInfant}
                          onChange={(e) => setPricePerInfant(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <span className="text-xs text-gray-500">× {jobParticipants.infants} = ¥{(jobParticipants.infants * (parseFloat(pricePerInfant) || 0)).toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-medium">
                      Total: ¥{(
                        jobParticipants.adults * (parseFloat(pricePerAdult) || 0) +
                        jobParticipants.children * (parseFloat(pricePerChild) || 0) +
                        jobParticipants.infants * (parseFloat(pricePerInfant) || 0)
                      ).toLocaleString()}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block mb-1 text-sm font-medium">Base rate (¥) *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="w-full border p-2 rounded pl-8"
                          value={baseRate}
                          onChange={(e) => setBaseRate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block mb-1 text-sm font-medium">Covers up to (people) *</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="w-full border p-2 rounded"
                        value={baseGroupSize}
                        onChange={(e) => setBaseGroupSize(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-sm font-medium">Additional per extra person (¥) *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="w-full border p-2 rounded pl-8"
                          value={additionalPerPerson}
                          onChange={(e) => setAdditionalPerPerson(e.target.value)}
                        />
                      </div>
                    </div>
                    {jobTourId ? (
                      <div>
                        <label className="block mb-1 text-sm font-medium">Maximum group size (optional)</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="w-full border p-2 rounded"
                          placeholder="No cap if empty"
                          value={maxGroupSize}
                          onChange={(e) => setMaxGroupSize(e.target.value)}
                        />
                      </div>
                    ) : null}
                    <p className="text-sm font-medium">
                      Guide total: ¥{(() => {
                        const hc =
                          jobParticipants.adults +
                          jobParticipants.children +
                          jobParticipants.infants;
                        const br = parseFloat(baseRate) || 0;
                        const bgs = parseInt(baseGroupSize, 10) || 0;
                        const add = additionalPerPerson.trim() === "" ? 0 : parseFloat(additionalPerPerson) || 0;
                        const extra = bgs > 0 ? Math.max(0, hc - bgs) : 0;
                        return (br + extra * add).toLocaleString();
                      })()}
                    </p>
                  </div>
                )}
                <button
                  className="w-full bg-[#F0B100] hover:bg-[#F0B100] text-white font-medium py-2.5 px-4 rounded-lg disabled:opacity-50 cursor-pointer"
                  onClick={submitPrice}
                  disabled={
                    updating ||
                    (pricingMethod === "per_person"
                      ? jobParticipants.adults * (parseFloat(pricePerAdult) || 0) +
                          jobParticipants.children * (parseFloat(pricePerChild) || 0) +
                          jobParticipants.infants * (parseFloat(pricePerInfant) || 0) <
                        0
                      : (() => {
                          const hc =
                            jobParticipants.adults +
                            jobParticipants.children +
                            jobParticipants.infants;
                          const br = parseFloat(baseRate) || 0;
                          const bgs = parseInt(baseGroupSize, 10) || 0;
                          const add =
                            additionalPerPerson.trim() === "" ? 0 : parseFloat(additionalPerPerson) || 0;
                          const extra = bgs > 0 ? Math.max(0, hc - bgs) : 0;
                          return br + extra * add < 0;
                        })())
                  }
                >
                  {updating ? "Updating…" : "Update price"}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-4">Change your price for this job.</p>
                <label className="block mb-2 text-sm font-medium">Your price (¥) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full border p-2 rounded mb-4 pl-8"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="000"
                  />
                </div>
                <button
                  className="w-full bg-[#F0B100] hover:bg-[#F0B100] text-white font-medium py-2.5 px-4 rounded-lg disabled:opacity-50 cursor-pointer"
                  onClick={submitPrice}
                  disabled={price === "" || Number.isNaN(parseFloat(price)) || parseFloat(price) < 0 || updating}
                >
                  {updating ? "Updating…" : "Update price"}
                </button>
              </>
            )
          ) : loading ? (
            <p className="text-sm text-gray-600">Loading…</p>
          ) : useExisting ? (
            <>
              <p className="text-sm text-gray-600 mb-4">Your price is already set. Confirm pickup details and accept.</p>
              <p className="text-lg font-semibold mb-4">¥{(existingPrice ?? 0).toLocaleString()}</p>
              {renderFulfillmentFields()}
              <button
                className="w-full bg-[#F0B100] hover:bg-[#F0B100] text-white font-medium py-2.5 px-4 rounded-lg cursor-pointer"
                onClick={acceptWithExistingPrice}
              >
                Accept Offer
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">Enter your price and pickup details to accept this offer.</p>
              <label className="block mb-2 text-sm font-medium">Your price (¥) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border p-2 rounded mb-4 pl-8"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="000"
                />
              </div>
              {renderFulfillmentFields()}
              <button
                className="w-full bg-[#F0B100] hover:bg-[#F0B100] text-white font-medium py-2.5 px-4 rounded-lg disabled:opacity-50 cursor-pointer"
                onClick={submitPrice}
                disabled={price === "" || Number.isNaN(parseFloat(price)) || parseFloat(price) < 0}
              >
                Accept Offer
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
