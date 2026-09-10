import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { helmet } from "elysia-helmet";
import { log } from "./libs/logger";
import { connectDB, mongoosePlugin } from "./libs/mongoose";
import { docsModule } from "./modules/docs";

// Register the User schema so `populate('assignedTo'|'createdBy'|'user')` resolves.
import "./modules/users/model";

import { changelogsModule } from "./modules/changelogs";
import { glossaryModule } from "./modules/glossary";
import { notesModule } from "./modules/notes";
import { projectsModule } from "./modules/projects";
import { qaModule } from "./modules/qa";
import { tasksModule } from "./modules/tasks";
import { workspacesModule } from "./modules/workspaces";

const isProd = process.env.NODE_ENV === "production";

const app = new Elysia()
	.use(helmet())
	.use(
		cors({
			allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
			origin: "*",
		}),
	)
	.use(log.into())
	// Ensure a DB connection on every request (serverless-friendly, idempotent).
	.onBeforeHandle(connectDB)
	.use(mongoosePlugin)
	.use(isProd ? new Elysia() : docsModule)
	.get("/", ({ set }) => {
		set.status = 404;
		return null;
	})
	.get("/health", () => ({
		status: "ok",
		service: "memoria",
		timestamp: new Date().toISOString(),
	}))
	.group(
		"/api",
		(app) =>
			app
				.use(workspacesModule) // /api/workspaces
				.use(projectsModule) // /api/projects
				.use(tasksModule) // /api/tasks
				.use(notesModule) // /api/notes
				.use(glossaryModule) // /api/glossary
				.use(qaModule) // /api/qa
				.use(changelogsModule), // /api/changelogs
	);

export default app;
