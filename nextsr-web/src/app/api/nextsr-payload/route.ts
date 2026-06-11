import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { buildNextsrPayloadFromFiles, type RawRow, type TradeFileInput } from "@/lib/nextsrPayload";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TRADE_FILES = 12;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;

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
    if (tradeFiles.length > MAX_TRADE_FILES) {
      return NextResponse.json({ error: `Too many trade files. Upload ${MAX_TRADE_FILES} or fewer files at a time.` }, { status: 413 });
    }
    const allFiles = [
      ...tradeFiles,
      ...(bondReference instanceof File ? [bondReference] : []),
      ...(issuerMapping instanceof File ? [issuerMapping] : []),
      ...(mmdBenchmark instanceof File ? [mmdBenchmark] : [])
    ];
    const oversized = allFiles.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) {
      return NextResponse.json({ error: `${oversized.name} is too large. Maximum file size is ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB.` }, { status: 413 });
    }
    const totalBytes = allFiles.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: `Upload bundle is too large. Maximum combined size is ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)}MB.` }, { status: 413 });
    }

    const parsedPeriodDays = Number(periodDaysRaw ?? 30);
    const periodDays = Number.isFinite(parsedPeriodDays) ? Math.max(1, Math.min(365, parsedPeriodDays)) : 30;
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
      periodDays
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected payload build error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function readTabularFile(file: File): Promise<RawRow[]> {
  const lowerName = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 8));
  const isZipWorkbook = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isLegacyWorkbook = lowerName.endsWith(".xls");
  const isCsv = lowerName.endsWith(".csv") || lowerName.endsWith(".txt");
  const isWorkbookName = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");

  if (isZipWorkbook || isLegacyWorkbook || isWorkbookName) {
    try {
      return readWorkbookRows(buffer);
    } catch (error) {
      if (isCsv && isZipWorkbook) {
        throw new Error(`${file.name} looks like an Excel workbook even though it is named .csv. Please export it as a real CSV, or rename/upload the original .xlsx file.`);
      }
      throw new Error(`Could not read workbook ${file.name}: ${error instanceof Error ? error.message : "Unsupported workbook format."}`);
    }
  }

  if (isCsv) {
    try {
      return parseCsvRows(new TextDecoder("utf-8").decode(buffer));
    } catch (error) {
      throw new Error(`Could not read CSV ${file.name}: ${error instanceof Error ? error.message : "Unsupported CSV format."}`);
    }
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
