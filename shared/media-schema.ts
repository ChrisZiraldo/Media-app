import { z } from "zod";

export const mediaTypeSchema = z.enum(["movie", "tv"]);
export const libraryStatusSchema = z.enum([
  "watchlist",
  "watching",
  "stopped",
  "watched",
]);
export const libraryViewSchema = z.enum([
  "continue",
  "caught-up",
  "watchlist",
  "finished",
  "stopped",
  "shows",
]);
export const noteSchema = z.string().trim().max(2000).nullable().optional();
export const mediaIdSchema = z.string().uuid();
export const episodeIdentitySchema = z.object({
  seasonNumber: z.number().int().min(0),
  episodeNumber: z.number().int().min(1),
});

export type MediaType = z.infer<typeof mediaTypeSchema>;
export type LibraryStatus = z.infer<typeof libraryStatusSchema>;
export type LibraryView = z.infer<typeof libraryViewSchema>;
