/** Placeholder in a skill prompt, replaced with each agent's name. */
export const AGENT_NAME_TOKEN = "{{AGENT_NAME}}";

const TOKEN_RE = /\{\{\s*AGENT_NAME\s*\}\}/g;

/** Same max length an agent's own role prompt had. */
export const SKILL_PROMPT_MAX = 20000;

/** Agents match a skill by role, ignoring case and extra spaces. */
export const roleKeyOf = (role: string) =>
	role.replace(/\s+/g, " ").trim().toLowerCase();

/** The final prompt for one agent: the shared skill with its name filled in. */
export const renderSkillPrompt = (prompt: string, agentName: string) =>
	prompt.replace(TOKEN_RE, () => agentName);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Turn one agent's own prompt into a shared template by swapping its name
 * (whole words, exact case) for the placeholder. Used by the migration.
 */
export function templatizePrompt(prompt: string, agentName: string): string {
	const name = agentName.trim();
	if (!name) return prompt;
	const re = new RegExp(
		`(?<![\\p{L}\\p{N}_])${escapeRegex(name)}(?![\\p{L}\\p{N}_])`,
		"gu",
	);
	return prompt.replace(re, AGENT_NAME_TOKEN);
}
