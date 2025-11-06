/**
 * API endpoint to check migration status
 * GET /api/migration-status
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getMigrationStatus } from "../../lib/cache";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const status = await getMigrationStatus();
    return res.status(200).json(status);
  } catch (error: any) {
    console.error("[migration-status] Error:", error);
    return res.status(500).json({ error: error.message });
  }
}

