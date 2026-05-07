import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { getDb } from "../db";

const MIGRATION_SECRET = process.env.MIGRATION_SECRET ?? "manus-migration-2026";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      }),
    )
    .query(() => ({
      ok: true,
    })),

  runMigration: publicProcedure
    .input(z.object({ secret: z.string(), sql: z.string().min(1) }))
    .mutation(async ({ input }) => {
      if (input.secret !== MIGRATION_SECRET) {
        throw new Error("Unauthorized");
      }
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.execute(input.sql as any);
      return { success: true };
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      }),
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
