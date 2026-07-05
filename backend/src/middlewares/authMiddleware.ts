import type { Request, Response, NextFunction } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { prisma } from "../config/db";
import { CreatedUserSchema } from "../utils/validation";

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    
    // // DEV ONLY: mock auth bypass
    // if (process.env.NODE_ENV === "development" && req.headers["x-mock-user-id"]) {
  // const mockId = req.headers["x-mock-user-id"] as string;
  
  // // Ensure mock user exists in DB
  // await prisma.user.upsert({
    // where: { id: mockId },
    // update: {},
    // create: { id: mockId, email: "mockuser@test.com" }
  // });

  // req.userId = mockId;
  // return next();
// }
    
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized: Missing authentication credentials"
      });
    }

    // Check if user exists in our DB
    let user = await prisma.user.findUnique({
      where: { id: userId },
    });

    // If user does not exist in local DB, fetch details from Clerk and sync
    if (!user) {
      try {
        const clerkUser = await clerkClient.users.getUser(userId);
        const email = clerkUser.emailAddresses[0]?.emailAddress || `${userId}@example.com`;
        
        const validatedUser = CreatedUserSchema.parse({
          id: userId,
          email: email,
        });

        user = await prisma.user.create({
          data: validatedUser,
        });
        console.log(`Synced new user from Clerk: ${email} (ID: ${userId})`);
      } catch (clerkErr) {
        console.error("Failed to sync user from Clerk:", clerkErr);
        // Fallback: create user with placeholder email to avoid blocking flow
        const fallbackUser = CreatedUserSchema.parse({
          id: userId,
          email: `user_${userId}@placeholder.com`,
        });
        user = await prisma.user.create({
          data: fallbackUser,
        });
      }
    }

    req.userId = userId;
    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal Server Error in authentication"
    });
  }
}