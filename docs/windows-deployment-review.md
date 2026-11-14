# Windows installer engineering review

**Do not install on the customer laptop yet.** This branch supplies an installer and read-only signed release checker for a VM rehearsal. Automatic activation is deliberately disabled. No configuration on the development workstation is changed by checking out this branch.

## Build and approve a release

Run the Windows release candidate workflow by hand on an approved commit. It installs dependencies without lifecycle scripts, checks types and lint, builds on Windows x64, and uploads an unsigned archive and manifest. It cannot publish a release. Confirm dependency and runtime advisories, verify the commit and test evidence, and sign the exact manifest bytes with a protected offline Ed25519 key. Keep the public key fingerprint in the technician's independently verified installation record. Use separate approval and signing procedures for staging and stable; production PCs receive only a public verification key. With separate release authorization, publish the three assets under an immutable tag of the form oarlinks-stable-1.2.3 (or oarlinks-staging-1.2.3 for a prerelease). Do not sign or publish untested artifacts.

From the authorized release workstation, example signing command using an offline key:

    openssl pkeyutl -sign -rawin -inkey X:\secure\release-signing-private.pem -in release.json -out release.sig

The installer and checker verify the exact signed manifest, archive hash, channel, version, Windows x64 platform, data compatibility epoch and Node version. The customer PC requires no Git, repository write token, or GitHub Actions runner. Assets must be available for anonymous HTTPS downloads; private distribution requires an explicitly designed read-only mechanism.

## VM technician installation sequence

1. Obtain an approved Windows 11 x64 VM, approved signed machine-wide Node 22 MSI at the manifest's exact patch level, approved MongoDB server, shell and Database Tools. Verify vendor signatures and hashes, install them via the vendor installers, and put the tool executables in the machine PATH. Leave the VM and its disk separate from all customer hosts and data. Never reuse the development instance.
2. Provision an empty, persistent authenticated MongoDB replica set named oarlinks on localhost:37441. Use separate Network Service database file permissions, a trusted MongoDB member certificate, and no external bind. The following command prepares the dedicated config without starting or registering a service:

       .\scripts\windows\Prepare-Mongo.ps1 -MongoBin 'C:\Approved\MongoDB\bin' -MongoSettings 'C:\SecureSetup\mongo-settings.json'

   The JSON includes port (37441), replicaSet (oarlinks), memberCertificate and caCertificate absolute PEM paths. Review the config and service account with the Windows/database administrator before using vendor native service registration. Initialize ONE member (localhost:37441) before adding users. Use the MongoDB localhost bootstrap exception to create the first recovery administrator, then close that window; create a unique SCRAM application user with readWrite on the one new application database only. The prepared config offers TLS for replication and permits local SCRAM over loopback. Use no sample credentials and no fixture databases. MongoDB VM bootstrap and service registration are manual acceptance gates.
3. In a technician-only directory create app-env.json with MONGODB_DATABASE set to the new oarlinks_ database, MONGODB_URI pointing to the dedicated authenticated replica set, and APP_ORIGIN exactly https://localhost:37443. The accepted URI form is mongodb://USER:PERCENT_ENCODED_PASSWORD@localhost:37441/?replicaSet=oarlinks&authSource=APPLICATION_DB. Protect the file with NTFS ACLs and never paste secrets in a terminal command or transcript.
4. In elevated Windows PowerShell, from the trusted installer source, run:

       .\scripts\windows\Install.ps1 -Bundle 'C:\Approved\Bundle' -PublicKey 'C:\Approved\release-public.pem' -PublicKeySha256 '<independently-verified-sha256>' -AppEnvironment 'C:\SecureSetup\app-env.json' -Channel staging

   Supply the unique owner password at the masked prompt. No accounts are imported. The launcher runs at boot as non-admin Local Service and installs a localhost-only HTTPS certificate and desktop shortcut. The owner opens **OarLinks Business** in their browser and signs in. Shop Setup shows installed version and most recent update status. Its refresh button does not install software. Automatic update checks can be scheduled with:

       .\scripts\windows\Register-Maintenance.ps1 -BackupDestination 'E:\OarLinksBackups' -RecipientCertificate 'C:\SecureSetup\backup-recipient.cer'

   Only use the stable channel after VM acceptance and approval. The launcher uses the built-in Windows shortcut icon; branded artwork and an owner-triggered privileged check are pending. On partial installation, stop and inspect; setup refuses to overwrite existing directories or tasks.
5. Remove the launcher without deleting data using elevated .\scripts\windows\Uninstall.ps1. This unregisters the application and maintenance tasks, removes the matching shortcut and certificate, and retains database and application files. Remove MongoDB separately only under an approved decommission plan.

## Backups and recovery

Use a CMS document-encryption certificate for backup; keep its private key and recovery credentials offline and escrow them separately from the laptop. Test that a recovery administrator can decrypt on a replacement VM. Use a separately protected drive and copy encrypted files and hashes off-device. The backup utility checks the encrypted copy hash; verified recovery requires decryption and restore. Run backups during a verified quiet window while posting is stopped for a consistent snapshot across collections; the nightly task alone does not freeze the application. CMS is memory-bound and needs capacity acceptance on representative data. Retain a daily copy for 14 days and weekly copies for 8 weeks, with a separately protected pre-upgrade copy; review disk space and rotate only after verifying a newer recoverable copy.

On a recovery VM prepare a distinct authenticated oarlinks_restore replica set on localhost:37451, with an isolated restore credential. Put the credential URI in a protected tool config JSON. To restore into a new disposable namespace:

    .\scripts\windows\Restore.ps1 -Backup 'E:\OarLinksBackups\selected.cms' -RestoreToolConfig 'C:\SecureSetup\restore.json' -TargetDatabase ('oarlinks_restore_'+[guid]::NewGuid().ToString('N'))

Check collection counts and indexes, compare available stock and sale totals, and verify all journal debits equal credits before reopening. Never restore over an existing database. Never use a DB restore as app downgrade automation. Approved release activation, graceful draining, interruption recovery, compatibility and application rollback must be proven in a VM before adding unattended activation.

## Print and acceptance

Install the actual vendor drivers. Select A4/A5, 80 mm receipt stock or 50 × 30 mm labels; use Actual Size and turn off browser headers and footers. Print an approved test receipt and sticker in the VM workflow; inspect cuts and margins and decode several barcodes with the physical scanner. No silent print support is claimed. Chromium PDF evidence is not hardware acceptance.

Before authorizing any client install require clean VM installation, HTTPS login and ACL review, full reboot and forced process failure recovery, data persistence, full encrypted restore, channel verification, update interruption and rollback rehearsal, real printer/scanner checks and accounting approval. No deployment or release publication is part of this PR.

References: [MongoDB replica-set access control](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set-with-keyfile-access-control/), [MongoDB localhost exception](https://www.mongodb.com/docs/manual/core/localhost-exception/), [Windows scheduled task principals](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal).

## Executed checks

- Windows Node 22.19.0: production build exit 0 (48 routes), TypeScript exit 0, ESLint exit 0 with one existing Reports warning after the mongosh import annotation.
- The existing 19 tests passed (checkout 1/1, POS 1/1, HTTP/unit 16/16, HTTPS Chromium 1/1) on the fresh win1114 disposable replica-set namespaces. This Chromium run exercises the application PDF flows, not the Windows host installer.
- The release verifier tests passed 2/2. PowerShell syntax parsing and Node syntax checks passed. These checks do not execute installation, backup, restore, or scheduled jobs on a fresh VM.
