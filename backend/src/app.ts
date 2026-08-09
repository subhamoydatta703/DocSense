import express from "express";
import cors from "cors";
import helmet from "helmet";
import { prisma } from "./config/db/db";
import { clerkMiddleware } from "@clerk/express";
import uploadRoutes from "./routes/document/multerRoutes";
import queryRoutes from "./routes/query/queryRoutes";
import weburlRoutes from "./routes/web-url/weburlRoutes";
import youtubeRoutes from "./routes/youtube/youtubeRoutes";
import textRoutes from "./routes/text/textRoutes";

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
  })
);
app.use(helmet());
app.use(
  express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(clerkMiddleware());

// API Routes
app.use("/api", uploadRoutes);
app.use("/api", queryRoutes);
app.use("/api", weburlRoutes);
app.use("/api", youtubeRoutes);
app.use("/api", textRoutes);

// Health Check Route
app.get("/health", async (req, res) => {
  let dbStatus = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (error: any) {
    console.error("Health check database query failed:", error instanceof Error ? error.name : "UnknownError");
    dbStatus = "disconnected";
  }

  const isHealthy = dbStatus === "connected";

  res.status(isHealthy ? 200 : 500).json({
    status: isHealthy ? "ok" : "error",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
  });
});

export default app;
