$ErrorActionPreference = "SilentlyContinue"
$cpu = (Get-CimInstance Win32_Processor).Name.Trim()
$cs = Get-CimInstance Win32_ComputerSystem
$ramGb = [math]::Max(1, [math]::Round($cs.TotalPhysicalMemory / 1GB, 0))
$disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"
$total = ($disks | Measure-Object Size -Sum).Sum
$free = ($disks | Measure-Object FreeSpace -Sum).Sum
$storageGb = [math]::Round($total / 1GB, 0)
$usedPct = if ($total -gt 0) { [int]((($total - $free) / $total) * 100) } else { 0 }
$sw = @(
  Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*,
                   HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\* |
    Where-Object { $_.DisplayName } |
    Select-Object -ExpandProperty DisplayName -Unique |
    Select-Object -First 50
)
$connected = @(
  Get-PnpDevice -PresentOnly |
    Where-Object { $_.Class -in @('Keyboard','Mouse','Monitor','Camera','Net','HIDClass','USB') -and $_.Status -eq 'OK' } |
    Select-Object -First 30 -ExpandProperty FriendlyName
)
$sound = @(Get-CimInstance Win32_SoundDevice | Select-Object -ExpandProperty Name)
$pci = @(
  Get-CimInstance Win32_PnPEntity |
    Where-Object { $_.PNPClass -eq 'Display' -or $_.Name -match 'PCI|Radeon|Graphics' } |
    Select-Object -First 15 -ExpandProperty Name
)

[pscustomobject]@{
  hostname = $env:COMPUTERNAME
  manufacturer = $cs.Manufacturer
  model = $cs.Model
  os = (Get-CimInstance Win32_OperatingSystem).Caption
  cpu = $cpu
  ram = "$ramGb GB"
  storageTotal = "$storageGb GB SSD"
  storageUsedPercent = $usedPct
  installedSoftware = $sw
  connectedDevices = $connected
  soundCards = $sound
  pciCards = $pci
} | ConvertTo-Json -Compress -Depth 5
