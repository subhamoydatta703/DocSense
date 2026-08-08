import { YoutubeLoader } from "@langchain/community/document_loaders/web/youtube"


export const transcriptYoutubeVideo = async (videoUrl: string) => {
    try {
        // 1. Fetch transcript and video info
        console.log("Fetching video transcript...");
        const loader = YoutubeLoader.createFromUrl(videoUrl, {
            language: "en",
            addVideoInfo: true,
        });
        const docs = await loader.load();

        // Extract title from metadata
        const title = docs?.[0]?.metadata?.title || "Unknown Title";

        // LangChain uses "author", not "channel"
        const channel = docs?.[0]?.metadata?.author || "Unknown Channel";

        // LangChain uses "source" 
        const sourceUrl = docs?.[0]?.metadata?.source || "";
        // Extract the exact video ID from the full source URL string
        const videoId = sourceUrl.split("v=")[1]?.split("&")[0] || "Unknown ID";

        // Extract the full transcript string from pageContent
        const transcriptContent = docs?.[0]?.pageContent || "";


        console.log("Transcript fetched successfully:", docs);
        console.log("Video Title:", title);
        console.log("Channel:", channel);
        console.log("Video ID:", videoId);

        return { transcriptContent, title, channel, videoId, sourceUrl };

    } catch (error) {
        console.error("Error fetching video transcript:", error);
        throw error;
    }
}