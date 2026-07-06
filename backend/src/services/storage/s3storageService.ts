import { s3Client } from "../../config/aws/s3Client";
import {Readable} from "stream";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";


// uploadfile to s3
export const uploadFile = async (fileBuffer: Buffer, key: string): Promise<string> => {
    try {
        const command = new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME!,
            Body: fileBuffer,
            Key: key,
        });
        await s3Client.send(command);
        return key;
    } catch (error) {
        console.error("Error uploading file:", error);
        throw error;
    }
}


// stream to buffer conversion

// for node.js readable stream
const streamToBuffer = async (stream: any): Promise<Buffer> => {
  // Handle web ReadableStream (Bun) by converting to Node stream
  if (typeof stream.on !== "function" && typeof stream.getReader === "function") {
    stream = Readable.fromWeb(stream);
  }
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on("data", (chunk: any) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (error: any) => reject(error));
  });
};

// get file to s3
export const getFile = async (key: string): Promise<Buffer> => {

    try {
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME!,
            Key: key,
        })

        const response = await s3Client.send(command);
        if (!response.Body) {
            throw new Error("File not found");
        }
        const data = await streamToBuffer(response.Body);
        return data;

    } catch (error) {
        console.error("Error getting file:", error);
        throw error;
    }

}

// delete file from s3

export const deleteFile = async (key: string): Promise<void> => {
    try {
        const command = new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME!,
            Key: key,
        });
        await s3Client.send(command);
    } catch (error) {
        console.error("Error deleting file:", error);
        throw error;
    }
}