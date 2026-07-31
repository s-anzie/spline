/**
 * Agent tokens are opaque (not JWTs) so they can be revoked instantly by
 * flipping AgentCredential.revokedAt, without waiting out a JWT's exp claim.
 * Shape: "agent_<credentialId>.<secret>" — the prefix lets JwtAuthGuard tell
 * apart an agent token from a user JWT at a glance, and the credential id
 * lets VerifyAgentTokenUseCase look up the right row before bcrypt-comparing
 * the secret (bcrypt hashes aren't otherwise indexable).
 */
export const AGENT_TOKEN_PREFIX = "agent_";
