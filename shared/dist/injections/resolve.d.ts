/**
 * Resolves an annotation string (e.g. `"py"`, `" Python "`, `"rust"`) to a
 * host language ID (e.g. `"python"`, `"rust"`), honouring aliases.
 *
 * Returns `null` if the resolved ID is not in `registeredLanguages` — this is
 * the shared's way of saying "no provider will handle this zone, skip it".
 */
export declare function resolveLanguageId(annotation: string, registeredLanguages: Set<string>): string | null;
