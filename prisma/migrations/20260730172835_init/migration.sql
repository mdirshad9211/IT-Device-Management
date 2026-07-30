-- CreateEnum
CREATE TYPE "AppUserRole" AS ENUM ('SUPER_ADMIN', 'DGN_IT_MANAGER', 'SERVICE_MANAGER', 'IT_ENGINEER', 'CLIENT_MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'DISCARDED', 'RETIRED', 'SCRAPPED', 'DELETED');

-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('OK', 'NETWORK_FAILURE', 'SYSTEM_RESOURCE_FAILURE');

-- CreateEnum
CREATE TYPE "SoftwareChangeAction" AS ENUM ('ADDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "HardwareChangeType" AS ENUM ('PCI_CARD', 'SOUND_CARD', 'CONNECTED_DEVICE', 'RAM', 'STORAGE');

-- CreateEnum
CREATE TYPE "OtherDeviceType" AS ENUM ('RAM', 'HDD', 'SSD', 'NVME', 'MOUSE', 'KEYBOARD', 'BATTERY', 'PRINTER', 'WIFI_DONGLE', 'WIFI_ROUTER', 'SWITCH', 'CAMERA', 'PCI_CARD', 'SCANNER', 'MONITOR', 'LAPTOP_SCREEN', 'LAPTOP_KEYBOARD', 'LAPTOP_TRACKPAD', 'CONNECTOR', 'FIREWALL', 'LOAD_BALANCER', 'OTHER');

-- CreateEnum
CREATE TYPE "OtherDeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DAMAGED', 'IN_REPAIR', 'SCRAPPED', 'RETIRED', 'STOCK');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('UNDER_WARRANTY', 'EXPIRED', 'NO_WARRANTY');

-- CreateEnum
CREATE TYPE "LifecycleEventType" AS ENUM ('DISCARD', 'AUTO_DELETE', 'MANUAL_DELETE', 'REACTIVATE', 'RETIRE', 'SCRAP', 'LOCATION_CHANGE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DEVICE_ALLOTMENT', 'STORAGE_THRESHOLD', 'DISCARD_WARNING');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "current_location" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_locations" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "location_name" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "AppUserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineer_assignments" (
    "id" TEXT NOT NULL,
    "app_user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMP(3),

    CONSTRAINT "engineer_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "asset_tag" TEXT NOT NULL,
    "cpu" TEXT,
    "ram" TEXT,
    "storage_total" TEXT,
    "storage_used_percent" INTEGER,
    "pci_cards" JSONB,
    "sound_cards" JSONB,
    "connected_devices" JSONB,
    "installed_software" JSONB,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "discarded_at" TIMESTAMP(3),
    "deletion_due_at" TIMESTAMP(3),
    "retired_flag" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_assignments" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_phone" TEXT NOT NULL,
    "user_email" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "manager_name" TEXT NOT NULL,
    "manager_phone" TEXT NOT NULL,
    "manager_email" TEXT NOT NULL,
    "employee_user_id" TEXT,
    "manager_user_id" TEXT,
    "manager_acknowledged_at" TIMESTAMP(3),
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMP(3),

    CONSTRAINT "device_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "qr_value" TEXT NOT NULL,
    "print_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "api_key_hash" TEXT NOT NULL,
    "last_poll_at" TIMESTAMP(3),
    "last_poll_status" "PollStatus",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_poll_logs" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PollStatus" NOT NULL,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "polled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_poll_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_software_events" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "poll_log_id" TEXT,
    "software_name" TEXT NOT NULL,
    "action" "SoftwareChangeAction" NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_software_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_hardware_change_events" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "poll_log_id" TEXT,
    "change_type" "HardwareChangeType" NOT NULL,
    "previous_value" JSONB,
    "new_value" JSONB,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_hardware_change_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_lifecycle_events" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "event_type" "LifecycleEventType" NOT NULL,
    "performed_by" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "other_network_devices" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "type" "OtherDeviceType" NOT NULL,
    "name" TEXT NOT NULL,
    "serial_number" TEXT,
    "purchase_date" DATE,
    "status" "OtherDeviceStatus" NOT NULL DEFAULT 'STOCK',
    "attached_device_id" TEXT,
    "warranty_status" "WarrantyStatus" NOT NULL DEFAULT 'NO_WARRANTY',
    "warranty_expiry_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "other_network_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "performed_by" TEXT,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "device_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "recipients" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_name_key" ON "clients"("name");

-- CreateIndex
CREATE INDEX "site_locations_client_id_idx" ON "site_locations"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");

-- CreateIndex
CREATE INDEX "engineer_assignments_app_user_id_is_active_idx" ON "engineer_assignments"("app_user_id", "is_active");

-- CreateIndex
CREATE INDEX "engineer_assignments_client_id_is_active_idx" ON "engineer_assignments"("client_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "devices_asset_tag_key" ON "devices"("asset_tag");

-- CreateIndex
CREATE INDEX "devices_client_id_status_idx" ON "devices"("client_id", "status");

-- CreateIndex
CREATE INDEX "devices_status_deletion_due_at_idx" ON "devices"("status", "deletion_due_at");

-- CreateIndex
CREATE INDEX "device_assignments_device_id_is_current_idx" ON "device_assignments"("device_id", "is_current");

-- CreateIndex
CREATE INDEX "device_assignments_employee_user_id_idx" ON "device_assignments"("employee_user_id");

-- CreateIndex
CREATE INDEX "device_assignments_manager_user_id_idx" ON "device_assignments"("manager_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_device_id_key" ON "qr_codes"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_qr_value_key" ON "qr_codes"("qr_value");

-- CreateIndex
CREATE UNIQUE INDEX "agents_device_id_key" ON "agents"("device_id");

-- CreateIndex
CREATE INDEX "agent_poll_logs_agent_id_polled_at_idx" ON "agent_poll_logs"("agent_id", "polled_at");

-- CreateIndex
CREATE INDEX "device_software_events_device_id_detected_at_idx" ON "device_software_events"("device_id", "detected_at");

-- CreateIndex
CREATE INDEX "device_hardware_change_events_device_id_detected_at_idx" ON "device_hardware_change_events"("device_id", "detected_at");

-- CreateIndex
CREATE INDEX "device_lifecycle_events_device_id_idx" ON "device_lifecycle_events"("device_id");

-- CreateIndex
CREATE INDEX "other_network_devices_client_id_status_idx" ON "other_network_devices"("client_id", "status");

-- CreateIndex
CREATE INDEX "other_network_devices_attached_device_id_idx" ON "other_network_devices"("attached_device_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- AddForeignKey
ALTER TABLE "site_locations" ADD CONSTRAINT "site_locations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineer_assignments" ADD CONSTRAINT "engineer_assignments_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineer_assignments" ADD CONSTRAINT "engineer_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_assignments" ADD CONSTRAINT "device_assignments_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_assignments" ADD CONSTRAINT "device_assignments_employee_user_id_fkey" FOREIGN KEY ("employee_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_assignments" ADD CONSTRAINT "device_assignments_manager_user_id_fkey" FOREIGN KEY ("manager_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_poll_logs" ADD CONSTRAINT "agent_poll_logs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_software_events" ADD CONSTRAINT "device_software_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_software_events" ADD CONSTRAINT "device_software_events_poll_log_id_fkey" FOREIGN KEY ("poll_log_id") REFERENCES "agent_poll_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_hardware_change_events" ADD CONSTRAINT "device_hardware_change_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_hardware_change_events" ADD CONSTRAINT "device_hardware_change_events_poll_log_id_fkey" FOREIGN KEY ("poll_log_id") REFERENCES "agent_poll_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_lifecycle_events" ADD CONSTRAINT "device_lifecycle_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_lifecycle_events" ADD CONSTRAINT "device_lifecycle_events_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_network_devices" ADD CONSTRAINT "other_network_devices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_network_devices" ADD CONSTRAINT "other_network_devices_attached_device_id_fkey" FOREIGN KEY ("attached_device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
