import { randomUUID } from "node:crypto";

import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { webUrlContentService } from '../../services/web-url/weburlService';
import { uploadFile } from '../../services/storage/s3storageService';

import { enqueueDocument } from '../../queue/documentQueue';
import { createFileDBWebUrl } from '../../services/web-url/uploadWebUrlService';
import { CreateWebUrlSchema, assertPublicHttpsUrl } from '../../utils/urlSecurity';
import z from 'zod';
import { splitSourceText, SourceValidationError } from '../../utils/sourceText';
import { ServiceError, runQueryStage } from '../../errors/serviceError';


/**
 * Validates public HTTPS URL, fetches readable HTML content, uploads to S3, and enqueues vector indexing.
 */
export const webUrlContent = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const validated = CreateWebUrlSchema.parse({ url: req.body.url });

        await assertPublicHttpsUrl(validated.url);

        const { content, originalName } = await runQueryStage("source_fetch", () => webUrlContentService(validated.url));
        await splitSourceText(content);


        const userId = req.userId!;


        // Generate S3 key

        const safeName = originalName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");

        const s3Key = `web-sources/${randomUUID()}-${safeName}.txt`;

        // Upload to S3
        const buffer = Buffer.from(content, "utf-8");
        const uploadedKey = await uploadFile(buffer, s3Key);

        // Save to DB
        const fileData = await createFileDBWebUrl(uploadedKey, originalName, validated.url, userId);

        console.info("Web source record created", { documentId: fileData.Document.id });

        await enqueueDocument(fileData.Document);



        return res.status(200).json({
            success: true,
            message: "Document saved. Processing will start when the queue is available.",
            fileData,
        });

    } catch (error) {
        if (error instanceof ServiceError) return res.status(error.status).json({ success: false, message: error.message, stage: error.stage });
        if (error instanceof SourceValidationError) return res.status(422).json({ success: false, message: error.message });
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: error.issues,
            });
        }
        console.error("webUrlContent controller error ", error);
       return res.status(500).json({
        success: false,
        message: "Error processing request",
       })
    }
}

