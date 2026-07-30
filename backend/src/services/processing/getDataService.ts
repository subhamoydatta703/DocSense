import { getFile } from "../storage/s3storageService";
import { prisma } from "../../config/db/db";
import { extractPDFText } from "../../utils/pdfParser";


// get data from s3 -> parsed it to text -> return as string

export const getParsedData = async (fileId: string): Promise<String> => {
    try {
        const document = await prisma.document.findUnique({
            where: { id: fileId },
            select: { s3Key: true, sourceType: true },
        });
        if (!document) {
            throw new Error("Document not found");
        }
        const data = await getFile(document.s3Key);

        if (document.sourceType === "PDF") {
            return await extractPDFText(data);
        } else {
            return data.toString("utf-8");
        }


    } catch (error) {
        console.error("Error getting file:", error);
        throw error;
    }
}

