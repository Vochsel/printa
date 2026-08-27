import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * A capture is a link, not a keepsake.
 *
 * Places captured by the assistant or the landing page are stored so their
 * links work; nobody asked to keep them forever, so they are swept daily
 * once they are a month old. Saved projects have an owner and are untouched.
 */
const crons = cronJobs();

crons.daily("sweep captures", { hourUTC: 14, minuteUTC: 0 }, internal.documents.sweepCaptures, {});

export default crons;
