import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";


export const createChunks = async (documentText: string) => {
    try {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 15,
            chunkOverlap: 5,
        });

        const chunks = await splitter.splitText(documentText)
        // console.log(chunks);
        let i =1
        for(let chunk of chunks){
            console.log(`Chunk number ${i} is "${chunk}"`);
            i=i+1;
            
        }
        
    } catch (error) {
        console.error("Error in chunk service: ", error);
        throw error;


    }
}


createChunks("Hello this is subhamoy. I am good at mathematics, physics, I love to use ai in learning purposes.")