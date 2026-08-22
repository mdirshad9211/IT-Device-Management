import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { AppUserRole, AuditAction, PollStatus, Prisma } from "@prisma/client";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../../shared/kernel/errors";
import type { DomainEventBus } from "../../shared/kernel/events";
import { enforceAccess } from "../../shared/kernel/rbac";
import { env } from "../../config/env";
import { hashAgentApiKey } from "../auth/agent-api-key";
import {
  classifyPollStatus,
  diffTelemetry,
  mergeTelemetry,
  STORAGE_THRESHOLD_PERCENT,
  type PollPayload,
} from "./agent.diff";
import type { AgentRepository } from "./agent.repository";
import { signAgentDownloadToken } from "./agent.download-token";
import { agentPackageFileName, buildAgentInstallerPackage } from "./agent.package";
import { collectLocalTelemetry } from "./agent.local-collect";

export type AppActor = { userId: string; role: AppUserRole };
export type AuthenticatedAgent = { id: string; deviceId: string; clientId: string };

export class AgentService {
  constructor(
    private readonly agentRepository: AgentRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  /**
   * SRS §3.1 poll ingest. Failed polls still log status/time but never wipe
   * Device telemetry and never append history rows.
   */
  async ingestPoll(agentId: string, caller: AuthenticatedAgent, payload: PollPayload) {
    this.assertAgentCaller(agentId, caller);

    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError("Agent not found");
    }

    const device = await this.agentRepository.findDeviceTelemetry(agent.deviceId);
    if (!device) {
      throw new NotFoundError("Device not found");
    }

    const status = classifyPollStatus(payload);
    const failed = status !== PollStatus.OK;
    const diff = failed
      ? { softwareChanges: [], hardwareChanges: [], storageUsedPercent: device.storageUsedPercent }
      : diffTelemetry(device, payload);
    const telemetryPatch = failed ? {} : mergeTelemetry(device, payload);
    const now = new Date();

    const { pollLogId } = await this.agentRepository.commitPoll({
      agentId,
      deviceId: device.id,
      payload: payload as Prisma.InputJsonValue,
      status,
      telemetryPatch,
      softwareChanges: diff.softwareChanges,
      hardwareChanges: diff.hardwareChanges,
      now,
    });

    this.eventBus.emit("agent.polled", {
      entityType: "Agent",
      entityId: agentId,
      action: AuditAction.UPDATE,
      performedBy: null,
      before: null,
      after: { pollLogId, status, deviceId: device.id },
      agentId,
      pollLogId,
      status,
    });

    if (!failed && payload.storageUsedPercent !== undefined && payload.storageUsedPercent >= STORAGE_THRESHOLD_PERCENT) {
      const recipients = await this.agentRepository.listDeviceContactEmails(device.id);
      this.eventBus.emit("device.storage.threshold_breached", {
        entityType: "Device",
        entityId: device.id,
        action: AuditAction.UPDATE,
        performedBy: null,
        before: { storageUsedPercent: device.storageUsedPercent },
        after: { storageUsedPercent: payload.storageUsedPercent },
        clientId: device.clientId,
        agentId,
        storageUsedPercent: payload.storageUsedPercent,
        recipients,
      });
    }

    return {
      pollLogId,
      status,
      softwareChanges: diff.softwareChanges,
      hardwareChanges: diff.hardwareChanges,
      storageUsedPercent: diff.storageUsedPercent,
    };
  }

  /**
   * Issues a short-lived, site-scoped download token and builds the agent
   * installer ZIP (scripts + config) for the ops UI download button.
   */
  async issueDownloadToken(
    clientId: string,
    actor: AppActor,
    opts: { apiBaseUrl: string },
  ) {
    const client = await this.agentRepository.getClientSummary(clientId);
    if (!client) {
      throw new NotFoundError("Client not found");
    }

    const activeAssignedClientIds =
      actor.role === AppUserRole.IT_ENGINEER
        ? await this.agentRepository.listActiveAssignedClientIds(actor.userId)
        : [];

    enforceAccess({
      actorUserId: actor.userId,
      role: actor.role,
      entity: "Device",
      action: "edit",
      targetClientId: clientId,
      activeAssignedClientIds,
      currentAssignment: null,
    });

    const { token, expiresAt } = signAgentDownloadToken(clientId);
    const expiresAtIso = expiresAt.toISOString();
    this.eventBus.emit("agent.download_token.issued", {
      entityType: "Client",
      entityId: clientId,
      action: AuditAction.UPDATE,
      performedBy: actor.userId,
      before: null,
      after: { downloadTokenIssued: true, expiresAt: expiresAtIso },
      clientId,
    });

    const devices = await this.agentRepository.listClientDevices(clientId);
    const credentials = [];
    for (const device of devices) {
      const apiKey = `dcn_${randomBytes(24).toString("base64url")}`;
      const agent = await this.agentRepository.upsertAgentApiKey({
        deviceId: device.id,
        clientId: client.id,
        apiKeyHash: hashAgentApiKey(apiKey),
        version: "1.1.0",
      });
      credentials.push({
        deviceId: device.id,
        assetTag: device.assetTag,
        agentId: agent.id,
        apiKey,
      });
    }

    const zip = buildAgentInstallerPackage({
      clientId: client.id,
      clientName: client.name,
      apiBaseUrl: opts.apiBaseUrl,
      downloadToken: token,
      expiresAt: expiresAtIso,
      credentials,
    });

    return {
      clientId: client.id,
      clientName: client.name,
      token,
      expiresAt: expiresAtIso,
      tokenType: "agent-download" as const,
      fileName: agentPackageFileName(client.name),
      agentCount: credentials.length,
      zip,
    };
  }

  /**
   * FR-AGENT-04 — deregister requires the module admin secret (bcrypt vs
   * ADMIN_SECRET_PASSWORD_HASH). Does not touch Device inventory rows.
   */
  async deregister(agentId: string, caller: AuthenticatedAgent, adminSecret: string) {
    this.assertAgentCaller(agentId, caller);

    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError("Agent not found");
    }

    const ok = await bcrypt.compare(adminSecret, env.ADMIN_SECRET_PASSWORD_HASH);
    if (!ok) {
      throw new ForbiddenError("Invalid admin secret");
    }

    await this.agentRepository.deregister(agentId);
    this.eventBus.emit("agent.deregistered", {
      entityType: "Agent",
      entityId: agentId,
      action: AuditAction.DELETE,
      performedBy: null,
      before: { id: agent.id, deviceId: agent.deviceId, clientId: agent.clientId },
      after: null,
      agentId,
      clientId: agent.clientId,
    });
    return { agentId, deregistered: true as const };
  }

  async listPollLogs(
    deviceId: string,
    query: { page: number; pageSize: number },
    actor: AppActor,
  ) {
    const device = await this.agentRepository.findDeviceTelemetry(deviceId);
    if (!device) {
      throw new NotFoundError("Device not found");
    }
    const assigned =
      actor.role === AppUserRole.IT_ENGINEER
        ? await this.agentRepository.listActiveAssignedClientIds(actor.userId)
        : [];
    enforceAccess({
      actorUserId: actor.userId,
      role: actor.role,
      entity: "Device",
      action: "view",
      targetClientId: device.clientId,
      activeAssignedClientIds: assigned,
      currentAssignment: null,
    });

    const skip = (query.page - 1) * query.pageSize;
    const { items, total } = await this.agentRepository.listPollLogsForDevice(
      deviceId,
      skip,
      query.pageSize,
    );
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  /**
   * UI "Scan now": collect telemetry from this host and ingest it as the
   * device's registered agent (lab / same-machine workflow).
   */
  async scanDeviceNow(deviceId: string, actor: AppActor) {
    const device = await this.agentRepository.findDeviceTelemetry(deviceId);
    if (!device) {
      throw new NotFoundError("Device not found");
    }

    const assigned =
      actor.role === AppUserRole.IT_ENGINEER
        ? await this.agentRepository.listActiveAssignedClientIds(actor.userId)
        : [];
    enforceAccess({
      actorUserId: actor.userId,
      role: actor.role,
      entity: "Device",
      action: "edit",
      targetClientId: device.clientId,
      activeAssignedClientIds: assigned,
      currentAssignment: null,
    });

    const agent = await this.agentRepository.findByDeviceId(deviceId);
    if (!agent) {
      throw new NotFoundError("No agent is registered for this device — allot/provision an agent first");
    }

    const payload = await collectLocalTelemetry();
    const result = await this.ingestPoll(
      agent.id,
      { id: agent.id, deviceId: agent.deviceId, clientId: agent.clientId },
      payload,
    );

    return {
      deviceId,
      agentId: agent.id,
      scannedAt: new Date().toISOString(),
      source: "ui-local-scan" as const,
      ...result,
    };
  }

  private assertAgentCaller(agentId: string, caller: AuthenticatedAgent): void {
    if (caller.id !== agentId) {
      throw new UnauthorizedError("Agent API key does not match this agent");
    }
  }
}
