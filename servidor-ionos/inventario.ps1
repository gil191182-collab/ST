<#
  Inventario del servidor de VerifyPerson / CertifAIPerson
  ---------------------------------------------------------
  - SOLO LEE informacion. No modifica, no borra y no reinicia nada.
  - Ejecutar en el servidor Windows, en PowerShell "Como administrador":
        powershell -ExecutionPolicy Bypass -File .\inventario.ps1
  - Genera un archivo en el Escritorio: inventario-servidor.txt
  - Las contrasenas y llaves se ocultan (***) para que el reporte se pueda compartir.
#>

$ErrorActionPreference = 'SilentlyContinue'
$out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'inventario-servidor.txt'
$log = New-Object System.Collections.Generic.List[string]
function W($t) { $log.Add([string]$t) }
function H($t) { W ''; W ('=' * 70); W "== $t"; W ('=' * 70) }
function Mask($s) {
    $s = [regex]::Replace($s, '(?i)(password|pwd)\s*=\s*[^;"]*', '$1=***')
    return $s
}

H 'SERVIDOR'
W ("Fecha:     " + (Get-Date))
W ("Equipo:    " + $env:COMPUTERNAME)
$os = Get-CimInstance Win32_OperatingSystem
W ("Windows:   " + $os.Caption + " " + $os.Version)
W ("Memoria:   {0:N1} GB" -f ($os.TotalVisibleMemorySize / 1MB))
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
    W ("Disco {0}  total {1:N0} GB  libre {2:N0} GB" -f $_.DeviceID, ($_.Size/1GB), ($_.FreeSpace/1GB))
}

H 'USUARIOS ADMINISTRADORES'
Get-LocalGroupMember -Group 'Administrators' | ForEach-Object { W $_.Name }
Get-LocalGroupMember -Group 'Administradores' | ForEach-Object { W $_.Name }
W ''
W 'Usuarios locales (nombre / activo / ultimo acceso):'
Get-LocalUser | ForEach-Object { W ("  {0} / {1} / {2}" -f $_.Name, $_.Enabled, $_.LastLogon) }

H 'SITIOS WEB EN IIS'
Import-Module WebAdministration
$sites = Get-Website
foreach ($s in $sites) {
    $path = [Environment]::ExpandEnvironmentVariables($s.physicalPath)
    W ''
    W ("Sitio:     " + $s.name + "   (estado: " + $s.state + ")")
    W ("Carpeta:   " + $path)
    W ("Pool:      " + $s.applicationPool)
    $s.bindings.Collection | ForEach-Object { W ("Enlace:    " + $_.protocol + " " + $_.bindingInformation) }

    if (Test-Path $path) {
        $all = Get-ChildItem $path -Recurse -File
        $cs  = ($all | Where-Object Extension -eq '.cs').Count
        $sln = ($all | Where-Object { $_.Extension -in '.sln','.csproj' }).Count
        $dll = ($all | Where-Object { $_.Extension -eq '.dll' -and $_.DirectoryName -like '*\bin*' }).Count
        $mb  = ($all | Measure-Object Length -Sum).Sum / 1MB
        W ("Archivos:  {0}  ({1:N0} MB)" -f $all.Count, $mb)
        W ("Codigo fuente .cs: {0}   Proyectos .sln/.csproj: {1}   DLL compiladas en bin: {2}" -f $cs, $sln, $dll)
        W 'Carpetas principales:'
        Get-ChildItem $path -Directory | ForEach-Object {
            $sz = (Get-ChildItem $_.FullName -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
            W ("   {0,-30} {1,10:N1} MB" -f $_.Name, $sz)
        }
        $wc = Join-Path $path 'web.config'
        if (Test-Path $wc) {
            [xml]$x = Get-Content $wc
            W 'Conexiones a base de datos (web.config):'
            $x.configuration.connectionStrings.add | ForEach-Object { W ("   " + $_.name + " -> " + (Mask $_.connectionString)) }
            W 'Configuraciones (appSettings) - solo nombres:'
            $x.configuration.appSettings.add | ForEach-Object { W ("   " + $_.key) }
            W ("Framework destino: " + $x.configuration.'system.web'.httpRuntime.targetFramework)
        }
    }
}

H 'APPLICATION POOLS'
Get-ChildItem IIS:\AppPools | ForEach-Object {
    W ("{0,-35} .NET {1,-6} identidad: {2} {3}" -f $_.Name, $_.managedRuntimeVersion, $_.processModel.identityType, $_.processModel.userName)
}

H 'CERTIFICADOS SSL'
Get-ChildItem Cert:\LocalMachine\My | ForEach-Object {
    W ("{0}  vence {1:yyyy-MM-dd}  emisor {2}" -f $_.Subject, $_.NotAfter, $_.Issuer)
}

H 'SQL SERVER'
Get-Service | Where-Object { $_.Name -like 'MSSQL*' -or $_.Name -like 'SQL*' } | ForEach-Object {
    W ("Servicio: {0,-30} {1}" -f $_.Name, $_.Status)
}
$inst = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server').InstalledInstances
W ("Instancias: " + ($inst -join ', '))
if (Get-Command sqlcmd) {
    foreach ($i in $inst) {
        $srv = if ($i -eq 'MSSQLSERVER') { '.' } else { ".\$i" }
        W ''
        W "Bases de datos en ${srv}:"
        $q = "SET NOCOUNT ON; SELECT d.name, CAST(SUM(f.size)*8/1024 AS int) AS MB, d.recovery_model_desc FROM sys.databases d JOIN sys.master_files f ON d.database_id=f.database_id GROUP BY d.name, d.recovery_model_desc ORDER BY d.name"
        sqlcmd -S $srv -E -W -h -1 -s ' | ' -Q $q | ForEach-Object { W ("   " + $_) }
        W 'Ultimo respaldo de cada base:'
        $q2 = "SET NOCOUNT ON; SELECT database_name, MAX(backup_finish_date) FROM msdb.dbo.backupset GROUP BY database_name"
        sqlcmd -S $srv -E -W -h -1 -s ' | ' -Q $q2 | ForEach-Object { W ("   " + $_) }
    }
} else { W 'sqlcmd no esta instalado (no se pudieron listar las bases).' }

H 'TAREAS PROGRAMADAS (no de Microsoft)'
Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\Microsoft\*' } | ForEach-Object {
    W ("{0}{1}  ->  {2} {3}" -f $_.TaskPath, $_.TaskName, ($_.Actions.Execute -join ' '), ($_.Actions.Arguments -join ' '))
}

H 'SERVICIOS AUTOMATICOS (no de Microsoft)'
Get-CimInstance Win32_Service | Where-Object { $_.StartMode -eq 'Auto' -and $_.PathName -notlike '*\Windows\*' } | ForEach-Object {
    W ("{0,-35} {1,-8} {2}" -f $_.Name, $_.State, $_.PathName)
}

H 'PROGRAMAS INSTALADOS'
$keys = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
Get-ItemProperty $keys | Where-Object DisplayName | Sort-Object DisplayName -Unique | ForEach-Object {
    W ("{0}  {1}" -f $_.DisplayName, $_.DisplayVersion)
}

H 'ACCESO REMOTO'
$rdp = (Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp').PortNumber
W ("Puerto de Escritorio Remoto: " + $rdp)
Get-NetFirewallRule -Enabled True -Direction Inbound -Action Allow | Get-NetFirewallPortFilter | Where-Object LocalPort -notin 'Any','RPC','RPCEPMap' | Select-Object -ExpandProperty LocalPort -Unique | ForEach-Object { W ("Puerto abierto en firewall: " + $_) }

$log | Out-File -FilePath $out -Encoding UTF8
Write-Host ""
Write-Host "Listo. Reporte guardado en: $out" -ForegroundColor Green
