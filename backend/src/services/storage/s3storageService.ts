import { s3Client } from "../../config/aws/s3Client";
import { Readable } from "node:stream";
import { readBoundedStream } from "../../utils/boundedStream";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";


/**
 * Uploads a file buffer to AWS S3 storage with AES256 server-side encryption.
 */
export const uploadFile = async (fileBuffer: Buffer , key: string): Promise<string> => {
    try {
        const command = new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME!,
            Body: fileBuffer,
            Key: key,
            ServerSideEncryption: "AES256",
        });
        await s3Client.send(command, { abortSignal: AbortSignal.timeout(30_000) });
        return key;
    } catch (error) {
        console.error("Error uploading file:", error);
        throw error;
    }
}


/**
 * Downloads a file buffer from AWS S3 storage.
 */
export const getFile = async (key: string): Promise<Buffer> => {
    const signal = AbortSignal.timeout(30_000);
    try {
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME!,
            Key: key,
        })

        const response = await s3Client.send(command, { abortSignal: signal });
        if (!response.Body) {
            throw new Error("File not found");
        }
        const data = await readBoundedStream(response.Body as Readable | ReadableStream<Uint8Array>, signal, 6 * 1024 * 1024);
        return data;

    } catch (error) {
        console.error("Error getting file:", error);
        throw error;
    }

}

/**
 * Deletes a file object from AWS S3 storage.
 */
export const deleteFile = async (key: string): Promise<void> => {
    try {
        const command = new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME!,
            Key: key,
        });
        await s3Client.send(command, { abortSignal: AbortSignal.timeout(30_000) });
    } catch (error) {
        console.error("Error deleting file:", error);
        throw error;
    }
}
