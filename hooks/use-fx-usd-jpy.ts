"use client";

import { useEffect, useState } from "react";
import {
  convertJpyToUsdWithBufferFromQuote,
  formatUsdAmount,
  type FxUsdJpyQuote,
} from "@/lib/fx-rate";

export type FxUsdJpyApiResponse = {
  ok: boolean;
  jpyPerUsd?: number;
  rateDate?: string;
  fetchedAt?: string;
  source?: string;
  fxProtectionPct?: number;
  rateLabel?: string;
  error?: string;
};

type FxState =
  | { status: "loading" }
  | { status: "ready"; quote: FxUsdJpyQuote; fxProtectionPct: number; rateLabel: string }
  | { status: "error" };

let shared: Promise<FxState> | null = null;
let sharedResult: { state: FxState; at: number } | null = null;
const CLIENT_CACHE_MS = 60 * 60 * 1000;

async function loadFxState(): Promise<FxState> {
  if (sharedResult && Date.now() - sharedResult.at < CLIENT_CACHE_MS) {
    return sharedResult.state;
  }
  if (!shared) {
    shared = (async () => {
      try {
        const res = await fetch("/api/fx/usd-jpy", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as FxUsdJpyApiResponse | null;
        if (!res.ok || !data?.ok || data.jpyPerUsd == null || !data.rateDate || !data.fetchedAt) {
          return { status: "error" } as const;
        }
        const quote: FxUsdJpyQuote = {
          jpyPerUsd: data.jpyPerUsd,
          rateDate: data.rateDate,
          fetchedAt: data.fetchedAt,
          source: "frankfurter_ecb",
        };
        const fxProtectionPct =
          typeof data.fxProtectionPct === "number" && Number.isFinite(data.fxProtectionPct)
            ? data.fxProtectionPct
            : 3;
        const state: FxState = {
          status: "ready",
          quote,
          fxProtectionPct,
          rateLabel: data.rateLabel ?? "",
        };
        sharedResult = { state, at: Date.now() };
        return state;
      } catch {
        return { status: "error" } as const;
      } finally {
        shared = null;
      }
    })();
  }
  return shared;
}

/** Shared Frankfurter USD/JPY quote for advisor itinerary views (one fetch per session). */
export function useFxUsdJpy(): FxState {
  const [state, setState] = useState<FxState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void loadFxState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function usdEstimateFromFxState(
  jpy: number | null | undefined,
  fx: FxState
): { usdFinal: number; rateLabel: string } | null {
  if (fx.status !== "ready") return null;
  if (jpy == null || !Number.isFinite(Number(jpy))) return null;
  const conversion = convertJpyToUsdWithBufferFromQuote(
    Number(jpy),
    fx.quote,
    fx.fxProtectionPct
  );
  return { usdFinal: conversion.usdFinal, rateLabel: fx.rateLabel || "" };
}

/** USD-only line for advisor UI — never show JPY beside USD (no conversion spot-check). */
export function formatJpyUsdPriceLine(
  jpy: number | null | undefined,
  fx: FxState
): { label: string; title: string | null } | null {
  if (jpy == null || !Number.isFinite(Number(jpy))) return null;

  const usd = usdEstimateFromFxState(jpy, fx);
  if (usd) {
    return {
      label: `~US$${formatUsdAmount(usd.usdFinal)}`,
      title: usd.rateLabel,
    };
  }

  if (fx.status === "loading") {
    return { label: "…", title: null };
  }

  // Rate unavailable — fall back to JPY alone (single currency, nothing to compare).
  return {
    label: `¥${Math.round(Number(jpy)).toLocaleString()}`,
    title: null,
  };
}
