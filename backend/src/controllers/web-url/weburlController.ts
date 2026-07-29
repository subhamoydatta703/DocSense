import puppeteer from 'puppeteer';
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { webUrlContentService } from '../../services/web-url/weburlService';


export const webUrlContent = async (req: AuthenticatedRequest, res: Response) => {
    try{
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    const url = req.body.url;
    if (!url) {
        return res.status(400).json({
            success: false,
            message: "URL is required",
        });
    }
   
    const content = await webUrlContentService(url);
   
    await browser.close();
    return res.status(200).json({
        success: true,
        message: "URL content fetched successfully",
        content,
    });
} catch (error) {
    console.error("webUrlContent controller error ", error);
    throw error;
}
}

