import { extractWebPageText } from "../../utils/webPageText";
import { fetchPublicHtml } from "../../utils/urlSecurity";


/**
 * Fetches HTML from public URL, removes scripts/styles, and extracts readable body text and title.
 */
export const webUrlContentService = async (url: string): Promise<{ content: string; originalName: string }> => {

    try {
        const { html, finalUrl } = await fetchPublicHtml(url);
        const { content, title } = extractWebPageText(html);

        return {
            content,
            originalName: title || finalUrl.hostname,
        };

    } catch (error) {
        console.error("webUrlContentService error ", error);
        throw error;
    }
}
