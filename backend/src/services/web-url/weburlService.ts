import * as cheerio from 'cheerio';


export const webUrlContentService = async (url: string): Promise<{ content: string; originalName: string }> => {

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Remove non-content elements (scripts, styles, nav, footer, etc.)
        $('script, style, noscript, iframe, nav, footer, header, aside, [role="navigation"], [role="banner"]').remove();

        // Extract visible text content
        const content = $('body').text().replace(/\s+/g, ' ').trim();

        // Extract title
        const title = ($('title').text() || '').trim();

        return {
            content,
            originalName: title || new URL(url).hostname,
        };

    } catch (error) {
        console.error("webUrlContentService error ", error);
        throw error;
    }
}