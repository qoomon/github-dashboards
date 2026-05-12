/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0 Authorization Code Flow.
 * Reference: https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/
 */

const CODE_VERIFIER_KEY = 'pkce_code_verifier'

/** Generate a cryptographically strong random code verifier (43–128 chars, base64url). */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(64)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

/** Derive the code challenge (S256) from a code verifier. */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return base64UrlEncode(new Uint8Array(digest))
}

/** Store the verifier in sessionStorage and return the challenge for the redirect. */
export async function initiatePkce(): Promise<{ codeChallenge: string; codeVerifier: string }> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier)
  return { codeChallenge, codeVerifier }
}

/** Retrieve the stored code verifier from sessionStorage (and remove it). */
export function consumeCodeVerifier(): string | null {
  const verifier = sessionStorage.getItem(CODE_VERIFIER_KEY)
  sessionStorage.removeItem(CODE_VERIFIER_KEY)
  return verifier
}

// ---------------------------------------------------------------------------

function base64UrlEncode(buffer: Uint8Array): string {
  let binary = ''
  buffer.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
