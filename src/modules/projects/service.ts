import { fail, ok } from "../../libs/response";
import { deriveProjectKey } from "../../libs/ticket";
import { WorkspaceService } from "../workspaces/service";
import {
	type ProjectCreate,
	type ProjectQuery,
	type ProjectUpdate,
} from "./model";
import { Project } from "./schema";
import type { IRepoPath } from "./types";

type RepoFields = {
	repoPath?: string | null;
	relatedRepoPaths?: string[];
	repoPaths?: IRepoPath[];
};

/** Trims entries and drops empty or repeated paths (case-insensitive, like Windows). */
function cleanRepoPaths(list: IRepoPath[]): IRepoPath[] {
	const seen = new Set<string>();
	const out: IRepoPath[] = [];
	for (const e of list) {
		const path = e.path.trim();
		const key = path.toLowerCase();
		if (!path || seen.has(key)) continue;
		seen.add(key);
		out.push({ label: e.label.trim() || `Folder ${out.length + 1}`, path });
	}
	return out;
}

/**
 * Keeps `repoPaths` (new, labelled) and `repoPath` + `relatedRepoPaths` (old)
 * in sync, whichever of them the client sent. Returns only the fields to set.
 */
function syncRepoFields(data: RepoFields, current?: RepoFields): RepoFields {
	if (data.repoPaths !== undefined) {
		const list = cleanRepoPaths(data.repoPaths);
		return {
			repoPaths: list,
			repoPath: list[0]?.path ?? null,
			relatedRepoPaths: list.slice(1).map((e) => e.path),
		};
	}
	if (data.repoPath === undefined && data.relatedRepoPaths === undefined)
		return {};
	const main =
		data.repoPath !== undefined ? data.repoPath : (current?.repoPath ?? null);
	const related = data.relatedRepoPaths ?? current?.relatedRepoPaths ?? [];
	const oldLabel = new Map(
		(current?.repoPaths ?? []).map((e) => [e.path.toLowerCase(), e.label]),
	);
	const paths = [main, ...related].filter((p): p is string => !!p?.trim());
	const list = cleanRepoPaths(
		paths.map((p, i) => ({
			path: p,
			label:
				oldLabel.get(p.trim().toLowerCase()) ??
				(i === 0 ? "Main" : `Related ${i}`),
		})),
	);
	return {
		repoPaths: list,
		repoPath: main?.trim() || null,
		relatedRepoPaths: related,
	};
}

export abstract class ProjectService {
	/** Fetch a project and verify the caller has access to its workspace. */
	private static async accessible(projectId: string, userId: string) {
		const project = await Project.findById(projectId);
		if (!project) return { project: null, role: null };
		const role = await WorkspaceService.membershipRole(
			project.workspace.toString(),
			userId,
		);
		return { project, role };
	}

	static async findAll(userId: string, query: ProjectQuery) {
		const role = await WorkspaceService.membershipRole(query.workspace, userId);
		if (!role) return fail(403, "You do not have access to this workspace");

		const filter: Record<string, unknown> = { workspace: query.workspace };
		if (!query.includeArchived) filter.isArchived = false;

		const projects = await Project.find(filter).sort({ createdAt: 1 }).lean();
		return ok(projects, "Projects fetched");
	}

	static async findById(id: string, userId: string) {
		const { project, role } = await this.accessible(id, userId);
		if (!project) return fail(404, "Project not found");
		if (!role) return fail(403, "You do not have access to this project");
		return ok(project, "Project fetched");
	}

	static async create(userId: string, data: ProjectCreate) {
		const role = await WorkspaceService.membershipRole(data.workspace, userId);
		if (!role) return fail(403, "You do not have access to this workspace");

		const key = (data.key ?? deriveProjectKey(data.name)).toUpperCase();
		const project = await Project.create({
			...data,
			...syncRepoFields(data),
			key,
			owner: userId,
		});
		return ok(project, "Project created");
	}

	static async update(id: string, userId: string, data: ProjectUpdate) {
		const { project, role } = await this.accessible(id, userId);
		if (!project) return fail(404, "Project not found");
		if (!role) return fail(403, "You do not have access to this project");

		Object.assign(project, data, syncRepoFields(data, project.toObject()));
		await project.save();
		return ok(project, "Project updated");
	}

	static async remove(id: string, userId: string) {
		const { project, role } = await this.accessible(id, userId);
		if (!project) return fail(404, "Project not found");
		if (!role) return fail(403, "You do not have access to this project");

		if (project.isArchived) return ok(project, "Project already archived");

		project.isArchived = true;
		await project.save();
		return ok(project, "Project archived");
	}
}
