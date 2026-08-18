-- AlterTable
ALTER TABLE "app_users" ADD COLUMN "password_hash" TEXT NOT NULL DEFAULT '$2b$10$DyeOpFWzRI/zzsfRZs8DXOC8PllojNnHo7dHs12GXhcEaWRzZH..O';

-- Drop the migrate-only default so new rows must set password_hash explicitly
ALTER TABLE "app_users" ALTER COLUMN "password_hash" DROP DEFAULT;
