/**
 * Seed script — creates one AppUser per role, one Client, an active
 * EngineerAssignment, and one Device + DeviceAssignment linking the
 * CLIENT_MANAGER and EMPLOYEE seed users, so scoped self-service views
 * have real data to test against immediately.
 *
 * Run with: npm run seed
 */
import { PrismaClient, AppUserRole, DeviceStatus } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const client = await prisma.client.upsert({
    where: { name: "CRL Delhi" },
    update: {},
    create: {
      name: "CRL Delhi",
      currentLocation: "CRL Delhi",
      locations: {
        create: { locationName: "CRL Delhi", isCurrent: true },
      },
    },
  });

  // Local-dev password for every seeded AppUser. Replace in any non-dev environment.
  const seedPasswordHash = await bcrypt.hash("Password123!", 10);

  const roleSeed: { email: string; name: string; role: AppUserRole }[] = [
    { email: "super.admin@inventory.local", name: "Super Admin", role: AppUserRole.SUPER_ADMIN },
    { email: "dgn.manager@inventory.local", name: "DGN IT Manager", role: AppUserRole.DGN_IT_MANAGER },
    { email: "service.manager@inventory.local", name: "Service Manager", role: AppUserRole.SERVICE_MANAGER },
    { email: "ravi.sharma@inventory.local", name: "Ravi Sharma", role: AppUserRole.IT_ENGINEER },
    { email: "sameer.kapoor@client.local", name: "Sameer Kapoor", role: AppUserRole.CLIENT_MANAGER },
    { email: "priya.nair@client.local", name: "Priya Nair", role: AppUserRole.EMPLOYEE },
  ];

  const users: Record<string, { id: string }> = {};
  for (const u of roleSeed) {
    const created = await prisma.appUser.upsert({
      where: { email: u.email },
      update: { passwordHash: seedPasswordHash },
      create: { email: u.email, name: u.name, role: u.role, passwordHash: seedPasswordHash },
    });
    users[u.role] = created;
  }

  const existingAssignment = await prisma.engineerAssignment.findFirst({
    where: { appUserId: users[AppUserRole.IT_ENGINEER]!.id, clientId: client.id },
  });
  if (!existingAssignment) {
    await prisma.engineerAssignment.create({
      data: {
        appUserId: users[AppUserRole.IT_ENGINEER]!.id,
        clientId: client.id,
        isActive: true,
      },
    });
  }

  const device = await prisma.device.upsert({
    where: { assetTag: "DEL-LN-00203" },
    update: {},
    create: {
      clientId: client.id,
      assetTag: "DEL-LN-00203",
      cpu: "Intel Core i5-1345U",
      ram: "16 GB",
      storageTotal: "512 GB SSD",
      storageUsedPercent: 41,
      status: DeviceStatus.ACTIVE,
      assignments: {
        create: {
          userName: "Priya Nair",
          userPhone: "+91 98xxxxxxx0",
          userEmail: "priya.nair@client.local",
          department: "Engineering",
          managerName: "Sameer Kapoor",
          managerPhone: "+91 98xxxxxxx1",
          managerEmail: "sameer.kapoor@client.local",
          employeeUserId: users[AppUserRole.EMPLOYEE]!.id,
          managerUserId: users[AppUserRole.CLIENT_MANAGER]!.id,
          isCurrent: true,
        },
      },
      qrCode: {
        create: { qrValue: "QR-DEL-LN-00203" },
      },
    },
  });

  console.log("Seed complete:");
  console.log({ client: client.name, device: device.assetTag, users: Object.keys(users) });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
