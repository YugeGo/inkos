import { z } from "zod";

export const PlatformSchema = z.string().trim().min(1);
export type Platform = z.infer<typeof PlatformSchema>;

export const GenreSchema = z.string().min(1);
export type Genre = z.infer<typeof GenreSchema>;

export const BookStatusSchema = z.enum([
  "incubating",
  "outlining",
  "active",
  "paused",
  "completed",
  "dropped",
]);
export type BookStatus = z.infer<typeof BookStatusSchema>;

export const FanficModeSchema = z.string().trim().min(1);
export type FanficMode = z.infer<typeof FanficModeSchema>;

export const BookConfigFeaturesSchema = z.object({
  authorMind: z.boolean().optional(),
}).strict().optional();
export type BookConfigFeatures = z.infer<typeof BookConfigFeaturesSchema>;

export const BookConfigSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  platform: PlatformSchema,
  genre: GenreSchema,
  status: BookStatusSchema,
  targetChapters: z.number().int().min(1),
  chapterWordCount: z.number().int().min(1),
  minChapterLength: z.number().int().min(1).optional(),
  maxChapterLength: z.number().int().min(1).optional(),
  language: z.enum(["zh", "en"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  parentBookId: z.string().optional(),
  fanficMode: FanficModeSchema.optional(),
  features: BookConfigFeaturesSchema,
}).strict();

export type BookConfig = z.infer<typeof BookConfigSchema>;

/**
 * Resolves whether the Author-Mind edition workflow is enabled for this book run.
 * Defaults to false for zero regression and explicit opt-in governance.
 */
export function resolveAuthorMindEnabled(
  book?: Partial<BookConfig> | null,
  explicitOverride?: boolean,
): boolean {
  if (explicitOverride !== undefined) {
    return explicitOverride;
  }
  return book?.features?.authorMind ?? false;
}
