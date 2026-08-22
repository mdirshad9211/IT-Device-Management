import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import type { PollPayload } from "./agent.diff";

const execFileAsync = promisify(execFile);

/**
 * Collects live telemetry from the machine running the inventory backend.
 * Intended for "Scan now" when the backend is on (or beside) the workstation.
 */
export async function collectLocalTelemetry(): Promise<PollPayload> {
  const cpu = os.cpus()[0]?.model?.trim() || "unknown";
  const ramGb = (os.totalmem() / 1024 ** 3).toFixed(1);
  const installedSoftware = await listInstalledSoftware();
  const disk = await collectDiskSummary();

  return {
    cpu,
    ram: `${ramGb} GB`,
    storageTotal: disk?.total ?? undefined,
    storageUsedPercent: disk?.usedPercent ?? undefined,
    installedSoftware,
  };
}

type SoftRow = {
  name: string;
  version?: string;
  productKey?: string;
  installedAt?: string;
  updatedAt?: string;
};

async function listInstalledSoftware(): Promise<SoftRow[]> {
  if (process.platform !== "win32") {
    return [
      { name: `node ${process.version}` },
      { name: os.platform() },
      { name: os.hostname() },
    ];
  }

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$paths = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$seen = @{}
$list = New-Object System.Collections.Generic.List[object]
foreach ($path in $paths) {
  Get-ItemProperty $path | ForEach-Object {
    $name = $_.DisplayName
    if (-not $name) { return }
    $name = $name.Trim()
    if ($name.Length -lt 2) { return }
    $key = $name.ToLowerInvariant()
    if ($seen.ContainsKey($key)) { return }
    $seen[$key] = $true
    $ver = if ($_.DisplayVersion) { $_.DisplayVersion.Trim() } else { $null }
    $productId = $null
    if ($_.ProductID) { $productId = $_.ProductID.ToString().Trim() }
    elseif ($_.DigitalProductId) { $productId = '***' }
    $installDate = $null
    if ($_.InstallDate) {
      $raw = $_.InstallDate.ToString().Trim()
      if ($raw -match '^\\d{8}$') {
        $installDate = $raw.Substring(0,4) + '-' + $raw.Substring(4,2) + '-' + $raw.Substring(6,2)
      } else { $installDate = $raw }
    }
    $obj = [ordered]@{ name = $name }
    if ($ver) { $obj.version = $ver }
    if ($productId) { $obj.productKey = $productId }
    if ($installDate) { $obj.installedAt = $installDate }
    [void]$list.Add([pscustomobject]$obj)
  }
}
@($list | Sort-Object name) | ConvertTo-Json -Compress -Depth 4
`.trim();

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 60_000 },
    );
    const raw = stdout.trim();
    if (!raw) return [{ name: os.hostname() }];
    const parsed = JSON.parse(raw) as SoftRow[] | SoftRow;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter((x) => x && typeof x.name === "string" && x.name.trim());
  } catch {
    return [{ name: os.hostname() }, { name: `node ${process.version}` }];
  }
}

async function collectDiskSummary(): Promise<{ total: string; usedPercent: number } | null> {
  if (process.platform !== "win32") {
    return null;
  }
  const script = `
$d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
if (-not $d -or $d.Size -le 0) { '' } else {
  $used = [int][math]::Round(100 * (1 - ($d.FreeSpace / $d.Size)))
  $total = '{0:N0} GB' -f ($d.Size / 1GB)
  (@{ total = $total; usedPercent = $used } | ConvertTo-Json -Compress)
}
`.trim();
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: 15_000 },
    );
    const raw = stdout.trim();
    if (!raw) return null;
    return JSON.parse(raw) as { total: string; usedPercent: number };
  } catch {
    return null;
  }
}
