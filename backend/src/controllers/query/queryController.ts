import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { userQueryWithEvidence } from "../../services/query/queryService";
import { GuardrailError } from "../../errors/guardRailError";
import { ServiceError } from "../../errors/serviceError";
import { queryPolicy } from "../../config/ai/policy";
import { abortable } from "../../utils/deadline";
import { z } from "zod";

const QuerySchema = z.object({ query: z.string().trim().min(1).max(10_000), documentId: z.string().uuid().optional() });

export const queryController = async (req: AuthenticatedRequest, res: Response) => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abortOnDisconnect = () => {
    if (!res.writableEnded) controller.abort(new DOMException("Client disconnected", "AbortError"));
  };
  try {
    if (!req.userId) return res.status(401).json({ success: false, message: "Please sign in again." });
    const { query, documentId } = QuerySchema.parse(req.body);
    timer = setTimeout(() => controller.abort(new DOMException("Question deadline reached", "TimeoutError")), queryPolicy.requestMs);
    res.on("close", abortOnDisconnect);
    const result = await abortable(userQueryWithEvidence(query, req.userId, documentId, controller.signal), controller.signal);
    if (res.destroyed || res.headersSent) return;
    return res.status(200).json({ success: true, message: "Query processed successfully", ...result });
  } catch (error) {
    if (res.destroyed || res.headersSent) return;
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, message: "Please provide a valid question and document ID.", errors: error.issues });
    if (error instanceof GuardrailError) return res.status(400).json({ success: false, message: error.message, category: error.category });
    if (error instanceof ServiceError) {
      if (error.status === 429 || error.status === 503) res.set("Retry-After", "30");
      return res.status(error.status).json({ success: false, message: error.message, stage: error.stage });
    }
    if (controller.signal.aborted) return res.status(504).json({ success: false, message: "The request took too long to respond. Please try again." });
    console.error("Query request failed", { errorType: error instanceof Error ? error.name : "UnknownError" });
    return res.status(500).json({ success: false, message: "The server could not complete this request." });
  } finally {
    clearTimeout(timer);
    res.off("close", abortOnDisconnect);
    controller.abort();
  }
};
