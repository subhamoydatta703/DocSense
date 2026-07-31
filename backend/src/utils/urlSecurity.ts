import { z } from "zod";

export const CreateWebUrlSchema = z.object({
  url: z
    .url("Invalid URL")
    .refine((url) => {
      const parsed = new URL(url);
      return parsed.protocol === "https:";
    }, {
      message: "Only HTTPS URLs are allowed",
    }),
});


export const blockedHostnames = new Set([
    "localhost",
    "localhost.localdomain",
]);

export const blockedRanges = new Set([
    "private",
    "loopback",
    "linkLocal",
]);
