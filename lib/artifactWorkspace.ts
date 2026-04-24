export const LAST_ARTIFACT_PANEL_STORAGE_KEY = "niki_last_artifact_panel";

export type ArtifactSourceConfidence = "high" | "medium" | "low" | "none";

export type ArtifactKind = "notes" | "worked example" | "practice set" | "lecture summary";

export type ArtifactPanelState = {
  messageIndex: number | null;
  kind: ArtifactKind;
  title: string;
  sourcePrompt: string;
  content: string;
  savedArtifactId?: string | null;
  courseTag?: string | null;
  topicTag?: string | null;
  isPublic?: boolean | null;
  sourceCourse?: string | null;
  sourceConfidence?: ArtifactSourceConfidence | null;
  sourceAttached?: boolean;
};

export type SavedArtifact = {
  id: string;
  title: string;
  content: string;
  source_prompt?: string | null;
  kind?: ArtifactKind | null;
  course_tag?: string | null;
  topic_tag?: string | null;
  is_public?: boolean | null;
  created_at: string;
  updated_at?: string | null;
};

export function inferArtifactKind(sourcePrompt: string, content: string): ArtifactKind {
  const combined = `${sourcePrompt}\n${content}`.toLowerCase();
  if (/\b(practice|quiz|test|exam|drill|problem set|worksheet)\b/.test(combined)) {
    return "practice set";
  }
  if (/\b(summary|summarize|lecture|teach|explain|walk me through|missed class)\b/.test(combined)) {
    return "lecture summary";
  }
  if (/\b(notes|study guide|review sheet|key ideas)\b/.test(combined)) {
    return "notes";
  }
  if (/\b(step-by-step solution|final answer|formula used|step \d+:)\b/i.test(content)) {
    return "worked example";
  }
  return "notes";
}

function concatenatePdfChunks(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

export function buildSinglePagePdfFromJpeg(jpegBytes: Uint8Array, width: number, height: number) {
  const encoder = new TextEncoder();
  const pageWidth = Math.max(1, Math.round(width * 0.75));
  const pageHeight = Math.max(1, Math.round(height * 0.75));
  const contentStream = encoder.encode(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`);
  const objects: Uint8Array[] = [
    encoder.encode("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"),
    encoder.encode("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"),
    encoder.encode(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
    ),
    concatenatePdfChunks([
      encoder.encode(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.max(1, Math.round(width))} /Height ${Math.max(1, Math.round(height))} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
      ),
      jpegBytes,
      encoder.encode("\nendstream\nendobj\n"),
    ]),
    concatenatePdfChunks([
      encoder.encode(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n`),
      contentStream,
      encoder.encode("endstream\nendobj\n"),
    ]),
  ];

  const header = encoder.encode("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");
  const chunks: Uint8Array[] = [header];
  const offsets = [0];
  let offset = header.length;

  for (const objectBytes of objects) {
    offsets.push(offset);
    chunks.push(objectBytes);
    offset += objectBytes.length;
  }

  const xrefOffset = offset;
  const xrefLines = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((entryOffset) => `${entryOffset.toString().padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    `${xrefOffset}`,
    "%%EOF",
  ];
  chunks.push(encoder.encode(`${xrefLines.join("\n")}\n`));

  return new Blob([concatenatePdfChunks(chunks)], { type: "application/pdf" });
}

export function buildArtifactTitle(kind: ArtifactKind, sourcePrompt: string): string {
  const cleanedPrompt = sourcePrompt
    .replace(/\s+/g, " ")
    .replace(/^[^a-z0-9]+/i, "")
    .trim();

  if (!cleanedPrompt) {
    return kind === "lecture summary"
      ? "Lecture Summary"
      : kind === "practice set"
        ? "Practice Set"
        : kind === "worked example"
          ? "Worked Example"
          : "Study Notes";
  }

  const compactPrompt = cleanedPrompt.length > 72 ? `${cleanedPrompt.slice(0, 69).trimEnd()}...` : cleanedPrompt;
  const prefix =
    kind === "lecture summary"
      ? "Lecture Summary"
      : kind === "practice set"
        ? "Practice Set"
        : kind === "worked example"
          ? "Worked Example"
          : "Study Notes";

  return `${prefix} - ${compactPrompt}`;
}

export function artifactKindLabel(kind: ArtifactKind): string {
  return kind === "lecture summary"
    ? "Summary"
    : kind === "worked example"
      ? "Worked Example"
      : kind === "practice set"
        ? "Practice Set"
        : "Notes";
}

export function serializeArtifactWorkspace(panel: ArtifactPanelState | null): string | null {
  if (!panel) return null;
  return JSON.stringify({
    title: panel.title,
    content: panel.content,
    kind: panel.kind,
    courseTag: panel.courseTag ?? null,
    topicTag: panel.topicTag ?? null,
    isPublic: panel.isPublic ?? null,
  });
}

export function parseStoredArtifactPanel(rawValue: string | null): ArtifactPanelState | null {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<ArtifactPanelState>;
    if (
      typeof parsed?.title !== "string" ||
      typeof parsed?.content !== "string" ||
      typeof parsed?.sourcePrompt !== "string" ||
      (parsed?.kind !== "notes" &&
        parsed?.kind !== "worked example" &&
        parsed?.kind !== "practice set" &&
        parsed?.kind !== "lecture summary")
    ) {
      return null;
    }

    return {
      messageIndex:
        typeof parsed.messageIndex === "number" ? parsed.messageIndex : null,
      kind: parsed.kind,
      title: parsed.title,
      sourcePrompt: parsed.sourcePrompt,
      content: parsed.content,
      savedArtifactId:
        typeof parsed.savedArtifactId === "string" ? parsed.savedArtifactId : null,
      courseTag: typeof parsed.courseTag === "string" ? parsed.courseTag : null,
      topicTag: typeof parsed.topicTag === "string" ? parsed.topicTag : null,
      isPublic: typeof parsed.isPublic === "boolean" ? parsed.isPublic : null,
      sourceCourse:
        typeof parsed.sourceCourse === "string" ? parsed.sourceCourse : null,
      sourceConfidence:
        parsed.sourceConfidence === "high" ||
        parsed.sourceConfidence === "medium" ||
        parsed.sourceConfidence === "low" ||
        parsed.sourceConfidence === "none"
          ? parsed.sourceConfidence
          : null,
      sourceAttached: parsed.sourceAttached === true,
    };
  } catch {
    return null;
  }
}

export function sanitizeDownloadFilename(value: string, fallback: string) {
  const trimmed = value.trim();
  const safe = trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return safe || fallback;
}
