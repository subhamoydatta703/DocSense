import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getParsedData } from "./getDataService";

// get string from getDataService -> creates chunks of that string
export const createChunks = async (documentID: string): Promise<string[]> => {
    try {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const textData = await getParsedData(documentID)
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
