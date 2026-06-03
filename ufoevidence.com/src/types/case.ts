import type { CaseDocument, MediaItem, SourceRecord } from "./source.js";
import type { CaseScores, EffectAnalysis } from "./scoring.js";

export type Investigation = {
  title?: string;
  organization?: string;
  findings?: string;
  url?: string;
  rawText?: string;
};

export type CaseSummary = {
  caseId: string;
  title: string;
  url: string;
  date?: string;
  year?: number;
  location?: {
    country?: string;
    state?: string;
    city?: string;
    lat?: number;
    lng?: number;
  };
  categories: string[];
  tags: string[];
  status?: string;
  caseScore?: number;
  witnessQualityScore?: number;
  evidenceQualityScore?: number;
};

export type CaseRecord = CaseSummary & {
  subtitle?: string;
  summary?: string;
  keyQuote?: string;
  witnessType?: string;
  witnessCount?: string | number;
  investigations?: Investigation[];
  scores?: CaseScores;
  effects?: EffectAnalysis[];
  sources?: SourceRecord[];
  documents?: CaseDocument[];
  media?: MediaItem[];
  rawSections?: Record<string, string>;
  retrievedAt: string;
};
