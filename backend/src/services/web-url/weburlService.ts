import puppeteer from 'puppeteer';


export const webUrlContentService = async (url:string):Promise<string> => {

    const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

    try{
        const page = await browser.newPage();
        await page.goto(url);
        const content = page.evaluate(() => {
            return document.body.innerText;
        })
        await browser.close();
        return content;

    } catch (error) {
        console.error("webUrlContentService error ", error);
        throw error;
    }
    finally{
        await browser.close();
    }
}