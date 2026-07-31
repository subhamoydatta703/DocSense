
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { webUrlContentService } from '../../services/web-url/weburlService';
import { uploadFile } from '../../services/storage/s3storageService';

import { DocumentQueue } from '../../queue/documentQueue';
import { createFileDBWebUrl } from '../../services/web-url/uploadWebUrlService';
import { CreateWebUrlSchema, blockedHostnames, blockedRanges } from '../../utils/urlSecurity';
// import { dns } from "bun"
import ipaddr from 'ipaddr.js';
import z from 'zod';


export const webUrlContent = async (req: AuthenticatedRequest, res: Response) => {
    try {


        // const url = req.body.url;
        // if (!url) {
        //     return res.status(400).json({
        //         success: false,
        //         message: "URL is required",
        //     });
        // }

        // blocked hostname check

        // security
        const validated = CreateWebUrlSchema.parse({ url: req.body.url });

        const parsedUrl = new URL(validated.url);
        const hostname = parsedUrl.hostname.toLowerCase();
        if (blockedHostnames.has(hostname)) {
            return res.status(400).json({
                success: false,
                message: "The provided URL is not allowed.",
            });
        }

        const ipAddresses = await Bun.dns.lookup(hostname);
        for (const add of ipAddresses) {
            const ip = ipaddr.parse(add.address);
            const range = ip.range();
            
            if(blockedRanges.has(range)){
                return res.status(400).json({
                    success: false,
                    message: "The provided URL is not allowed.",
                });
            }

        }

        const { content, originalName } = await webUrlContentService(validated.url);


        const userId = req.userId!;


        // Generate S3 key

        const safeName = originalName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");

        const s3Key = `web-sources/${Date.now()}-${safeName}.txt`;

        // Upload to S3
        const buffer = Buffer.from(content, "utf-8");
        const uploadedKey = await uploadFile(buffer, s3Key);

        // Save to DB
        const fileData = await createFileDBWebUrl(uploadedKey, originalName, validated.url, userId);

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

