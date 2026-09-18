import type { Types } from "mongoose";

/**
 * A publicly shareable snapshot of a notepad note. The whole point is to keep
 * share links short: instead of stuffing the note into the URL, the note body
 * lives here and the link only carries a short `slug`. Reads are public (anyone
 * with the link), creation is done by the authenticated author.
 */
export interface ISharedNote {
	/** Short, URL-safe public identifier used in the share link (`/n/<slug>`). */
	slug: string;
	/** The note body, verbatim. */
	content: string;
	/**
	 * Syntax-highlight mode carried over from the author's note: `"plaintext"`
	 * or a highlight.js language id. Omitted for auto-detect.
	 */
	language?: string;
	/** How many times the link has been opened — a light popularity signal. */
	views: number;
	/** The author, if the create request was authenticated. Optional by design. */
	createdBy?: Types.ObjectId;
}
