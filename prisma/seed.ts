/**
 * Comprehensive seed — roles, multi-user engineers/employees, clients,
 * locations history, ~15–20 site devices (+ QR + assignments), and a mix of
 * other-network devices. Password for every AppUser: Password123!
 *
 * Run: npm run seed
 */
import {
  AppUserRole,
  AuditAction,
  DeviceStatus,
  OtherDeviceStatus,
  OtherDeviceType,
  Prisma,
  PrismaClient,
  WarrantyStatus,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { hashAgentApiKey } from "../src/modules/auth/agent-api-key";


const prisma = new PrismaClient();
const SEED_PASSWORD = "Password123!";

async function upsertUser(email: string, name: string, role: AppUserRole, passwordHash: string) {
  return prisma.appUser.upsert({
    where: { email },
    update: { name, role, passwordHash, isActive: true },
    create: { email, name, role, passwordHash, isActive: true },
  });
}

async function main() {
  console.log("Seeding inventory database...");
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  // --- Users: 1 per staff/manager role + 4 engineers + 4 employees ---
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

  // --- Clients + location history ---
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

  // Engineers: assign first two to Delhi+Mumbai, others to Bengaluru
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

  // --- Devices (15) across sites ---
  const deviceSpecs = [
    { tag: "DEL-LN-00101", client: 0, cpu: "Intel i5-1235U", ram: "16 GB", storage: "512 GB SSD", emp: 0, mgr: 0, dept: "Engineering" },
    { tag: "DEL-LN-00102", client: 0, cpu: "Intel i7-1355U", ram: "32 GB", storage: "1 TB NVMe", emp: 1, mgr: 0, dept: "Finance" },
    { tag: "DEL-DT-00103", client: 0, cpu: "AMD Ryzen 5", ram: "16 GB", storage: "512 GB SSD", emp: 2, mgr: 0, dept: "Ops" },
    { tag: "DEL-LN-00104", client: 0, cpu: "Intel i5-1135G7", ram: "8 GB", storage: "256 GB SSD", emp: 3, mgr: 0, dept: "HR" },
    { tag: "DEL-LN-00105", client: 0, cpu: "Intel i5-1345U", ram: "16 GB", storage: "512 GB SSD", emp: 0, mgr: 0, dept: "Engineering" },
    { tag: "MUM-LN-00201", client: 1, cpu: "Intel i7-1260P", ram: "16 GB", storage: "512 GB SSD", emp: 1, mgr: 1, dept: "Sales" },
    { tag: "MUM-LN-00202", client: 1, cpu: "Intel i5-1240P", ram: "16 GB", storage: "512 GB SSD", emp: 2, mgr: 1, dept: "Marketing" },
    { tag: "MUM-DT-00203", client: 1, cpu: "Intel Xeon W", ram: "64 GB", storage: "2 TB SSD", emp: 3, mgr: 1, dept: "Design" },
    { tag: "MUM-LN-00204", client: 1, cpu: "Intel i5-1135G7", ram: "8 GB", storage: "256 GB SSD", emp: 0, mgr: 1, dept: "Support" },
    { tag: "MUM-LN-00205", client: 1, cpu: "AMD Ryzen 7", ram: "32 GB", storage: "1 TB SSD", emp: 1, mgr: 1, dept: "Engineering" },
    { tag: "BLR-LN-00301", client: 2, cpu: "Intel i7-13700H", ram: "32 GB", storage: "1 TB NVMe", emp: 2, mgr: 0, dept: "R&D" },
    { tag: "BLR-LN-00302", client: 2, cpu: "Intel i5-1335U", ram: "16 GB", storage: "512 GB SSD", emp: 3, mgr: 0, dept: "QA" },
    { tag: "BLR-DT-00303", client: 2, cpu: "AMD Ryzen 9", ram: "64 GB", storage: "2 TB NVMe", emp: 0, mgr: 1, dept: "DevOps" },
    { tag: "BLR-LN-00304", client: 2, cpu: "Intel i5-1245U", ram: "16 GB", storage: "512 GB SSD", emp: 1, mgr: 1, dept: "Support" },
    { tag: "BLR-LN-00305", client: 2, cpu: "Intel i7-1255U", ram: "16 GB", storage: "512 GB SSD", emp: 2, mgr: 0, dept: "Product" },
  ] as const;

  const devices = [];
  for (const spec of deviceSpecs) {
    const client = clients[spec.client]!;
    const emp = employees[spec.emp]!;
    const mgr = managers[spec.mgr]!;
    const device = await prisma.device.upsert({
      where: { assetTag: spec.tag },
      update: {
        cpu: spec.cpu,
        ram: spec.ram,
        storageTotal: spec.storage,
        storageUsedPercent: 20 + (spec.tag.charCodeAt(spec.tag.length - 1) % 60),
        status: DeviceStatus.ACTIVE,
      },
      create: {
        clientId: client.id,
        assetTag: spec.tag,
        cpu: spec.cpu,
        ram: spec.ram,
        storageTotal: spec.storage,
        storageUsedPercent: 20 + (spec.tag.charCodeAt(spec.tag.length - 1) % 60),
        status: DeviceStatus.ACTIVE,
        installedSoftware: ["Chrome", "VS Code", "Zoom"],
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

    // Ensure QR exists for upserted devices that already existed without QR
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
    }
  }

  // Agent on first Delhi device
  const agentKey = "seed-agent-delhi-key";
  const primary = devices[0]!;
  await prisma.agent.upsert({
    where: { deviceId: primary.id },
    update: { apiKeyHash: hashAgentApiKey(agentKey), version: "1.0.0" },
    create: {
      deviceId: primary.id,
      clientId: primary.clientId,
      version: "1.0.0",
      apiKeyHash: hashAgentApiKey(agentKey),
    },
  });

  // --- Other network devices (mix of types) ---
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

  // Sample audit breadcrumb so /audit-logs is non-empty after seed
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
        changedAt: new Date().toISOString(),
      },
    },
  });

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
  console.log("Devices:", devices.length, "| Agent API key for", primary.assetTag + ":", agentKey);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
