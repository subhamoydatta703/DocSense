import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getParsedData } from "./getDataService";

/**
 * Fetches parsed document text and splits it into semantic chunks using LangChain text splitter.
 */
export const createChunks = async (documentID: string, source?: { s3Key: string; sourceType: string }): Promise<string[]> => {
    try {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const textData = await getParsedData(documentID, source)
        const chunks = await splitter.splitText(textData as string)
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
