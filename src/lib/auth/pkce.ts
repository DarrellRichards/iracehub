import crypto from "node:crypto";

/** Generate a cryptographically random code_verifier (43–128 chars, base64url). */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Derive the S256 code_challenge from a code_verifier. */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/** Generate a random state token for CSRF protection. */
export function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}
