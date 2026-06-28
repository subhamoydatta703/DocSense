import { z } from "zod";

export const CreateDocumentSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  s3Key: z.string().min(1, "S3 key is required"),
  originalName: z.string().min(1, "Original name is required"),
  userId: z.string().uuid("Invalid user ID format"),
});
export const CreatedUserSchema = z.object({
  id: z.string().min(1, "ID is required"),
  email: z.string().email("Invalid email format"),
});
