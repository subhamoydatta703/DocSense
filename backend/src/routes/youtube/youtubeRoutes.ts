import { Router } from "express";
import { authMiddleware } from "../../middlewares/authMiddleware";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { rateLimiter } from "../../middlewares/rateLimiterMiddleware";
import { youtubeContent } from "../../controllers/youtube/youtubeController";
import {
    buildGoogleAuthorizationUrl,
    getGoogleOAuthConfig,
    getGoogleTokenUrl,
} from "../../config/youtube/googleOAuth";
import {
    consumeYouTubeOAuthState,
    createYouTubeOAuthState,
} from "../../services/youtube/oauthStateService";
import { saveGoogleOAuthTokens } from "../../services/youtube/oauthTokenService";

const router = Router();

router.post("/youtube", authMiddleware, rateLimiter, youtubeContent);

router.get("/youtube/oauth/start", authMiddleware, async (req, res) => {
    try {
        const userId = (req as AuthenticatedRequest).userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const state = await createYouTubeOAuthState(userId);
        return res.redirect(buildGoogleAuthorizationUrl(state));
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

        return res.json({
            success: true,
            message: "YouTube account connected successfully.",
        });
    } catch (error) {
        console.error("YouTube OAuth callback error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to complete YouTube authorization.",
        });
    }
});

export default router;
