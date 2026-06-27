import express from "express";
import cors from "cors";
const app = express();

// Middlewares
// CORS configuration
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",")
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
app.use(
  express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    },
  })
);


// API Routes
// Health Check Route
app.get("/health", async (req, res) => {
  let dbStatus = "unknown";
  try {
    // await prisma.$queryRaw`SELECT 1`;
    dbStatus = "not connected";
  } catch (error: any) {
    dbStatus = `disconnected: ${error.message || error}`;
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