import { splitSourceText } from "../../utils/sourceText";
import { getParsedData } from "./getDataService";

/**
 * Fetches parsed document text and splits it into semantic chunks using LangChain text splitter.
 */
export const createChunks = async (documentID: string, source?: { s3Key: string; sourceType: string }): Promise<string[]> => {
    try {
        const textData = await getParsedData(documentID, source)
        const chunks = await splitSourceText(textData)
        console.info("Document chunking completed", {
            documentId: documentID,
            characterCount: textData.length,
            chunkCount: chunks.length,
        });
        return chunks;
    } catch (error) {
        console.error("Error in chunk service: ", error);
        throw error;


    }
}
