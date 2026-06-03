export type SourceRecord = {
  sourceId?: string;
  title?: string;
  organization?: string;
  author?: string;
  year?: string | number;
  type?: string;
  scope?: string;
  findings?: string;
  url?: string;
  rawText?: string;
};

export type CaseDocument = {
  title: string;
  type?: "spreadsheet" | "pdf" | "doc" | "web" | "unknown";
  url: string;
  description?: string;
};

export type MediaItem = {
  title?: string;
  type?: "image" | "video" | "audio" | "unknown";
  url: string;
  description?: string;
};
