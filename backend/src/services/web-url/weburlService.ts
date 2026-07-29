import puppeteer from 'puppeteer';


export const webUrlContentService = async (url:string) => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url);
    const content = page.evaluate(() => {
        return document.body.innerText;
    })
    await browser.close();
    return content;
}