import type { PrismaClient } from "@prisma/client";
import {
  DEFAULT_PERMISSION_MATRIX,
  parsePermissionMatrix,
  serializePermissionMatrix,
  setRuntimePermissionMatrix,
  type PermissionMatrix,
} from "./permission-matrix";

export const RBAC_MATRIX_SETTING_KEY = "rbac_matrix";

export async function loadPermissionMatrixFromDb(prisma: PrismaClient): Promise<PermissionMatrix> {
  const row = await prisma.systemSetting.findUnique({ where: { key: RBAC_MATRIX_SETTING_KEY } });
  if (!row) {
    setRuntimePermissionMatrix(null);
    return DEFAULT_PERMISSION_MATRIX;
  }
  const matrix = parsePermissionMatrix(row.value);
  setRuntimePermissionMatrix(matrix);
  return matrix;
}

export async function savePermissionMatrixToDb(
  prisma: PrismaClient,
  matrix: PermissionMatrix,
  updatedBy: string | null,
): Promise<PermissionMatrix> {
  parsePermissionMatrix(serializePermissionMatrix(matrix)); // validate shape
  await prisma.systemSetting.upsert({
    where: { key: RBAC_MATRIX_SETTING_KEY },
    create: {
      key: RBAC_MATRIX_SETTING_KEY,
      value: serializePermissionMatrix(matrix),
      updatedBy,
    },
    update: {
      value: serializePermissionMatrix(matrix),
      updatedBy,
    },
  });
  setRuntimePermissionMatrix(matrix);
  return matrix;
}
