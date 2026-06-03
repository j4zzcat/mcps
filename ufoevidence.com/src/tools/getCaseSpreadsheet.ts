import { z } from "zod";
import type { UfoeService } from "./service.js";

export const getCaseSpreadsheetInput = {
  caseIdOrSlug: z.string().min(1),
  download: z.boolean().default(false),
};

export async function getCaseSpreadsheet(
  service: UfoeService,
  input: z.infer<z.ZodObject<typeof getCaseSpreadsheetInput>>,
) {
  const caseRecord = await service.getCase(input.caseIdOrSlug);
  const spreadsheets = (caseRecord.documents ?? []).filter((doc) => doc.type === "spreadsheet");

  return {
    caseId: caseRecord.caseId,
    title: caseRecord.title,
    spreadsheets,
    downloadSupported: false,
    note: input.download
      ? "Spreadsheet downloads are intentionally link-only in v1; public parsing can be added later without executing macros."
      : undefined,
    sourceUrl: caseRecord.url,
    retrievedAt: caseRecord.retrievedAt,
  };
}
