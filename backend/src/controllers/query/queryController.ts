import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { userQueryService } from "../../services/query/queryService";
import { GuardrailError } from "../../errors/guardRailError";
import { ServiceError } from "../../errors/serviceError";
import { withDeadline } from "../../utils/deadline";
import { z } from "zod";
const QuerySchema = z.object({ query: z.string().trim().min(1).max(10_000), documentId: z.string().uuid().optional() });
/**
 * Handles user question requests by validating input, running RAG retrieval, and generating cited answers.
 */
export const queryController = async (req: AuthenticatedRequest, res: Response) => {
    try {
        if(!req.body){
            throw new Error("Please provide a query");
        }

        if(!req.userId){
            throw new Error("No user id found");
        }
        const {query, documentId} = QuerySchema.parse(req.body);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 90_000);
        const abortOnDisconnect = () => { if (!res.writableEnded) controller.abort(); };
        res.on("close", abortOnDisconnect);
        let answer: string;
        try {
            answer = await withDeadline(userQueryService(query, req.userId, documentId, controller.signal), 95_000, "Question request timed out");
        } catch (error) {
            if (controller.signal.aborted) throw new ServiceError(504, "The request timed out. Please try again.");
            throw error;
        } finally { clearTimeout(timer); res.off("close", abortOnDisconnect); controller.abort(); }
        return res.status(200).json({
            success: true,
            message: "Query processed successfully",
            answer,
        });

        
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ success: false, message: "Please provide a valid question and document ID.", errors: error.issues });
        if (error instanceof ServiceError) {
            if (error.status === 429 || error.status === 503) res.set("Retry-After", "30");
            return res.status(error.status).json({ success: false, message: error.message, stage: error.stage });
        }
         if (error instanceof GuardrailError) {
        return res.status(400).json({
            success: false,
            message: error.message,
            category: error.category,
        });
    }
        console.error("Error in query controller: ", error);
        return res.status(500).json({
            success: false,
            message: "internal server error",
        });
    
    }
}
