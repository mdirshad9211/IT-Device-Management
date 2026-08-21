import type { FastifyInstance } from "fastify";
import { AppUserRole, DeviceStatus, PollStatus } from "@prisma/client";
import { z } from "zod";
import { requireAppUserAuth, requireRoles } from "../../shared/kernel/rbac";
import { prisma } from "../../shared/kernel/prisma";
import { parseQuery } from "../../shared/http/validate";

const weeklyQuerySchema = z.object({
  /** ISO date; defaults to start of current UTC week (Monday). */
  weekStart: z.coerce.date().optional(),
});

function startOfUtcWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

/**
 * Overview / weekly inventory report for management dashboards.
 */
export default async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  const staff = {
    onRequest: [
      requireAppUserAuth,
      requireRoles(
        AppUserRole.SUPER_ADMIN,
        AppUserRole.DGN_IT_MANAGER,
        AppUserRole.SERVICE_MANAGER,
        AppUserRole.IT_ENGINEER,
      ),
    ],
  };

  fastify.get("/weekly", staff, async (request, reply) => {
    const { weekStart: rawStart } = parseQuery(weeklyQuerySchema, request);
    const weekStart = startOfUtcWeek(rawStart ?? new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const range = { gte: weekStart, lt: weekEnd };

    const [
      devicesCreated,
      devicesDiscarded,
      devicesRetired,
      devicesScrapped,
      allotmentAudits,
      assignmentChanges,
      pollsOk,
      pollsFailed,
      ondCreated,
      statusGroups,
      totalDevices,
      totalClients,
      totalUsers,
    ] = await Promise.all([
      prisma.device.count({ where: { createdAt: range } }),
      prisma.device.count({
        where: { status: DeviceStatus.DISCARDED, discardedAt: range },
      }),
      prisma.deviceLifecycleEvent.count({
        where: { eventType: "RETIRE", createdAt: range },
      }),
      prisma.deviceLifecycleEvent.count({
        where: { eventType: "SCRAP", createdAt: range },
      }),
      prisma.auditLog.count({
        where: { entityType: "Device", action: "CREATE", createdAt: range },
      }),
      prisma.deviceAssignment.count({ where: { assignedAt: range } }),
      prisma.agentPollLog.count({ where: { status: PollStatus.OK, polledAt: range } }),
      prisma.agentPollLog.count({
        where: {
          status: { in: [PollStatus.NETWORK_FAILURE, PollStatus.SYSTEM_RESOURCE_FAILURE] },
          polledAt: range,
        },
      }),
      prisma.otherNetworkDevice.count({ where: { createdAt: range } }),
      prisma.device.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.device.count(),
      prisma.client.count(),
      prisma.appUser.count({ where: { isActive: true } }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of statusGroups) {
      byStatus[row.status] = row._count._all;
    }

    return reply.status(200).send({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      weekly: {
        devicesCreated,
        devicesDiscarded,
        devicesRetired,
        devicesScrapped,
        allotments: allotmentAudits,
        assignmentChanges,
        pollsOk,
        pollsFailed,
        otherNetworkDevicesCreated: ondCreated,
      },
      totals: {
        devices: totalDevices,
        clients: totalClients,
        activeUsers: totalUsers,
        byStatus,
      },
    });
  });
}
