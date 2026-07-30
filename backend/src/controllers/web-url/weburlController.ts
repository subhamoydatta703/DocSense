import puppeteer from 'puppeteer';
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { webUrlContentService } from '../../services/web-url/weburlService';
import { uploadFile } from '../../services/storage/s3storageService';
import { createFileDB } from '../../services/document/uploadDocumentService';
import { DocumentQueue } from '../../queue/documentQueue';


export const webUrlContent = async (req: AuthenticatedRequest, res: Response) => {
    try {


        const url = req.body.url;
        if (!url) {
            return res.status(400).json({
                success: false,
                message: "URL is required",
            });
        }

        const { content, originalName } = await webUrlContentService(url);


        const userId = req.userId!;


        // Generate S3 key

        const safeName = originalName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");

        const s3Key = `web-sources/${Date.now()}-${safeName}.txt`;

        // Upload to S3
        const buffer = Buffer.from(content, "utf-8");
        const uploadedKey = await uploadFile(buffer, s3Key);

        // Save to DB
        const fileData = await createFileDB(uploadedKey, originalName, userId);

        console.log("fileData from upload document controller", JSON.stringify(fileData, null, 2));

        // add job to queue

        const job = await DocumentQueue.add(
            "document-analysis",
            {
                documentId: fileData.Document.id,
            },

        );
        console.log(
            "Added job",
            job.id,
            job.name
        );

        console.log("Job added successfully:", fileData.Document.id);

        const counts = await DocumentQueue.getJobCounts();
        console.log("QUEUE COUNTS:", counts);



        return res.status(200).json({
            success: true,
            message: "Document uploaded and processing started successfully",
            fileData,
        });

    } catch (error) {
        console.error("webUrlContent controller error ", error);
        throw error;
    }
}

