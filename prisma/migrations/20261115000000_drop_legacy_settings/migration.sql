-- The local admin sign-in (password hash, encrypted TOTP secret, recovery-code hashes) was replaced by the SSO in
-- c6dbe41; its model left schema.prisma then, but `prisma db push` never dropped the table. Dead credential
-- material, read by nothing: drop it. Databases created from 0_init never had it.
DROP TABLE IF EXISTS "Settings";
