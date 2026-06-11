import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { buildNextsrPayloadFromFiles, type RawRow, type TradeFileInput } from "@/lib/nextsrPayload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const legacyFile = formData.get("file");
    const tradeFileEntries = formData.getAll("tradeFiles");
    const issuer = formData.get("issuer");
    const maturityBucket = formData.get("maturityBucket");
    const periodDaysRaw = formData.get("periodDays");
    const bondReference = formData.get("bondReference");
    const issuerMapping = formData.get("issuerMapping");
    const mmdBenchmark = formData.get("mmdBenchmark");

    const tradeFiles = tradeFileEntries.filter((entry): entry is File => entry instanceof File);
    if (legacyFile instanceof File && !tradeFiles.length) {
      tradeFiles.push(legacyFile);
    }

    if (!tradeFiles.length) {
      return NextResponse.json({ error: "Missing trade file(s)." }, { status: 400 });
    }

    const periodDays = Number(periodDaysRaw ?? 30);
    const parsedTradeFiles: TradeFileInput[] = [];
    for (const file of tradeFiles) {
      parsedTradeFiles.push({
        sourceFile: file.name,
        rows: await readTabularFile(file)
      });
    }

    const result = buildNextsrPayloadFromFiles({
      tradeFiles: parsedTradeFiles,
      bondRows: bondReference instanceof File ? await readTabularFile(bondReference) : undefined,
      issuerMappingRows: issuerMapping instanceof File ? await readTabularFile(issuerMapping) : undefined,
      mmdRows: mmdBenchmark instanceof File ? await readTabularFile(mmdBenchmark) : undefined,
      issuer: typeof issuer === "string" ? issuer : null,
      maturityBucket: typeof maturityBucket === "string" ? maturityBucket : null,
      periodDays: Number.isFinite(periodDays) ? periodDays : 30
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected payload build error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function readTabularFile(file: File): Promise<RawRow[]> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    return parseCsvRows(await file.text());
  }
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    return readWorkbookRows(await file.arrayBuffer());
  }
  throw new Error(`Unsupported file type for ${file.name}. Upload CSV, XLSX, or XLS files.`);
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

function parseCsvRows(text: string): RawRow[] {
  const workbook = XLSX.read(text, { type: "string" });
  const sheetName = workbook.SheetNames[0];
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
