import type { DashboardAnalytics, NextsrPayload, SecurityCandidate } from "./nextsrPayload";

type ReportSlide = {
  title: string;
  lines: string[];
};

const encoder = new TextEncoder();

function cleanText(value: string | number | null | undefined) {
  return String(value ?? "N/A").replace(/\s+/g, " ").trim();
}

function wrapText(value: string, width = 92) {
  const words = cleanText(value).split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
      continue;
    }
    if (`${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  return `$${Math.round(value).toLocaleString()}`;
}

function numberText(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined) return "N/A";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
}

export function buildReportSlides(payload: NextsrPayload, dashboard: DashboardAnalytics, candidates: SecurityCandidate[]): ReportSlide[] {
  const topCandidate = candidates[0];
  const referenceLines = dashboard.chart_reference_lines
    .slice(0, 4)
    .map((line) => `${line.label}: ${line.value_bps.toFixed(1)} bps (${line.source})`);
  const peerRows = dashboard.peer_rv
    .slice(0, 5)
    .map((row) => `${row.maturity_bucket}: issuer ${numberText(row.issuer_spread_bps, " bps")} vs peer ${numberText(row.peer_median_spread_bps, " bps")} / gap ${numberText(row.peer_gap_bps, " bps")}`);
  const candidateRows = candidates
    .slice(0, 6)
    .map((row) => `${row.cusip}: ${row.signal}; spread ${numberText(row.spread_to_benchmark_bps, " bps")}; liquidity ${numberText(row.liquidity_score)}; RV ${numberText(row.rv_score)}`);

  return [
    {
      title: `${payload.issuer ?? "Issuer"} Secondary Market Snapshot`,
      lines: [
        `As of ${payload.as_of_date ?? "N/A"} / bucket ${payload.maturity_bucket ?? "N/A"}.`,
        dashboard.desk_snapshot.thesis,
        dashboard.desk_snapshot.market_read,
        dashboard.desk_snapshot.action_bias,
        `Confidence: ${dashboard.desk_snapshot.confidence}.`
      ]
    },
    {
      title: "Methodology Lock",
      lines: [
        dashboard.admin.benchmark_policy,
        `Active benchmark: ${dashboard.benchmark_governance.active_source ?? "N/A"}.`,
        `Benchmark points: ${dashboard.benchmark_governance.active_points.toLocaleString()}; fallback points used: ${dashboard.benchmark_governance.fallback_points_used.toLocaleString()}.`,
        dashboard.benchmark_governance.rating_curve_selector
      ]
    },
    {
      title: "Core Signals",
      lines: [
        `Current spread: ${numberText(payload.signals.spread.current_spread_bps, " bps")}.`,
        `Spread change: ${numberText(payload.signals.spread.spread_change_bps, " bps")}.`,
        `Historical percentile: ${numberText(payload.signals.spread.historical_percentile_1y, "%")}.`,
        `Liquidity score: ${numberText(payload.signals.liquidity.liquidity_score)} across ${payload.signals.liquidity.trade_count.toLocaleString()} recent trade(s).`,
        `Flow imbalance: ${numberText(payload.signals.flow.sell_buy_imbalance)}.`
      ]
    },
    {
      title: "Reference Lines",
      lines: referenceLines.length ? referenceLines : ["No reference lines were generated."]
    },
    {
      title: "Peer Relative Value",
      lines: peerRows.length ? peerRows : ["Peer RV rows were not available for this issuer."]
    },
    {
      title: "Top CUSIP Opportunities",
      lines: [
        topCandidate ? `Top candidate: ${topCandidate.cusip} / ${topCandidate.signal}.` : "No top candidate available.",
        ...candidateRows
      ]
    },
    {
      title: "Recommendation",
      lines: [
        dashboard.recommendation.summary,
        ...dashboard.recommendation.drivers.slice(0, 5),
        ...dashboard.recommendation.caveats.slice(0, 3).map((item) => `Caveat: ${item}`)
      ]
    },
    {
      title: "Next Steps",
      lines: dashboard.desk_snapshot.next_steps.length ? dashboard.desk_snapshot.next_steps : ["Review methodology, benchmark audit, and CUSIP drilldown before distribution."]
    }
  ];
}

function pdfEscape(value: string) {
  return cleanText(value)
    .replace(/[^\x20-\x7E]/g, "-")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function createPdfBlob(slides: ReportSlide[]) {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const objects: string[] = [];
  const pageObjectIds: number[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const slide of slides) {
    const content: string[] = [];
    content.push("BT /F1 18 Tf 48 744 Td 0 0 0 rg");
    content.push(`(${pdfEscape(slide.title)}) Tj`);
    content.push("ET");
    let y = 710;
    for (const line of slide.lines.flatMap((item) => wrapText(item, 88))) {
      if (y < 72) break;
      content.push(`BT /F1 10 Tf ${margin} ${y} Td 0 0 0 rg (${pdfEscape(line)}) Tj ET`);
      y -= 18;
    }
    const stream = content.join("\n");
    const contentId = objects.length + 1;
    objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
    const pageId = objects.length + 1;
    pageObjectIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;
  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  let offset = chunks[0].length;
  objects.forEach((object, index) => {
    const obj = `${index + 1} 0 obj\n${object}\nendobj\n`;
    offsets.push(offset);
    chunks.push(obj);
    offset += obj.length;
  });
  const xrefOffset = offset;
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let index = 1; index <= objects.length; index += 1) {
    chunks.push(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob(chunks, { type: "application/pdf" });
}

function xmlEscape(value: string) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value: number) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function uint32(value: number) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function createZip(files: Array<{ path: string; content: string }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const name = encoder.encode(file.path);
    const content = encoder.encode(file.content);
    const crc = crc32(content);
    const localHeader = concatBytes([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(crc),
      uint32(content.length),
      uint32(content.length),
      uint16(name.length),
      uint16(0),
      name
    ]);
    localParts.push(localHeader, content);

    const centralHeader = concatBytes([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(crc),
      uint32(content.length),
      uint32(content.length),
      uint16(name.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(localOffset),
      name
    ]);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + content.length;
  }

  const central = concatBytes(centralParts);
  const end = concatBytes([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(central.length),
    uint32(localOffset),
    uint16(0)
  ]);
  return concatBytes([...localParts, central, end]);
}

function paragraphXml(text: string, size = 1800, bold = false) {
  return `<a:p><a:r><a:rPr lang="en-US" sz="${size}"${bold ? ' b="1"' : ""}/><a:t>${xmlEscape(text)}</a:t></a:r></a:p>`;
}

function textBoxXml(id: number, name: string, x: number, y: number, w: number, h: number, paragraphs: string) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

function slideXml(slide: ReportSlide, index: number) {
  const title = textBoxXml(2, "Title", 420000, 280000, 8300000, 620000, paragraphXml(slide.title, 3200, true));
  const bodyLines = slide.lines.flatMap((line) => wrapText(line, 86)).slice(0, 18);
  const body = textBoxXml(3, "Body", 520000, 1050000, 7900000, 5150000, bodyLines.map((line) => paragraphXml(`- ${line}`, 1700)).join(""));
  const footer = textBoxXml(4, "Footer", 520000, 6620000, 7900000, 280000, paragraphXml(`NextSR export / slide ${index}`, 1100));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${title}${body}${footer}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function themeXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="NextSR"><a:themeElements><a:clrScheme name="NextSR"><a:dk1><a:srgbClr val="111827"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="263343"/></a:dk2><a:lt2><a:srgbClr val="F8FAFC"/></a:lt2><a:accent1><a:srgbClr val="0F766E"/></a:accent1><a:accent2><a:srgbClr val="2563EB"/></a:accent2><a:accent3><a:srgbClr val="E11D48"/></a:accent3><a:accent4><a:srgbClr val="F59E0B"/></a:accent4><a:accent5><a:srgbClr val="64748B"/></a:accent5><a:accent6><a:srgbClr val="14B8A6"/></a:accent6><a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme><a:fontScheme name="NextSR"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="NextSR"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="105000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:shade val="85000"/><a:satMod val="105000"/></a:schemeClr></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:shade val="85000"/><a:satMod val="155000"/></a:schemeClr></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}

function createPptxBlob(slides: ReportSlide[]) {
  const slideFiles = slides.map((slide, index) => ({
    path: `ppt/slides/slide${index + 1}.xml`,
    content: slideXml(slide, index + 1)
  }));
  const slideRels = slides.map((_, index) => ({
    path: `ppt/slides/_rels/slide${index + 1}.xml.rels`,
    content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`
  }));
  const slideOverrides = slides.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  const slideIds = slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("");
  const presentationRels = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>',
    ...slides.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`)
  ].join("");

  const files = [
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}</Types>`
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`
    },
    {
      path: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>NextSR Secondary Market Report</dc:title><dc:creator>NextSR Upload Generator</dc:creator></cp:coreProperties>`
    },
    {
      path: "docProps/app.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>NextSR Upload Generator</Application><PresentationFormat>On-screen Show</PresentationFormat><Slides>${slides.length}</Slides></Properties>`
    },
    {
      path: "ppt/presentation.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="9144000" cy="6858000" type="screen4x3"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`
    },
    {
      path: "ppt/_rels/presentation.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presentationRels}</Relationships>`
    },
    {
      path: "ppt/slideMasters/slideMaster1.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`
    },
    {
      path: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`
    },
    {
      path: "ppt/slideLayouts/slideLayout1.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
    },
    {
      path: "ppt/theme/theme1.xml",
      content: themeXml()
    },
    ...slideFiles,
    ...slideRels
  ];

  return new Blob([createZip(files)], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}

export function buildPdfReportBlob(payload: NextsrPayload, dashboard: DashboardAnalytics, candidates: SecurityCandidate[]) {
  return createPdfBlob(buildReportSlides(payload, dashboard, candidates));
}

export function buildPptxReportBlob(payload: NextsrPayload, dashboard: DashboardAnalytics, candidates: SecurityCandidate[]) {
  return createPptxBlob(buildReportSlides(payload, dashboard, candidates));
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
