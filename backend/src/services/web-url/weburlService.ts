import { extractWebPageText } from "../../utils/webPageText";
import { fetchPublicHtml } from "../../utils/urlSecurity";
import { assertUsableWebPage } from "../../utils/webPageText";


/**
 * Fetches HTML from public URL, removes scripts/styles, and extracts readable body text and title.
 */
export const webUrlContentService = async (url: string): Promise<{ content: string; originalName: string }> => {

    try {
        const { html, finalUrl } = await fetchPublicHtml(url);
        const { content, title } = extractWebPageText(html);
        assertUsableWebPage(content, title);

        return {
            content,
            originalName: (title || finalUrl.hostname).slice(0, 250),
        };

    } catch (error) {
        console.error("webUrlContentService error ", error);
        throw error;
    }
}
