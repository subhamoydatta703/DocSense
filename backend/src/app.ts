import express from "express";
import cors from "cors";
import helmet from "helmet";
import { clerkMiddleware } from "@clerk/express";
import uploadRoutes from "./routes/document/multerRoutes";
import queryRoutes from "./routes/query/queryRoutes";
import weburlRoutes from "./routes/web-url/weburlRoutes";
import youtubeRoutes from "./routes/youtube/youtubeRoutes";
import textRoutes from "./routes/text/textRoutes";
import healthRoutes from "./routes/healthRoutes";
import type { ErrorRequestHandler } from "express";

const app = express();

// Middlewares
// CORS configuration
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",").map((origin) => origin.trim()).filter(Boolean)
  : ["http://localhost:5173", "http://localhost:3000"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like server-to-server or tools like curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    exposedHeaders: ["Retry-After"],
  })
);
app.use(helmet());
app.use(
  express.json({
    limit: "4mb",
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Public probes must not depend on Clerk availability or authentication.
app.use(healthRoutes);
app.use(clerkMiddleware());

// API Routes
app.use("/api", uploadRoutes);
app.use("/api", queryRoutes);
app.use("/api", weburlRoutes);
app.use("/api", youtubeRoutes);
app.use("/api", textRoutes);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return _next(error);
  if (error.type === "entity.too.large") return void res.status(413).json({ success: false, message: "Request body exceeds the 4 MB limit." });
  if (error.type === "entity.parse.failed") return void res.status(400).json({ success: false, message: "Request body must be valid JSON." });
  console.error("Unhandled request error", { errorType: error instanceof Error ? error.name : "UnknownError" });
  res.status(500).json({ success: false, message: "The server could not complete this request. Please try again." });
};
app.use(errorHandler);

export default app;
