import { t } from "elysia";

export const pairStartBody = t.Object({
	deviceName: t.String({ minLength: 1, maxLength: 80 }),
});

export const pairTokenBody = t.Object({
	deviceCode: t.String({ minLength: 20, maxLength: 200 }),
});

export const pairCodeParam = t.Object({
	code: t.String({ pattern: "^[A-Z0-9]{4}-[A-Z0-9]{4}$" }),
});

export type PairStartBody = typeof pairStartBody.static;
