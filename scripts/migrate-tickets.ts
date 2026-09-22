/**
 * Migration: backfill `key` on Projects and `ticketNumber`/`ticketKey` on Tasks.
 *
 * Safe to run multiple times (idempotent):
 *   - Projects that already have a key are skipped.
 *   - Tasks that already have a ticketNumber are skipped.
 *   - No existing field is removed or overwritten.
 *
 * Run with:
 *   bun run scripts/migrate-tickets.ts
 */

import dns from "node:dns";
import mongoose from "mongoose";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

// ─── Inline schemas (avoid circular imports from the app modules) ─────────────

const ProjectSchema = new mongoose.Schema(
	{
		name: String,
		key: { type: String, default: null },
		description: String,
		color: String,
		workspace: mongoose.Schema.Types.ObjectId,
		owner: mongoose.Schema.Types.ObjectId,
		isArchived: Boolean,
	},
	{ timestamps: true },
);

const TaskSchema = new mongoose.Schema(
	{
		title: String,
		project: { type: mongoose.Schema.Types.ObjectId, default: null },
		workspace: mongoose.Schema.Types.ObjectId,
		ticketNumber: { type: Number, default: null },
		ticketKey: { type: String, default: null },
		isArchived: Boolean,
	},
	{ timestamps: true },
);

const Project =
	(mongoose.models["Project"] as mongoose.Model<any>) ??
	mongoose.model("Project", ProjectSchema);

const Task =
	(mongoose.models["Task"] as mongoose.Model<any>) ??
	mongoose.model("Task", TaskSchema);

// ─── Utility ──────────────────────────────────────────────────────────────────

function deriveProjectKey(name: string): string {
	return name
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((w: string) => w[0].toUpperCase())
		.join("")
		.slice(0, 10);
}

// ─── Migration steps ──────────────────────────────────────────────────────────

async function migrateProjectKeys() {
	const projects = await Project.find({ key: { $in: [null, undefined, ""] } }).lean();

	if (projects.length === 0) {
		console.log("  Projects: all already have keys, skipping.");
		return;
	}

	console.log(`  Projects: backfilling keys for ${projects.length} project(s)...`);

	for (const project of projects) {
		const key = deriveProjectKey(project.name ?? "X");
		await Project.updateOne({ _id: project._id }, { $set: { key } });
		console.log(`    [${project._id}] "${project.name}" → key="${key}"`);
	}

	console.log(`  Projects: done.`);
}

async function migrateTaskTickets() {
	// Only tasks that belong to a project and have no ticketNumber yet.
	const tasks = await Task.find({
		project: { $ne: null },
		ticketNumber: { $in: [null, undefined] },
	})
		.sort({ createdAt: 1 }) // oldest first → lowest ticket number
		.lean();

	if (tasks.length === 0) {
		console.log("  Tasks: all project tasks already have ticket numbers, skipping.");
		return;
	}

	console.log(`  Tasks: backfilling ticket numbers for ${tasks.length} task(s)...`);

	// Group tasks by project so we can assign sequential numbers per project.
	const byProject = new Map<string, typeof tasks>();
	for (const task of tasks) {
		const pid = task.project.toString();
		if (!byProject.has(pid)) byProject.set(pid, []);
		byProject.get(pid)!.push(task);
	}

	for (const [projectId, projectTasks] of byProject) {
		// Find the highest ticketNumber already assigned in this project
		// (in case the migration is re-run after some tasks were created post-deploy).
		const existing = await Task.findOne({
			project: new mongoose.Types.ObjectId(projectId),
			ticketNumber: { $ne: null },
		})
			.sort({ ticketNumber: -1 })
			.select("ticketNumber")
			.lean();

		const existingDoc = existing as { ticketNumber?: number } | null;
		let counter = (existingDoc?.ticketNumber ?? 0);

		// Fetch project key.
		const project = await Project.findById(projectId).select("key name").lean() as { key?: string; name?: string } | null;
		const key = project?.key ?? deriveProjectKey(project?.name ?? "X");

		for (const task of projectTasks) {
			counter += 1;
			const ticketKey = `${key}-${counter}`;
			await Task.updateOne(
				{ _id: task._id },
				{ $set: { ticketNumber: counter, ticketKey } },
			);
			console.log(`    [${task._id}] "${task.title}" → ${ticketKey}`);
		}
	}

	console.log("  Tasks: done.");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error("ERROR: DATABASE_URL env var is not set.");
		process.exit(1);
	}

	console.log("Connecting to MongoDB...");
	await mongoose.connect(url);
	console.log("Connected.\n");

	console.log("Step 1 — Project keys");
	await migrateProjectKeys();

	console.log("\nStep 2 — Task ticket numbers");
	await migrateTaskTickets();

	console.log("\nMigration complete. No data was deleted or overwritten.");
	await mongoose.disconnect();
}

main().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
