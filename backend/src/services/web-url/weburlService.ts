import puppeteer from 'puppeteer';


export const webUrlContentService = async (url:string): Promise<{ content: string; originalName: string }> => {

    const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

    try{
        const page = await browser.newPage();
        await page.goto(url);
        const content = await page.evaluate(() => {
            return document.body.innerText;
        })

        const title = (await page.title()).trim();
        
        return {
            content,
            originalName: title || new URL(url).hostname
        };

    } catch (error) {
        console.error("webUrlContentService error ", error);
        throw error;
    }
    finally{
        await browser.close();
    }
}