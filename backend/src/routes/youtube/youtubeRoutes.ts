import { Router } from "express";
import { authMiddleware } from "../../middlewares/authMiddleware";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { rateLimiter } from "../../middlewares/rateLimiterMiddleware";
import { youtubeContent } from "../../controllers/youtube/youtubeController";
import { uploadYoutubeTranscript } from "../../controllers/youtube/youtubeTranscriptController";
import transcriptUpload from "../../middlewares/transcriptUploadMiddleware";
import multer from "multer";
import {
    buildGoogleAuthorizationUrl,
    getGoogleOAuthConfig,
    getGoogleTokenUrl,
} from "../../config/youtube/googleOAuth";
import {
    consumeYouTubeOAuthState,
    createYouTubeOAuthState,
} from "../../services/youtube/oauthStateService";
import {
    deleteGoogleOAuthTokens,
    getGoogleOAuthTokens,
    saveGoogleOAuthTokens,
} from "../../services/youtube/oauthTokenService";

const router = Router();

router.post("/youtube", authMiddleware, rateLimiter, youtubeContent);

router.post("/youtube/transcript-upload", authMiddleware, rateLimiter, (req, res, next) => {
  transcriptUpload.single("transcript")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === "LIMIT_FILE_SIZE"
        ? "Transcript file exceeds the 2MB limit."
        : `Upload error: ${err.message}`;
      return res.status(400).json({ success: false, message });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        message: err instanceof Error ? err.message : "Transcript upload failed.",
      });
    }
    return uploadYoutubeTranscript(req, res);
  });
});

router.get("/youtube/oauth/start", authMiddleware, async (req, res) => {
    try {
        const userId = (req as AuthenticatedRequest).userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const state = await createYouTubeOAuthState(userId);
        return res.json({
            success: true,
            authorizationUrl: buildGoogleAuthorizationUrl(state),
        });
    } catch (error) {
        console.error("YouTube OAuth start error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to start YouTube authorization.",
        });
    }
});

router.get("/youtube/oauth/callback", async (req, res) => {
    const { code, state, error: oauthError } = req.query;

    if (typeof state !== "string") {
        return res.status(400).json({ success: false, message: "Invalid OAuth state." });
    }

    const stateData = await consumeYouTubeOAuthState(state);
    if (!stateData) {
        return res.status(400).json({
            success: false,
            message: "OAuth state is invalid or expired.",
        });
    }

    if (typeof oauthError === "string") {
        return res.status(400).json({
            success: false,
            message: "YouTube authorization was not completed.",
        });
    }

    if (typeof code !== "string") {
        return res.status(400).json({ success: false, message: "Missing OAuth authorization code." });
    }

    try {
        const config = getGoogleOAuthConfig();
        const tokenResponse = await fetch(getGoogleTokenUrl(), {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: config.clientId,
                client_secret: config.clientSecret,
                redirect_uri: config.redirectUri,
                grant_type: "authorization_code",
            }),
        });

        if (!tokenResponse.ok) {
            console.error("Google OAuth token exchange failed with status", tokenResponse.status);
            return res.status(502).json({
                success: false,
                message: "YouTube authorization could not be completed.",
            });
        }

        const tokenPayload = await tokenResponse.json() as {
            access_token?: unknown;
            refresh_token?: unknown;
            expires_in?: unknown;
            scope?: unknown;
            token_type?: unknown;
        };

        if (
            typeof tokenPayload.access_token !== "string" ||
            typeof tokenPayload.refresh_token !== "string" ||
            typeof tokenPayload.expires_in !== "number"
        ) {
            return res.status(502).json({
                success: false,
                message: "Google did not return the required authorization tokens.",
            });
        }

        await saveGoogleOAuthTokens(stateData.userId, {
            accessToken: tokenPayload.access_token,
            refreshToken: tokenPayload.refresh_token,
            expiresAt: Date.now() + tokenPayload.expires_in * 1000,
            scope: typeof tokenPayload.scope === "string" ? tokenPayload.scope : undefined,
            tokenType: typeof tokenPayload.token_type === "string" ? tokenPayload.token_type : undefined,
        });

        const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173")
            .split(",")[0]!
            .trim();
        const redirectUrl = new URL(frontendUrl);
        redirectUrl.searchParams.set("youtube", "connected");
        return res.redirect(redirectUrl.toString());
    } catch (error) {
        console.error("YouTube OAuth callback error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to complete YouTube authorization.",
        });
    }
});

router.get("/youtube/oauth/status", authMiddleware, async (req, res) => {
    try {
        const userId = (req as AuthenticatedRequest).userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const tokens = await getGoogleOAuthTokens(userId);
        return res.json({ success: true, connected: Boolean(tokens) });
    } catch (error) {
        console.error("YouTube OAuth status error:", error);
        return res.status(500).json({ success: false, message: "Unable to read YouTube connection status." });
    }
});

router.delete("/youtube/oauth", authMiddleware, async (req, res) => {
    try {
        const userId = (req as AuthenticatedRequest).userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        await deleteGoogleOAuthTokens(userId);
        return res.json({ success: true, message: "YouTube account disconnected." });
    } catch (error) {
        console.error("YouTube OAuth disconnect error:", error);
        return res.status(500).json({ success: false, message: "Unable to disconnect YouTube." });
    }
});

export default router;
