import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { userQueryService } from "../../services/query/queryService";
import { GuardrailError } from "../../errors/guardRailError";
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
        const {query, documentId} = req.body;
        const answer = await userQueryService(query, req.userId, documentId);
        return res.status(200).json({
            success: true,
            message: "Query processed successfully",
            answer,
        });

        
    } catch (error) {
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