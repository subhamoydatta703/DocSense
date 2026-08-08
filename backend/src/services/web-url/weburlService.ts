import * as cheerio from 'cheerio';
import { fetchPublicHtml } from "../../utils/urlSecurity";


export const webUrlContentService = async (url: string): Promise<{ content: string; originalName: string }> => {

    try {
        const { html, finalUrl } = await fetchPublicHtml(url);
        const $ = cheerio.load(html);

        // Remove non-content elements (scripts, styles, nav, footer, etc.)
        $('script, style, noscript, iframe, nav, footer, header, aside, [role="navigation"], [role="banner"]').remove();

        // Extract visible text content
        const content = $('body').text().replace(/\s+/g, ' ').trim();

        // Extract title
        const title = ($('title').text() || '').trim();

        return {
            content,
            originalName: title || finalUrl.hostname,
        };

    } catch (error) {
        console.error("webUrlContentService error ", error);
        throw error;
    }
}
