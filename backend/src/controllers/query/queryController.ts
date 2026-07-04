import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { userQueryService } from "../../services/query/queryService";
export const queryController = async (req: AuthenticatedRequest, res: Response) => {
    try {

        //  user ask question in frontend input box
        // 1. use  req. value and get the value of the input
        if(!req.body.query){
            throw new Error("Please provide a query") ;
        }
        const {query} = req.body;
        // 2. call query service to get the answer
        const answer = await userQueryService(query);
        // 3. return the response thqat will show in the frontend 
        return res.status(200).json({
            success: true,
            message: "Query processed successfully",
            answer,
        });

        
    } catch (error) {
        console.error("Error in query controller: ", error);
        return res.status(500).json({
            success: false,
            message: "internal server error",
        });
    
    }
}