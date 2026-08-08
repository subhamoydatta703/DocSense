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

    console.log("Transcript fetched successfully:", docs);
    return docs;

  } catch (error) {
    console.error("Error fetching video transcript:", error);
    throw error;
  }
}