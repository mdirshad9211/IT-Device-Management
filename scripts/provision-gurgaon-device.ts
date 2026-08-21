/**
 * One-shot: create CRL Gurgaon site, allot Irshad's laptop, register agent, poll real telemetry.
 * Run: npx tsx scripts/provision-gurgaon-device.ts
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashAgentApiKey } from "../src/modules/auth/agent-api-key";

const API = process.env.API_URL ?? "http://localhost:4000";
const AGENT_KEY = "agent-gurgaon-irshad-key";
const ASSET_TAG = "GGN-LN-IRSHAD-01";

const prisma = new PrismaClient();

type Telemetry = {
  hostname: string;
  manufacturer: string;
  model: string;
  os: string;
  cpu: string;
  ram: string;
  storageTotal: string;
  storageUsedPercent: number;
  installedSoftware: string[];
  connectedDevices: string[];
  soundCards: string[];
  pciCards: string[];
};

function collectTelemetry(): Telemetry {
  const script = path.join(__dirname, "collect-telemetry.ps1");
  const raw = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  ).trim();
  return JSON.parse(raw) as Telemetry;
}

async function api<T>(
  pathName: string,
  opts: { method?: string; token?: string; body?: unknown; agentKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.agentKey) headers["x-agent-api-key"] = opts.agentKey;
  const res = await fetch(`${API}${pathName}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${opts.method ?? "GET"} ${pathName} → ${res.status}: ${text}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

async function main() {
  console.log("Collecting telemetry from this PC…");
  const telemetry = collectTelemetry();
  console.log({
    host: telemetry.hostname,
    cpu: telemetry.cpu,
    ram: telemetry.ram,
    storage: `${telemetry.storageTotal} (${telemetry.storageUsedPercent}% used)`,
    softwareCount: telemetry.installedSoftware?.length ?? 0,
  });

  console.log("Logging in as super.admin…");
  const login = await api<{ token: string }>("/api/v1/auth/login", {
    method: "POST",
    body: { email: "super.admin@inventory.local", password: "Password123!" },
  });
  const token = login.token;

  const listed = await api<{ items: Array<{ id: string; name: string }> }>(
    "/api/v1/clients?page=1&pageSize=100",
    { token },
  );
  let client = listed.items.find((c) => c.name.toLowerCase().includes("gurgaon"));
  if (!client) {
    console.log("Creating site CRL Gurgaon…");
    client = await api<{ id: string; name: string }>("/api/v1/clients", {
      method: "POST",
      token,
      body: { name: "CRL Gurgaon", currentLocation: "CRL Gurgaon - Office Floor 1" },
    });
  } else {
    console.log("Using existing site:", client.name, client.id);
  }

  const devices = await api<{ items: Array<{ id: string; assetTag: string; clientId: string }> }>(
    `/api/v1/devices?page=1&pageSize=100&clientId=${client.id}`,
    { token },
  );
  let device = devices.items.find((d) => d.assetTag === ASSET_TAG);
  if (!device) {
    console.log("Allotting device", ASSET_TAG, "…");
    device = await api<{ id: string; assetTag: string; clientId: string }>("/api/v1/devices", {
      method: "POST",
      token,
      body: {
        clientId: client.id,
        assetTag: ASSET_TAG,
        cpu: telemetry.cpu,
        ram: telemetry.ram,
        storageTotal: telemetry.storageTotal,
        storageUsedPercent: telemetry.storageUsedPercent,
        assignment: {
          userName: "Irshad",
          userPhone: "+91 9999999999",
          userEmail: "irshad@gurgaon.local",
          department: "Engineering",
          managerName: "Sameer Kapoor",
          managerPhone: "+91 9888888888",
          managerEmail: "sameer.kapoor@client.local",
        },
      },
    });
  } else {
    console.log("Device already exists:", device.assetTag, device.id);
  }

  console.log("Registering agent…");
  const agent = await prisma.agent.upsert({
    where: { deviceId: device.id },
    update: {
      apiKeyHash: hashAgentApiKey(AGENT_KEY),
      version: "1.0.0-local",
      clientId: client.id,
    },
    create: {
      deviceId: device.id,
      clientId: client.id,
      version: "1.0.0-local",
      apiKeyHash: hashAgentApiKey(AGENT_KEY),
    },
  });

  console.log("Polling agent with live PC telemetry…");
  const poll = await api<{
    pollLogId: string;
    status: string;
    softwareChanges: unknown[];
    hardwareChanges: unknown[];
    storageUsedPercent: number | null;
  }>(`/api/v1/agents/${agent.id}/poll`, {
    method: "POST",
    agentKey: AGENT_KEY,
    body: {
      cpu: telemetry.cpu,
      ram: telemetry.ram,
      storageTotal: telemetry.storageTotal,
      storageUsedPercent: telemetry.storageUsedPercent,
      pciCards: telemetry.pciCards ?? [],
      soundCards: telemetry.soundCards ?? [],
      connectedDevices: telemetry.connectedDevices ?? [],
      installedSoftware: telemetry.installedSoftware ?? [],
    },
  });

  const refreshed = await api<{
    id: string;
    assetTag: string;
    cpu: string;
    ram: string;
    storageTotal: string;
    storageUsedPercent: number;
    qrCode: { qrValue: string } | null;
  }>(`/api/v1/devices/${device.id}`, { token });

  console.log("\n✅ Done\n");
  console.log(
    JSON.stringify(
      {
        site: { id: client.id, name: client.name },
        device: {
          id: refreshed.id,
          assetTag: refreshed.assetTag,
          cpu: refreshed.cpu,
          ram: refreshed.ram,
          storage: refreshed.storageTotal,
          used: `${refreshed.storageUsedPercent}%`,
          qr: refreshed.qrCode?.qrValue,
        },
        agent: { id: agent.id, apiKey: AGENT_KEY },
        poll: {
          pollLogId: poll.pollLogId,
          status: poll.status,
          softwareChanges: poll.softwareChanges.length,
          hardwareChanges: poll.hardwareChanges.length,
        },
        hostMeta: {
          hostname: telemetry.hostname,
          manufacturer: telemetry.manufacturer,
          model: telemetry.model,
          os: telemetry.os,
        },
      },
      null,
      2,
    ),
  );
  console.log(`\nOpen device: http://localhost:5173/assets/${device.id}`);
  console.log(`Open site:   http://localhost:5173/sites/${client.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
