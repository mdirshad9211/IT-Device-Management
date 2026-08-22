import { buildZip } from "./agent.zip";

export type AgentPackageCredential = {
  deviceId: string;
  assetTag: string;
  agentId: string;
  apiKey: string;
};

export type AgentPackageInput = {
  clientId: string;
  clientName: string;
  apiBaseUrl: string;
  downloadToken: string;
  expiresAt: string;
  credentials: AgentPackageCredential[];
};

function safeFilePart(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "site";
}

export function agentPackageFileName(clientName: string): string {
  return `dcn-agent-${safeFilePart(clientName)}.zip`;
}

const LIST_SOFTWARE_PS1 = `# Outputs installed programs as JSON
$ErrorActionPreference = "SilentlyContinue"
$paths = @(
  "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
  "HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
  "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
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
`;

export function buildAgentInstallerPackage(input: AgentPackageInput): Buffer {
  const config = {
    siteName: input.clientName,
    clientId: input.clientId,
    apiBaseUrl: input.apiBaseUrl.replace(/\/$/, ""),
    downloadToken: input.downloadToken,
    downloadTokenExpiresAt: input.expiresAt,
    agentVersion: "1.1.0",
  };

  const credSummary = input.credentials
    .map(
      (c) =>
        `| \`${c.assetTag}\` | \`${c.agentId}\` | \`${c.apiKey}\` | \`${c.deviceId}\` |`,
    )
    .join("\n");

  const readme = `# DCN Inventory Agent — ${input.clientName}

## Your agent credentials (keep private)

| Asset tag | Agent ID | API key | Device ID |
|-----------|----------|---------|-----------|
${credSummary || "| — | No devices on this site yet | — | — |"}

Also see:
- \`AGENTS.md\` — same table in markdown
- \`credentials/\*.json\` — one file per device (ready to copy as \`credentials.json\`)

## Setup on a workstation

1. Pick the JSON for that machine under \`credentials/\`
2. Copy it to \`credentials.json\` next to \`run-agent.ps1\`
3. Run:

\`\`\`powershell
.\\run-agent.ps1
\`\`\`

Or from the inventory UI open that asset and click **Scan now** (backend on the same PC).

Download token expires: ${input.expiresAt}
`;

  const agentsMd = `# Agent credentials — ${input.clientName}

Generated for site \`${input.clientId}\`.

| Asset tag | Agent ID | API key |
|-----------|----------|---------|
${input.credentials.map((c) => `| ${c.assetTag} | \`${c.agentId}\` | \`${c.apiKey}\` |`).join("\n") || "| — | none | — |"}

Copy the matching \`credentials/<asset-tag>.json\` to \`credentials.json\` before running the agent.
`;

  const ps1 = `# DCN Inventory Agent (Windows)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Config = Get-Content (Join-Path $Root "config.json") -Raw | ConvertFrom-Json
$CredPath = Join-Path $Root "credentials.json"
if (-not (Test-Path $CredPath)) {
  Write-Host "Missing credentials.json — copy from credentials\\\\<asset-tag>.json" -ForegroundColor Yellow
  exit 1
}
$Cred = Get-Content $CredPath -Raw | ConvertFrom-Json
if (-not $Cred.agentId -or -not $Cred.apiKey) {
  Write-Host "credentials.json needs agentId and apiKey" -ForegroundColor Yellow
  exit 1
}

$cs = Get-CimInstance Win32_ComputerSystem
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
$ramGb = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$usedPct = if ($disk -and $disk.Size -gt 0) { [int][math]::Round(100 * (1 - ($disk.FreeSpace / $disk.Size))) } else { $null }

Write-Host "Scanning installed software..."
$softJson = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "list-software.ps1")
$software = if ($softJson) { $softJson | ConvertFrom-Json } else { @() }
if ($software -isnot [System.Array]) { $software = @($software) }
Write-Host ("Found {0} programs" -f $software.Count)

$payload = [ordered]@{
  cpu = "$cpu"
  ram = "$ramGb GB"
  storageTotal = if ($disk) { "{0:N0} GB" -f ($disk.Size / 1GB) } else { $null }
  storageUsedPercent = $usedPct
  installedSoftware = @($software)
}
$body = $payload | ConvertTo-Json -Depth 6 -Compress

$url = "$($Config.apiBaseUrl.TrimEnd('/'))/api/v1/agents/$($Cred.agentId)/poll"
Write-Host "Polling $url ..."
$res = Invoke-RestMethod -Method Post -Uri $url -Headers @{ "x-agent-api-key" = $Cred.apiKey; "Content-Type" = "application/json" } -Body $body
$added = @($res.softwareChanges | Where-Object { $_.action -eq "ADDED" }).Count
$removed = @($res.softwareChanges | Where-Object { $_.action -eq "REMOVED" }).Count
$updated = @($res.softwareChanges | Where-Object { $_.action -eq "UPDATED" }).Count
Write-Host ("OK — status={0}  software +{1} ~{2} -{3}" -f $res.status, $added, $updated, $removed) -ForegroundColor Green
`;

  const mjs = `#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import os from "node:os";

const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(root, "config.json"), "utf8"));
const credPath = join(root, "credentials.json");
if (!existsSync(credPath)) {
  console.error("Missing credentials.json — copy from credentials/<asset-tag>.json");
  process.exit(1);
}
const cred = JSON.parse(readFileSync(credPath, "utf8"));
if (!cred.agentId || !cred.apiKey) {
  console.error("credentials.json needs agentId and apiKey");
  process.exit(1);
}

function listSoftware() {
  if (process.platform === "win32") {
    try {
      const script = join(root, "list-software.ps1");
      const raw = execFileSync(
        "powershell",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
        { encoding: "utf8", windowsHide: true, maxBuffer: 12 * 1024 * 1024 },
      ).trim();
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      console.warn("Software scan failed:", e.message);
    }
  }
  return [{ name: "node " + process.version }, { name: os.platform() }];
}

const installedSoftware = listSoftware();
console.log("Found " + installedSoftware.length + " programs");
const body = {
  cpu: os.cpus()[0]?.model ?? "unknown",
  ram: (os.totalmem() / 1024 ** 3).toFixed(1) + " GB",
  installedSoftware,
};
const url = String(config.apiBaseUrl).replace(/\\/$/, "") + "/api/v1/agents/" + cred.agentId + "/poll";
console.log("Polling", url);
const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "x-agent-api-key": cred.apiKey },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) {
  console.error("Poll failed", res.status, text);
  process.exit(1);
}
const json = JSON.parse(text);
const added = (json.softwareChanges || []).filter((c) => c.action === "ADDED").length;
const removed = (json.softwareChanges || []).filter((c) => c.action === "REMOVED").length;
const updated = (json.softwareChanges || []).filter((c) => c.action === "UPDATED").length;
console.log("OK — status=" + json.status + "  software +" + added + " ~" + updated + " -" + removed);
`;

  const entries: { name: string; data: string }[] = [
    { name: "README.md", data: readme },
    { name: "AGENTS.md", data: agentsMd },
    { name: "config.json", data: JSON.stringify(config, null, 2) + "\n" },
    { name: "list-software.ps1", data: LIST_SOFTWARE_PS1 },
    { name: "run-agent.ps1", data: ps1 },
    { name: "run-agent.mjs", data: mjs },
    {
      name: "agents.json",
      data: JSON.stringify({ site: input.clientName, clientId: input.clientId, agents: input.credentials }, null, 2) + "\n",
    },
  ];

  for (const c of input.credentials) {
    const fileSafe = safeFilePart(c.assetTag);
    entries.push({
      name: `credentials/${fileSafe}.json`,
      data:
        JSON.stringify(
          {
            assetTag: c.assetTag,
            deviceId: c.deviceId,
            agentId: c.agentId,
            apiKey: c.apiKey,
            apiBaseUrl: config.apiBaseUrl,
            note: "Copy this file to credentials.json next to run-agent.ps1",
          },
          null,
          2,
        ) + "\n",
    });
  }

  if (input.credentials[0]) {
    const c = input.credentials[0];
    entries.push({
      name: "credentials.json",
      data:
        JSON.stringify(
          {
            assetTag: c.assetTag,
            deviceId: c.deviceId,
            agentId: c.agentId,
            apiKey: c.apiKey,
            note: "Default = first device on site. Replace with another file from credentials/ if needed.",
          },
          null,
          2,
        ) + "\n",
    });
  }

  return buildZip(entries);
}
