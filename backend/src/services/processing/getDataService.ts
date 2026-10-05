import { getFile } from "../storage/s3storageService";
import { prisma } from "../../config/db/db";
import { extractPDFText } from "../../utils/pdfParser";


/**
 * Fetches raw file buffer from S3 and extracts text content (PDF parsing or plain UTF-8 text).
 */
export const getParsedData = async (fileId: string, source?: { s3Key: string; sourceType: string }): Promise<string> => {
    try {
        const document = source ?? await prisma.document.findUnique({
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

