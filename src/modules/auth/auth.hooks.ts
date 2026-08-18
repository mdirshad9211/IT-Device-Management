import type { onRequestHookHandler } from "fastify";
import { UnauthorizedError } from "../../shared/kernel/errors";
import { hashAgentApiKey } from "./agent-api-key";
import type { AuthRepository } from "./auth.repository";

export const AGENT_API_KEY_HEADER = "x-agent-api-key";

/**
 * Agent authentication: per-site API key in `x-agent-api-key`, compared to
 * `Agent.apiKeyHash`. Must not be used interchangeably with AppUser JWTs.
 */
export const requireAgentAuth: onRequestHookHandler = async (request) => {
  const header = request.headers[AGENT_API_KEY_HEADER];
  const apiKey = Array.isArray(header) ? header[0] : header;

  if (!apiKey) {
    throw new UnauthorizedError("Agent API key required");
  }

  const authRepository = request.container.resolve<AuthRepository>("authRepository");
  const agent = await authRepository.findAgentByApiKeyHash(hashAgentApiKey(apiKey));

  if (!agent) {
    throw new UnauthorizedError("Invalid agent API key");
  }

  request.agent = { id: agent.id, deviceId: agent.deviceId, clientId: agent.clientId };
};
