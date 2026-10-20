import type { Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { ServiceError } from "../../errors/serviceError";
import { replaceDocumentService } from "../../services/document/replaceDocumentService";

const replacementSchema = z.object({
  replacementId: z.string().uuid(),
  expectedSourceKey: z.string().min(1).max(1024),
  expectedReplacementKey: z.string().min(1).max(1024),
}).strict();

export async function replaceDocumentController(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ success: false, message: "Please sign in again." });
    const documentId = z.string().uuid().parse(req.params.documentId);
    const replacement = replacementSchema.parse(req.body);
    const document = await replaceDocumentService(req.userId, { documentId, ...replacement });
    return res.status(200).json({ success: true, message: "Source replaced successfully.", document });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: "Provide valid source IDs and versions.", errors: error.issues });
    }
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error("Source replacement failed", { errorType: error instanceof Error ? error.name : "UnknownError" });
    return res.status(500).json({ success: false, message: "The source could not be replaced. Refresh your sources before trying again." });
  }
}
