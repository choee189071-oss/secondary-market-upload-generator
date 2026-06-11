"use client";

import { FormEvent, useMemo, useState } from "react";
import type { NextsrPayload, PayloadValidation } from "@/lib/nextsrPayload";

const maturityBuckets = ["", ...Array.from({ length: 40 }, (_, index) => `${index + 1}Y`)];
const lookbackOptions = [7, 30, 60, 90, 180, 365];
const validationOrder = ["cusip", "trade_date", "yield", "maturity", "trade_amount", "index_rate", "spread", "trade_type", "price", "ratings"];

function formatNumber(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined) {
    return "N/A";
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [issuer, setIssuer] = useState("");
  const [maturityBucket, setMaturityBucket] = useState("");
  const [periodDays, setPeriodDays] = useState(30);
  const [payload, setPayload] = useState<NextsrPayload | null>(null);
  const [validation, setValidation] = useState<PayloadValidation | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const jsonText = useMemo(() => (payload ? JSON.stringify(payload, null, 2) : ""), [payload]);
  const downloadHref = useMemo(() => {
    if (!jsonText) {
      return "";
    }
    return `data:application/json;charset=utf-8,${encodeURIComponent(jsonText)}`;
  }, [jsonText]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Select a CSV or Excel trade file.");
      return;
    }

    setError("");
    setIsLoading(true);
    setPayload(null);
    setValidation(null);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("issuer", issuer);
    formData.set("maturityBucket", maturityBucket);
    formData.set("periodDays", String(periodDays));

    try {
      const response = await fetch("/api/nextsr-payload", {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Payload generation failed.");
      }
      setPayload(data.payload);
      setValidation(data.validation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payload generation failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>NextSR Upload Generator</h1>
          <span>Municipal secondary-market payload workspace</span>
        </div>
        <span className="status-pill">nextsr_payload.v1</span>
      </header>

      <div className="workspace">
        <section className="panel">
          <h2>Input</h2>
          <form className="form-stack" onSubmit={submit}>
            <div className="field">
              <label htmlFor="trade-file">Trade File</label>
              <input
                id="trade-file"
                accept=".csv,.xlsx,.xls,text/csv"
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>

            <div className="field">
              <label htmlFor="issuer">Issuer</label>
              <input
                id="issuer"
                value={issuer}
                onChange={(event) => setIssuer(event.target.value)}
                placeholder="Auto-detect from file name"
              />
            </div>

            <div className="field">
              <label htmlFor="bucket">Maturity Bucket</label>
              <select id="bucket" value={maturityBucket} onChange={(event) => setMaturityBucket(event.target.value)}>
                {maturityBuckets.map((bucket) => (
                  <option key={bucket || "auto"} value={bucket}>
                    {bucket || "Auto"}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="lookback">Lookback</label>
              <select id="lookback" value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}>
                {lookbackOptions.map((days) => (
                  <option key={days} value={days}>
                    {days}D
                  </option>
                ))}
              </select>
            </div>

            <button className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? "Generating..." : "Generate Payload"}
            </button>
          </form>

          {validation ? (
            <div className="validation-panel">
              <div className="validation-summary">
                <div>
                  <span>Raw Rows</span>
                  <strong>{validation.raw_rows.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Model Ready</span>
                  <strong>{validation.model_ready_rows.toLocaleString()}</strong>
                </div>
              </div>
              <div className="field-grid">
                {validationOrder.map((field) => {
                  const detected = validation.detected_fields[field];
                  const isMissing = detected === null;
                  return (
                    <div className={isMissing ? "field-chip missing" : "field-chip"} key={field}>
                      <span>{field}</span>
                      <strong>{detected ?? "missing"}</strong>
                    </div>
                  );
                })}
              </div>
              {validation.missing_required.length ? (
                <div className="validation-warning">Missing required: {validation.missing_required.join(", ")}</div>
              ) : null}
              {validation.missing_recommended.length ? (
                <div className="validation-note">Missing recommended: {validation.missing_recommended.join(", ")}</div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="panel">
          <div className="toolbar">
            <h2>Output</h2>
            {payload ? (
              <a className="secondary-button" href={downloadHref} download="nextsr_payload.json">
                Download JSON
              </a>
            ) : null}
          </div>

          {error ? <div className="error-state">{error}</div> : null}

          {!error && !payload ? <div className="empty-state">No payload generated.</div> : null}

          {payload ? (
            <div className="content-grid">
              <div className="metrics">
                <div className="metric">
                  <span>Issuer</span>
                  <strong>{payload.issuer ?? "N/A"}</strong>
                </div>
                <div className="metric">
                  <span>Bucket</span>
                  <strong>{payload.maturity_bucket ?? "N/A"}</strong>
                </div>
                <div className="metric">
                  <span>Label</span>
                  <strong>{payload.label}</strong>
                </div>
                <div className="metric">
                  <span>As Of</span>
                  <strong>{payload.as_of_date ?? "N/A"}</strong>
                </div>
                <div className="metric">
                  <span>Spread</span>
                  <strong>{formatNumber(payload.signals.spread.current_spread_bps, " bps")}</strong>
                </div>
                <div className="metric">
                  <span>Liquidity</span>
                  <strong>{formatNumber(payload.signals.liquidity.liquidity_score)}</strong>
                </div>
                <div className="metric">
                  <span>Trade Rows</span>
                  <strong>{payload.universe.trade_rows.toLocaleString()}</strong>
                </div>
                <div className="metric">
                  <span>CUSIPs</span>
                  <strong>{payload.universe.cusip_count.toLocaleString()}</strong>
                </div>
              </div>
              <pre className="json-block">{jsonText}</pre>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
