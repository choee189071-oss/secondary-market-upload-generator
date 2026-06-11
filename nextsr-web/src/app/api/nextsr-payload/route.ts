import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { buildNextsrPayloadFromCsv, buildNextsrPayloadFromRows, type RawRow } from "@/lib/nextsrPayload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const issuer = formData.get("issuer");
    const maturityBucket = formData.get("maturityBucket");
    const periodDaysRaw = formData.get("periodDays");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing trade file." }, { status: 400 });
    }

    const periodDays = Number(periodDaysRaw ?? 30);
    const commonInput = {
      sourceFile: file.name,
      issuer: typeof issuer === "string" ? issuer : null,
      maturityBucket: typeof maturityBucket === "string" ? maturityBucket : null,
      periodDays: Number.isFinite(periodDays) ? periodDays : 30
    };

    const lowerName = file.name.toLowerCase();
    const result = lowerName.endsWith(".csv")
      ? buildNextsrPayloadFromCsv({
          csvText: await file.text(),
          ...commonInput
        })
      : lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")
        ? buildNextsrPayloadFromRows({
            rows: readWorkbookRows(await file.arrayBuffer()),
            ...commonInput
          })
        : null;

    if (result === null) {
      return NextResponse.json({ error: "Upload a CSV, XLSX, or XLS trade file." }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected payload build error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function readWorkbookRows(buffer: ArrayBuffer): RawRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => name.toLowerCase() === "ag-grid") ?? workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false }).map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [cleanColumnName(key), value == null ? "" : String(value)]))
  );
}

function cleanColumnName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
