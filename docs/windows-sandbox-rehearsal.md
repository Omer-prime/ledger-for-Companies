# OarLinks Windows Sandbox rehearsal — lab only

Run installation commands only **inside the disposable Sandbox**, never on the customer host. The current installer is not accepted for client use. Automatic release application stays disabled.

## Build workstation: create the handoff

Use a clean Windows x64 checkout of the reviewed PR #6 head and the vendor-verified Node.js 22.23.5 build runtime. With no runtime .env files or customer configuration in that checkout, gather these **Windows x64** files in C:\LabInputs:

| File in C:\LabInputs | Official source |
|---|---|
| node-v22.23.5-x64.msi | [Node.js 22.23.5 release](https://nodejs.org/en/blog/release/v22.23.5/) |
| mongodb-server-9.0-x64.zip | [MongoDB Community Server archive](https://www.mongodb.com/try/download/community-edition/releases/archive): select the exact installed 9.0 patch and Windows x64 ZIP; rename the verified file to this transfer name |
| mongosh-2.14.2-win32-x64.zip | [MongoDB Shell 2.14.2 release](https://github.com/mongodb-js/mongosh/releases/tag/v2.14.2) |
| mongodb-database-tools-windows-x86_64-100.20.1.zip | [MongoDB Database Tools archive](https://www.mongodb.com/try/download/database-tools/releases/archive) |

Record the actual MongoDB 9.0 patch. Version family alone is not proof of exact parity. Verify vendor signatures or checksums independently before recording each approved SHA-256 in approved-sha256.json (JSON object keyed by the four exact filenames above). Do not treat a hash calculated from an unverified download as vendor approval.

    pwsh -NoProfile -File .\scripts\windows\sandbox\New-Handoff.ps1 -Inputs C:\LabInputs -Destination C:\OarLinksTransfer

Transfer **the entire C:\OarLinksTransfer folder**: OarLinks-Lab.wsb, README.md, inputs/ (four dependencies and their approved hash manifest), bundle/ (oarlinks.zip, release.json, release.sig, release-public.pem), and scripts/. Record the printed signing public-key hash separately. The offline lab key is generated in memory and discarded; no signing private key is transferred. No GitHub tokens, production keys, databases or credentials belong in this folder. Keep the absolute host path in the WSB file matched to the actual transfer location. The mapping is read-only, networking disabled, clipboard enabled for evidence.

## Inside Sandbox: prerequisites and MongoDB

After the feature-enablement reboot on the host, double-click OarLinks-Lab.wsb. In the **Sandbox** open elevated Windows PowerShell:

    Set-Location C:\OarLinksLab
    .\scripts\Install-Prerequisites.ps1 -ConfirmDisposableSandbox
    $tools='C:\OarLinksLabTools'
    $mongod=(Get-ChildItem $tools -Recurse -Filter mongod.exe -File).FullName
    $shell=(Get-ChildItem $tools -Recurse -Filter mongosh.exe -File).FullName
    $dump=(Get-ChildItem $tools -Recurse -Filter mongodump.exe -File).FullName
    $restore=(Get-ChildItem $tools -Recurse -Filter mongorestore.exe -File).FullName

The prerequisite script installs the Node MSI in the guest and extracts the other ZIPs there. It verifies all versions. A Node exit 3010 requires an internal restart. Record versions and check that no existing service or listener is being reused. Use only locally generated lab credentials.

Prepare a private guest-only setup directory (administrators and SYSTEM only). Generate a short-lived lab CA and a localhost member certificate with a verified OpenSSL tool on the technician workstation or inside the guest. If generated outside, transfer the lab CA **certificate** and member PEM only in a separately protected lab handoff; never transfer the CA private key. Member PEM must contain the leaf and unencrypted private key, have DNS SAN localhost, and include serverAuth and clientAuth. Use a distinct lab subject organization for membership. Delete the lab private material after rehearsal. The CA is passed to MongoDB in its config; don't add it to Windows browser trust. Create the guest setup file using the actual private paths:

In a new protected working directory on the technician workstation with verified OpenSSL, the lab-only certificate commands are:

    openssl req -x509 -newkey rsa:3072 -nodes -days 3 -subj '/CN=OarLinks Lab CA' -keyout ca.key -out ca.pem
    openssl req -new -newkey rsa:3072 -nodes -subj '/O=OarLinks Disposable Lab/OU=MongoDB/CN=localhost' -keyout member.key -out member.csr
    @('subjectAltName=DNS:localhost','extendedKeyUsage=serverAuth,clientAuth') | Set-Content member.ext -Encoding ascii
    openssl x509 -req -in member.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 3 -extfile member.ext -out member.crt
    Get-Content member.crt,member.key | Set-Content member.pem -Encoding ascii
    openssl verify -CAfile ca.pem member.crt

Inside the guest, place the resulting public CA and member PEM in the protected private directory. Stop if certificate verification fails.

    @{port=37441;replicaSet='oarlinks';memberCertificate='C:\LabPrivate\member.pem';caCertificate='C:\LabPrivate\ca.pem'} |
      ConvertTo-Json | Set-Content C:\LabPrivate\mongo-settings.json
    .\scripts\Prepare-Mongo.ps1 -MongoBin (Split-Path $mongod) -MongoSettings C:\LabPrivate\mongo-settings.json -RegisterService
    Start-Service OarLinksMongo
    & $shell 'mongodb://localhost:37441/?directConnection=true'

In this guest shell, initialize and wait until hello reports isWritablePrimary:true. Use the localhost exception to create the first recovery administrator. passwordPrompt() avoids echoing or storing the password command in history:

    rs.initiate({_id:'oarlinks',members:[{_id:0,host:'localhost:37441'}]})
    db.hello()
    db.getSiblingDB('admin').createUser({user:'lab_recovery',pwd:passwordPrompt(),roles:[{role:'root',db:'admin'}]})

Exit and reconnect with the recovery user through --username lab_recovery --authenticationDatabase admin --password (enter at prompt). Create the isolated app user:

    db.getSiblingDB('oarlinks_sandbox').createUser({user:'lab_app',pwd:passwordPrompt(),roles:[{role:'readWrite',db:'oarlinks_sandbox'}]})

Confirm anonymous reads are denied and the app user can write only its database. Record the service identity, listening address and ACLs without logging secrets. Set only OarLinksMongo automatic after those checks:

    Set-Service OarLinksMongo -StartupType Automatic
    Get-CimInstance Win32_Service -Filter "Name='OarLinksMongo'" | Select-Object Name,StartName,StartMode,State

## Inside Sandbox: app install and acceptance

In the same guest session create app-env.json in the private setup folder. Read the app password at a masked prompt; do not type it into the URI displayed in a command:

    $secret=Read-Host 'Disposable lab_app password' -AsSecureString
    $encoded=[uri]::EscapeDataString([Net.NetworkCredential]::new('', $secret).Password)
    @{MONGODB_DATABASE='oarlinks_sandbox';APP_ORIGIN='https://localhost:37443';MONGODB_URI=('mongodb://lab_app:'+$encoded+'@localhost:37441/?replicaSet=oarlinks&authSource=oarlinks_sandbox')} |
      ConvertTo-Json | Set-Content C:\LabPrivate\app-env.json
    Remove-Variable secret,encoded
    .\scripts\Install.ps1 -Bundle C:\OarLinksLab\bundle -PublicKey C:\OarLinksLab\bundle\release-public.pem -PublicKeySha256 '<separately recorded hash>' -AppEnvironment C:\LabPrivate\app-env.json -Channel staging

Enter a unique lab-only owner password at the installer prompt. Record the SHA-256 of the installer-exported localhost.cer from the protected config folder, then run the following as the intended Sandbox owner:

    .\scripts\Trust-OwnerCertificate.ps1 -Certificate 'C:\ProgramData\OarLinksBusiness\config\localhost.cer' -ExpectedSha256 '<recorded leaf SHA-256>'

If the owner cannot read that path, copy only the public CER into a readable guest folder and verify the fingerprint again. Open **OarLinks Business** from the guest desktop. Expect trusted HTTPS at https://localhost:37443, successful owner login, and version 0.0.1. Do not click through certificate warnings. Confirm POS posting is blocked before lab-only accounting approval.

- **App workflow:** Count a four-suit fixture thaan, 6 m per suit, with a documented fixture carrying value of Rs 2,400. Verify the count and cost. Create six DEMO GL accounts, approve only the lab batch and save the lab approval reference. Sell one suit for Rs 3,000 cash. Expect three suits remaining, Rs 3,000 receipts, balanced sale journal (Rs 3,000 cash/revenue and Rs 600 COGS/inventory), and no Udhar. Print A5/80 mm receipts to PDF and record paper dimensions and contents. PDF evidence is not hardware printing.
- **Restart:** Stop and start the OarLinksBusiness task; verify owner login, inventory and sale persistence. Simulate a child-process failure in the guest and verify scheduled recovery. Then run shutdown.exe /r /t 0 **inside Sandbox**, without closing the window. After return, verify both dedicated services, HTTPS, shortcut and saved data. Windows Sandbox on Windows 11 persists data through an internal restart; closing the Sandbox discards its contents. [Microsoft Sandbox overview](https://learn.microsoft.com/en-us/windows/security/threat-protection/windows-sandbox/windows-sandbox-overview)
- **Backup:** Generate a disposable CMS Document Encryption certificate with private key in the guest recovery account and export the public CER. Record all collection counts and indexes first. Stop and disable OarLinksBusiness, verify its ports are closed and no other writers exist. Run Backup.ps1 with -Destination (a guest lab folder), -RecipientCertificate (the CMS public CER), and -MongoDump $dump. Expect a CMS file and SHA-256 sidecar. Keep the private key separate; do not export it as evidence.
- **Restore:** Inside the guest provision a second authenticated replica set named oarlinks_restore on localhost:37451 with new data and log directories and a separate credential. Use the same Mongo binary/config pattern but a distinct service name, dirs, ACL and port; do not edit OarLinksMongo. Prepare admin-only restore.json containing only uri, using the Restore.ps1 URI contract: mongodb://USER:PASSWORD@localhost:37451/?replicaSet=oarlinks_restore&authSource=admin&directConnection=true. Run:

      .\scripts\Restore.ps1 -Backup C:\LabBackups\SELECTED.cms -RestoreToolConfig C:\LabPrivate\restore.json -TargetDatabase ('oarlinks_restore_'+[guid]::NewGuid().ToString('N')) -MongoShell $shell -MongoRestore $restore

  Compare all business collection counts and index definitions, thaan remaining balance, linked sale/receipt references, customer statement and balanced journals. Never use port 37441 or 27017 as a restore destination.
- **Failure recovery and uninstall:** Before real guest install, use a copy of the bundle with an intentionally wrong expected public-key hash. Expect refusal with no directories, service or task changes from the installer. Repeat with the correct lab bundle. After all acceptance, run .\scripts\Uninstall.ps1 in the guest. Expect only the app task/shortcut and its server certificate to be removed; databases and backup stay. Remove the exact owner trust entry separately. Recheck retained fixture data and verify that no unrelated service was touched.

Copy sanitized evidence **before closing the Sandbox**: command exit codes, executable versions, service state before/after reboot, certificate fingerprint, screenshots, PDF metadata and backup/restore counts. Use clipboard or a separately approved evidence-only transfer; never map customer folders. No private keys, passwords, URI files, or raw financial databases in the evidence. If any check fails, capture the precise step and stop. A successful test does not authorize install or stable release publication.
