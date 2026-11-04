# Servidor de VerifyPerson y CertifAIPerson (Ionos)

- Sitios: https://verifyperson.mx y https://certifaiperson.com
- Servidor: Ionos, IP 62.151.183.215 (los dos sitios están en el mismo servidor)
- Tecnología: Windows Server + IIS 10, C# ASP.NET MVC 5 (.NET Framework 4.x); base de datos probablemente SQL Server

## inventario.ps1

Script de **solo lectura** que hace un inventario del servidor: sitios de IIS, carpetas,
si hay código fuente o solo DLL compiladas, conexiones a base de datos (con contraseñas
ocultas), bases de SQL Server y sus últimos respaldos, tareas programadas, servicios,
certificados, usuarios administradores y programas instalados.

Uso (en el servidor, PowerShell como administrador):

```
powershell -ExecutionPolicy Bypass -File .\inventario.ps1
```

Genera `inventario-servidor.txt` en el Escritorio.
