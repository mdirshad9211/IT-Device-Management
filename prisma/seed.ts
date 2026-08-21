/**
 * Comprehensive seed — roles, multi-user engineers/employees, clients,
 * locations history, ~35 site devices (+ QR + assignments), versioned software,
 * software/hardware history samples, and a mix of other-network devices.
 * Password for every AppUser: Password123!
 *
 * Run: npm run seed
 */
import {
  AppUserRole,
  AuditAction,
  DeviceStatus,
  HardwareChangeType,
  LifecycleEventType,
  OtherDeviceStatus,
  OtherDeviceType,
  Prisma,
  PrismaClient,
  SoftwareChangeAction,
  WarrantyStatus,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { hashAgentApiKey } from "../src/modules/auth/agent-api-key";

const prisma = new PrismaClient();
const SEED_PASSWORD = "Password123!";

type Soft = { name: string; version: string };

const SW = {
  chrome121: { name: "Google Chrome", version: "121.0.6167.85" },
  chrome122: { name: "Google Chrome", version: "122.0.6261.112" },
  edge: { name: "Microsoft Edge", version: "122.0.2365.80" },
  vscode: { name: "Visual Studio Code", version: "1.87.2" },
  zoom: { name: "Zoom Workplace", version: "5.17.10" },
  teams: { name: "Microsoft Teams", version: "24074.2602.2793.3459" },
  slack: { name: "Slack", version: "4.37.101" },
  node20: { name: "Node.js", version: "20.11.1" },
  git: { name: "Git", version: "2.44.0" },
  office: { name: "Microsoft Office 365", version: "16.0.17328" },
  docker: { name: "Docker Desktop", version: "4.28.0" },
  notion: { name: "Notion", version: "3.1.0" },
  postman: { name: "Postman", version: "10.24.0" },
  vpn: { name: "Cisco AnyConnect", version: "4.10.07061" },
} as const satisfies Record<string, Soft>;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(10, 0, 0, 0);
  return d;
}

function daysFrom(base: Date, n: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

async function upsertUser(email: string, name: string, role: AppUserRole, passwordHash: string) {
  return prisma.appUser.upsert({
    where: { email },
    update: { name, role, passwordHash, isActive: true },
    create: { email, name, role, passwordHash, isActive: true },
  });
}

type DeviceSpec = {
  tag: string;
  client: number;
  cpu: string;
  ram: string;
  storage: string;
  used: number;
  emp: number;
  mgr: number;
  dept: string;
  status?: DeviceStatus;
  retiredFlag?: boolean;
  software: Soft[];
  withHistory?: boolean;
};

async function main() {
  console.log("Seeding inventory database...");
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const superAdmin = await upsertUser("super.admin@inventory.local", "Super Admin", AppUserRole.SUPER_ADMIN, passwordHash);
  const dgnManager = await upsertUser("dgn.manager@inventory.local", "DGN IT Manager", AppUserRole.DGN_IT_MANAGER, passwordHash);
  const serviceManager = await upsertUser(
    "service.manager@inventory.local",
    "Service Manager",
    AppUserRole.SERVICE_MANAGER,
    passwordHash,
  );

  const engineers = await Promise.all([
    upsertUser("ravi.sharma@inventory.local", "Ravi Sharma", AppUserRole.IT_ENGINEER, passwordHash),
    upsertUser("anita.verma@inventory.local", "Anita Verma", AppUserRole.IT_ENGINEER, passwordHash),
    upsertUser("vikram.singh@inventory.local", "Vikram Singh", AppUserRole.IT_ENGINEER, passwordHash),
    upsertUser("neha.gupta@inventory.local", "Neha Gupta", AppUserRole.IT_ENGINEER, passwordHash),
  ]);

  const managers = await Promise.all([
    upsertUser("sameer.kapoor@client.local", "Sameer Kapoor", AppUserRole.CLIENT_MANAGER, passwordHash),
    upsertUser("meera.joshi@client.local", "Meera Joshi", AppUserRole.CLIENT_MANAGER, passwordHash),
  ]);

  const employees = await Promise.all([
    upsertUser("priya.nair@client.local", "Priya Nair", AppUserRole.EMPLOYEE, passwordHash),
    upsertUser("arjun.mehta@client.local", "Arjun Mehta", AppUserRole.EMPLOYEE, passwordHash),
    upsertUser("kavya.iyer@client.local", "Kavya Iyer", AppUserRole.EMPLOYEE, passwordHash),
    upsertUser("rohan.das@client.local", "Rohan Das", AppUserRole.EMPLOYEE, passwordHash),
  ]);

  const sites: Array<{ name: string; locations: string[] }> = [
    { name: "CRL Delhi", locations: ["CRL Delhi - Floor 1", "CRL Delhi - Floor 2"] },
    { name: "CRL Mumbai", locations: ["CRL Mumbai - Wing A", "CRL Mumbai - Wing B"] },
    { name: "CRL Bengaluru", locations: ["CRL Bengaluru - Block C"] },
  ];

  const clients = [];
  for (const site of sites) {
    const current = site.locations[site.locations.length - 1]!;
    const client = await prisma.client.upsert({
      where: { name: site.name },
      update: { currentLocation: current },
      create: { name: site.name, currentLocation: current },
    });
    await prisma.siteLocation.deleteMany({ where: { clientId: client.id } });
    for (let i = 0; i < site.locations.length; i++) {
      await prisma.siteLocation.create({
        data: {
          clientId: client.id,
          locationName: site.locations[i]!,
          isCurrent: i === site.locations.length - 1,
        },
      });
    }
    clients.push(client);
  }

  const assignments: Array<{ engineerIndex: number; clientIndex: number }> = [
    { engineerIndex: 0, clientIndex: 0 },
    { engineerIndex: 0, clientIndex: 1 },
    { engineerIndex: 1, clientIndex: 0 },
    { engineerIndex: 2, clientIndex: 2 },
    { engineerIndex: 3, clientIndex: 1 },
    { engineerIndex: 3, clientIndex: 2 },
  ];
  for (const link of assignments) {
    const appUserId = engineers[link.engineerIndex]!.id;
    const clientId = clients[link.clientIndex]!.id;
    const existing = await prisma.engineerAssignment.findFirst({ where: { appUserId, clientId } });
    if (!existing) {
      await prisma.engineerAssignment.create({ data: { appUserId, clientId, isActive: true } });
    } else if (!existing.isActive) {
      await prisma.engineerAssignment.update({
        where: { id: existing.id },
        data: { isActive: true, unassignedAt: null },
      });
    }
  }

  const baseSoftware: Soft[] = [SW.chrome122, SW.vscode, SW.zoom, SW.git];
  const heavySoftware: Soft[] = [SW.chrome122, SW.edge, SW.vscode, SW.teams, SW.slack, SW.node20, SW.docker, SW.postman, SW.git];
  const officeSoftware: Soft[] = [SW.chrome121, SW.office, SW.teams, SW.vpn];

  // Original 15 + 20 more = 35 devices
  const deviceSpecs: DeviceSpec[] = [
    // --- Original Delhi / Mumbai / Bengaluru set (storage varied) ---
    { tag: "DEL-LN-00101", client: 0, cpu: "Intel i5-1235U", ram: "16 GB", storage: "512 GB SSD", used: 42, emp: 0, mgr: 0, dept: "Engineering", software: heavySoftware, withHistory: true },
    { tag: "DEL-LN-00102", client: 0, cpu: "Intel i7-1355U", ram: "32 GB", storage: "1 TB NVMe", used: 88, emp: 1, mgr: 0, dept: "Finance", software: officeSoftware, withHistory: true },
    { tag: "DEL-DT-00103", client: 0, cpu: "AMD Ryzen 5", ram: "16 GB", storage: "512 GB SSD", used: 55, emp: 2, mgr: 0, dept: "Ops", software: baseSoftware },
    { tag: "DEL-LN-00104", client: 0, cpu: "Intel i5-1135G7", ram: "8 GB", storage: "256 GB SSD", used: 91, emp: 3, mgr: 0, dept: "HR", software: officeSoftware },
    { tag: "DEL-LN-00105", client: 0, cpu: "Intel i5-1345U", ram: "16 GB", storage: "512 GB SSD", used: 33, emp: 0, mgr: 0, dept: "Engineering", software: heavySoftware },
    { tag: "MUM-LN-00201", client: 1, cpu: "Intel i7-1260P", ram: "16 GB", storage: "512 GB SSD", used: 61, emp: 1, mgr: 1, dept: "Sales", software: officeSoftware },
    { tag: "MUM-LN-00202", client: 1, cpu: "Intel i5-1240P", ram: "16 GB", storage: "512 GB SSD", used: 47, emp: 2, mgr: 1, dept: "Marketing", software: [SW.chrome122, SW.notion, SW.slack, SW.zoom] },
    { tag: "MUM-DT-00203", client: 1, cpu: "Intel Xeon W", ram: "64 GB", storage: "2 TB SSD", used: 72, emp: 3, mgr: 1, dept: "Design", software: heavySoftware, withHistory: true },
    { tag: "MUM-LN-00204", client: 1, cpu: "Intel i5-1135G7", ram: "8 GB", storage: "256 GB SSD", used: 85, emp: 0, mgr: 1, dept: "Support", software: baseSoftware },
    { tag: "MUM-LN-00205", client: 1, cpu: "AMD Ryzen 7", ram: "32 GB", storage: "1 TB SSD", used: 39, emp: 1, mgr: 1, dept: "Engineering", software: heavySoftware },
    { tag: "BLR-LN-00301", client: 2, cpu: "Intel i7-13700H", ram: "32 GB", storage: "1 TB NVMe", used: 58, emp: 2, mgr: 0, dept: "R&D", software: heavySoftware, withHistory: true },
    { tag: "BLR-LN-00302", client: 2, cpu: "Intel i5-1335U", ram: "16 GB", storage: "512 GB SSD", used: 44, emp: 3, mgr: 0, dept: "QA", software: baseSoftware },
    { tag: "BLR-DT-00303", client: 2, cpu: "AMD Ryzen 9", ram: "64 GB", storage: "2 TB NVMe", used: 81, emp: 0, mgr: 1, dept: "DevOps", software: heavySoftware },
    { tag: "BLR-LN-00304", client: 2, cpu: "Intel i5-1245U", ram: "16 GB", storage: "512 GB SSD", used: 29, emp: 1, mgr: 1, dept: "Support", software: officeSoftware },
    { tag: "BLR-LN-00305", client: 2, cpu: "Intel i7-1255U", ram: "16 GB", storage: "512 GB SSD", used: 66, emp: 2, mgr: 0, dept: "Product", software: [SW.chrome122, SW.notion, SW.slack, SW.zoom] },

    // --- 20 additional devices ---
    { tag: "DEL-LN-00106", client: 0, cpu: "Intel i7-1365U", ram: "32 GB", storage: "1 TB SSD", used: 93, emp: 0, mgr: 0, dept: "Engineering", software: heavySoftware, withHistory: true },
    { tag: "DEL-LN-00107", client: 0, cpu: "AMD Ryzen 5 7530U", ram: "16 GB", storage: "512 GB SSD", used: 48, emp: 1, mgr: 0, dept: "Finance", software: officeSoftware },
    { tag: "DEL-DT-00108", client: 0, cpu: "Intel i9-13900", ram: "64 GB", storage: "2 TB NVMe", used: 77, emp: 2, mgr: 0, dept: "Data", software: heavySoftware },
    {
      tag: "DEL-LN-00109",
      client: 0,
      cpu: "Intel i5-1235U",
      ram: "16 GB",
      storage: "512 GB SSD",
      used: 52,
      emp: 3,
      mgr: 0,
      dept: "HR",
      software: officeSoftware,
      status: DeviceStatus.DISCARDED,
    },
    {
      tag: "DEL-LN-00110",
      client: 0,
      cpu: "Intel i5-10210U",
      ram: "8 GB",
      storage: "256 GB SSD",
      used: 70,
      emp: 0,
      mgr: 0,
      dept: "Ops",
      software: baseSoftware,
      status: DeviceStatus.RETIRED,
      retiredFlag: true,
    },
    { tag: "MUM-LN-00206", client: 1, cpu: "Intel i7-1355U", ram: "32 GB", storage: "1 TB SSD", used: 86, emp: 1, mgr: 1, dept: "Sales", software: officeSoftware, withHistory: true },
    { tag: "MUM-LN-00207", client: 1, cpu: "AMD Ryzen 7 7730U", ram: "16 GB", storage: "512 GB SSD", used: 41, emp: 2, mgr: 1, dept: "Marketing", software: [SW.chrome122, SW.notion, SW.slack] },
    {
      tag: "MUM-DT-00208",
      client: 1,
      cpu: "Intel Xeon Silver",
      ram: "128 GB",
      storage: "4 TB SSD",
      used: 64,
      emp: 3,
      mgr: 1,
      dept: "Design",
      software: heavySoftware,
      status: DeviceStatus.DISCARDED,
      withHistory: true,
    },
    {
      tag: "MUM-LN-00209",
      client: 1,
      cpu: "Intel i5-1135G7",
      ram: "8 GB",
      storage: "256 GB SSD",
      used: 95,
      emp: 0,
      mgr: 1,
      dept: "Support",
      software: baseSoftware,
      status: DeviceStatus.SCRAPPED,
      retiredFlag: true,
    },
    { tag: "MUM-LN-00210", client: 1, cpu: "Intel i7-1260P", ram: "16 GB", storage: "512 GB SSD", used: 37, emp: 1, mgr: 1, dept: "Engineering", software: heavySoftware },
    { tag: "BLR-LN-00306", client: 2, cpu: "Intel i7-13700H", ram: "32 GB", storage: "1 TB NVMe", used: 82, emp: 2, mgr: 0, dept: "R&D", software: heavySoftware, withHistory: true },
    { tag: "BLR-LN-00307", client: 2, cpu: "Intel i5-1335U", ram: "16 GB", storage: "512 GB SSD", used: 54, emp: 3, mgr: 0, dept: "QA", software: baseSoftware },
    {
      tag: "BLR-DT-00308",
      client: 2,
      cpu: "AMD Threadripper",
      ram: "128 GB",
      storage: "4 TB NVMe",
      used: 71,
      emp: 0,
      mgr: 1,
      dept: "DevOps",
      software: heavySoftware,
      status: DeviceStatus.DISCARDED,
    },
    {
      tag: "BLR-LN-00309",
      client: 2,
      cpu: "Intel i5-1245U",
      ram: "16 GB",
      storage: "512 GB SSD",
      used: 46,
      emp: 1,
      mgr: 1,
      dept: "Support",
      software: officeSoftware,
      status: DeviceStatus.RETIRED,
      retiredFlag: true,
    },
    { tag: "BLR-LN-00310", client: 2, cpu: "Intel i7-1255U", ram: "16 GB", storage: "512 GB SSD", used: 89, emp: 2, mgr: 0, dept: "Product", software: [SW.chrome122, SW.notion, SW.slack, SW.zoom], withHistory: true },
    { tag: "DEL-LN-00111", client: 0, cpu: "Intel i7-1185G7", ram: "16 GB", storage: "512 GB SSD", used: 83, emp: 3, mgr: 0, dept: "Engineering", software: heavySoftware },
    { tag: "MUM-LN-00211", client: 1, cpu: "AMD Ryzen 5 5600U", ram: "16 GB", storage: "512 GB SSD", used: 36, emp: 0, mgr: 1, dept: "Sales", software: officeSoftware },
    { tag: "BLR-LN-00311", client: 2, cpu: "Intel i5-11320H", ram: "16 GB", storage: "512 GB SSD", used: 62, emp: 1, mgr: 0, dept: "QA", software: baseSoftware },
    {
      tag: "DEL-LN-00112",
      client: 0,
      cpu: "Intel i3-1115G4",
      ram: "8 GB",
      storage: "256 GB SSD",
      used: 97,
      emp: 2,
      mgr: 0,
      dept: "Ops",
      software: [SW.chrome121, SW.office],
      status: DeviceStatus.DISCARDED,
      withHistory: true,
    },
    { tag: "MUM-LN-00212", client: 1, cpu: "Intel i7-1165G7", ram: "32 GB", storage: "1 TB SSD", used: 50, emp: 3, mgr: 1, dept: "Marketing", software: [SW.chrome122, SW.notion, SW.slack, SW.zoom] },
  ];

  const devices: Array<{ id: string; clientId: string; assetTag: string }> = [];
  for (const spec of deviceSpecs) {
    const client = clients[spec.client]!;
    const emp = employees[spec.emp]!;
    const mgr = managers[spec.mgr]!;
    const status = spec.status ?? DeviceStatus.ACTIVE;
    const discardedAt = status === DeviceStatus.DISCARDED ? daysAgo(20 + (spec.tag.length % 40)) : null;
    const deletionDueAt = discardedAt ? daysFrom(discardedAt, 90) : null;
    const retiredFlag = Boolean(spec.retiredFlag) || status === DeviceStatus.RETIRED || status === DeviceStatus.SCRAPPED;

    const device = await prisma.device.upsert({
      where: { assetTag: spec.tag },
      update: {
        cpu: spec.cpu,
        ram: spec.ram,
        storageTotal: spec.storage,
        storageUsedPercent: spec.used,
        status,
        discardedAt,
        deletionDueAt,
        retiredFlag,
        installedSoftware: spec.software,
        pciCards: [{ name: "Integrated Graphics" }],
        soundCards: ["Realtek Audio"],
        connectedDevices: ["USB Keyboard", "USB Mouse", "HDMI Monitor"],
      },
      create: {
        clientId: client.id,
        assetTag: spec.tag,
        cpu: spec.cpu,
        ram: spec.ram,
        storageTotal: spec.storage,
        storageUsedPercent: spec.used,
        status,
        discardedAt,
        deletionDueAt,
        retiredFlag,
        installedSoftware: spec.software,
        pciCards: [{ name: "Integrated Graphics" }],
        soundCards: ["Realtek Audio"],
        connectedDevices: ["USB Keyboard", "USB Mouse", "HDMI Monitor"],
        assignments: {
          create: {
            userName: emp.name,
            userPhone: "+91 98xxxxxxx0",
            userEmail: emp.email,
            department: spec.dept,
            managerName: mgr.name,
            managerPhone: "+91 98xxxxxxx1",
            managerEmail: mgr.email,
            employeeUserId: emp.id,
            managerUserId: mgr.id,
            isCurrent: true,
          },
        },
        qrCode: {
          create: { qrValue: `INV:${spec.tag}` },
        },
      },
    });
    devices.push(device);

    const qr = await prisma.qrCode.findUnique({ where: { deviceId: device.id } });
    if (!qr) {
      await prisma.qrCode.create({ data: { deviceId: device.id, qrValue: `INV:${spec.tag}` } });
    }

    const currentAssignment = await prisma.deviceAssignment.findFirst({
      where: { deviceId: device.id, isCurrent: true },
    });
    if (!currentAssignment) {
      await prisma.deviceAssignment.create({
        data: {
          deviceId: device.id,
          userName: emp.name,
          userPhone: "+91 98xxxxxxx0",
          userEmail: emp.email,
          department: spec.dept,
          managerName: mgr.name,
          managerPhone: "+91 98xxxxxxx1",
          managerEmail: mgr.email,
          employeeUserId: emp.id,
          managerUserId: mgr.id,
          isCurrent: true,
        },
      });
    } else {
      // Keep assignment contacts fresh
      await prisma.deviceAssignment.update({
        where: { id: currentAssignment.id },
        data: {
          userName: emp.name,
          userEmail: emp.email,
          department: spec.dept,
          managerName: mgr.name,
          managerEmail: mgr.email,
        },
      });
    }

    if (status === DeviceStatus.DISCARDED) {
      const existingLifecycle = await prisma.deviceLifecycleEvent.findFirst({
        where: { deviceId: device.id, eventType: LifecycleEventType.DISCARD },
      });
      if (!existingLifecycle) {
        await prisma.deviceLifecycleEvent.create({
          data: {
            deviceId: device.id,
            eventType: LifecycleEventType.DISCARD,
            performedBy: dgnManager.id,
            metadata: { reason: "seed-discard" },
            createdAt: discardedAt ?? daysAgo(30),
          },
        });
      }
    }
  }

  // Agent on first Delhi device
  const agentKey = "seed-agent-delhi-key";
  const primary = devices[0]!;
  const agent = await prisma.agent.upsert({
    where: { deviceId: primary.id },
    update: { apiKeyHash: hashAgentApiKey(agentKey), version: "1.0.0" },
    create: {
      deviceId: primary.id,
      clientId: primary.clientId,
      version: "1.0.0",
      apiKeyHash: hashAgentApiKey(agentKey),
    },
  });

  // --- Seed software / hardware history on selected assets ---
  const historyTargets = deviceSpecs
    .map((spec, index) => ({ spec, device: devices[index]! }))
    .filter((row) => row.spec.withHistory);

  for (const { spec, device } of historyTargets) {
    await prisma.deviceSoftwareEvent.deleteMany({ where: { deviceId: device.id } });
    await prisma.deviceHardwareChangeEvent.deleteMany({ where: { deviceId: device.id } });

    // Older installs
    await prisma.deviceSoftwareEvent.createMany({
      data: [
        {
          deviceId: device.id,
          softwareName: SW.chrome121.name,
          version: SW.chrome121.version,
          action: SoftwareChangeAction.ADDED,
          detectedAt: daysAgo(14),
        },
        {
          deviceId: device.id,
          softwareName: SW.vscode.name,
          version: SW.vscode.version,
          action: SoftwareChangeAction.ADDED,
          detectedAt: daysAgo(14),
        },
        {
          deviceId: device.id,
          softwareName: SW.zoom.name,
          version: SW.zoom.version,
          action: SoftwareChangeAction.ADDED,
          detectedAt: daysAgo(13),
        },
      ],
    });

    // Version upgrade + add/remove (visible in Software history tab)
    await prisma.deviceSoftwareEvent.createMany({
      data: [
        {
          deviceId: device.id,
          softwareName: SW.chrome121.name,
          version: SW.chrome121.version,
          action: SoftwareChangeAction.REMOVED,
          detectedAt: daysAgo(2),
        },
        {
          deviceId: device.id,
          softwareName: SW.chrome122.name,
          version: SW.chrome122.version,
          action: SoftwareChangeAction.ADDED,
          detectedAt: daysAgo(2),
        },
        {
          deviceId: device.id,
          softwareName: SW.slack.name,
          version: SW.slack.version,
          action: SoftwareChangeAction.ADDED,
          detectedAt: daysAgo(2),
        },
        {
          deviceId: device.id,
          softwareName: SW.zoom.name,
          version: SW.zoom.version,
          action: SoftwareChangeAction.REMOVED,
          detectedAt: daysAgo(1),
        },
      ],
    });

    await prisma.deviceHardwareChangeEvent.createMany({
      data: [
        {
          deviceId: device.id,
          changeType: HardwareChangeType.RAM,
          previousValue: "8 GB",
          newValue: spec.ram,
          detectedAt: daysAgo(14),
        },
        {
          deviceId: device.id,
          changeType: HardwareChangeType.STORAGE,
          previousValue: { total: "256 GB SSD", usedPercent: 60 },
          newValue: { total: spec.storage, usedPercent: spec.used },
          detectedAt: daysAgo(2),
        },
        {
          deviceId: device.id,
          changeType: HardwareChangeType.CONNECTED_DEVICE,
          previousValue: ["USB Mouse"],
          newValue: ["USB Keyboard", "USB Mouse", "HDMI Monitor"],
          detectedAt: daysAgo(2),
        },
        {
          deviceId: device.id,
          changeType: HardwareChangeType.PCI_CARD,
          previousValue: [],
          newValue: [{ name: "Integrated Graphics" }],
          detectedAt: daysAgo(1),
        },
      ],
    });
  }

  // --- Other network devices ---
  const ondSeed = [
    OtherDeviceType.KEYBOARD,
    OtherDeviceType.MOUSE,
    OtherDeviceType.MONITOR,
    OtherDeviceType.PRINTER,
    OtherDeviceType.SWITCH,
    OtherDeviceType.WIFI_ROUTER,
    OtherDeviceType.SSD,
    OtherDeviceType.CAMERA,
  ];

  for (let i = 0; i < ondSeed.length; i++) {
    const type = ondSeed[i]!;
    const client = clients[i % clients.length]!;
    const linked = i < 4 ? devices[i]!.id : null;
    const name = `Seed ${type} #${i + 1}`;
    const existing = await prisma.otherNetworkDevice.findFirst({
      where: { clientId: client.id, name },
    });
    if (!existing) {
      await prisma.otherNetworkDevice.create({
        data: {
          clientId: client.id,
          type,
          name,
          serialNumber: `SN-${type}-${1000 + i}`,
          purchaseDate: new Date("2024-01-15"),
          status: i % 2 === 0 ? OtherDeviceStatus.ACTIVE : OtherDeviceStatus.STOCK,
          attachedDeviceId: linked,
          warrantyStatus: WarrantyStatus.UNDER_WARRANTY,
          warrantyExpiryDate: new Date("2027-01-15"),
        },
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      entityType: "Seed",
      entityId: randomUUID(),
      action: AuditAction.CREATE,
      performedBy: superAdmin.id,
      before: Prisma.JsonNull,
      after: {
        message: "Database seeded",
        clients: clients.length,
        devices: devices.length,
        historyDevices: historyTargets.length,
        changedAt: new Date().toISOString(),
      },
    },
  });

  const highStorage = deviceSpecs.filter((d) => d.used >= 80).length;
  const discarded = deviceSpecs.filter((d) => d.status === DeviceStatus.DISCARDED).length;
  const retired = deviceSpecs.filter((d) => d.status === DeviceStatus.RETIRED).length;
  const scrapped = deviceSpecs.filter((d) => d.status === DeviceStatus.SCRAPPED).length;

  console.log("Seed complete.\n");
  console.log("Password for all users:", SEED_PASSWORD);
  console.log("Staff:", {
    superAdmin: superAdmin.email,
    dgnManager: dgnManager.email,
    serviceManager: serviceManager.email,
  });
  console.log(
    "Engineers:",
    engineers.map((u) => u.email),
  );
  console.log(
    "Managers:",
    managers.map((u) => u.email),
  );
  console.log(
    "Employees:",
    employees.map((u) => u.email),
  );
  console.log(
    "Clients:",
    clients.map((c) => c.name),
  );
  console.log(
    `Devices: ${devices.length} (storage≥80%: ${highStorage}, discarded: ${discarded}, retired: ${retired}, scrapped: ${scrapped})`,
  );
  console.log(`History seeded on ${historyTargets.length} devices (software + hardware events)`);
  console.log("Agent API key for", primary.assetTag + ":", agentKey);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
