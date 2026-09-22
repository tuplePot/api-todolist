/** Derive a short uppercase project key from a name, e.g. "Josh Vault" → "JV". */
export function deriveProjectKey(name: string): string {
	return name
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => w[0].toUpperCase())
		.join("")
		.slice(0, 10);
}
