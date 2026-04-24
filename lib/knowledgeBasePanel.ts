export type KnowledgeBaseCourse = {
  label: string;
  courseContext: string;
  shortLabel: string;
};

export type PinnedSyllabus = {
  name: string;
  content: string;
  pinnedAt: string;
};

export type RecentKnowledgeContext = {
  id: string;
  course: string;
  topic: string;
  updatedAt: string;
};

export type KnowledgeBaseStatus = {
  indexedLectureCount: number;
  courseCounts: Array<{ course: string; count: number }>;
  status: "Healthy" | "Warning" | "Missing";
};

export type SourceHealthState = {
  label: "Healthy" | "Warning" | "Missing";
  detail: string;
};
