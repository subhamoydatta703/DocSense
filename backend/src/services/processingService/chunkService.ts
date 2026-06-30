import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getParsedData } from "./getData";


export const createChunks = async (documentID: string): Promise<string[]> => {
    try {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const textData = await getParsedData(documentID)
        console.log("Parsed Data: ", textData);
        const chunks = await splitter.splitText(textData as string)
        console.log("Chunks: ", chunks);
        return chunks;
    } catch (error) {
        console.error("Error in chunk service: ", error);
        throw error;


    }
}
