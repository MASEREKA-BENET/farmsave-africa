import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
const missing = ["DATABASE_URL", "DIRECT_URL", "AUTH_SECRET", "AUTH_URL"].filter(name => !process.env[name]);
if (missing.length || (process.env.AUTH_SECRET?.length ?? 0) < 32) {
  console.error("Neon/Auth.js setup is incomplete. Configure these server-only values in .env.local:");
  for (const name of new Set([...missing, ...((process.env.AUTH_SECRET?.length ?? 0) < 32 ? ["AUTH_SECRET (at least 32 random characters)"] : [])])) console.error(`- ${name}`);
  console.error("See docs/NEON_SETUP.md. Legacy provider variables are not used by this application.");
  process.exitCode = 1;
} else {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, max: 1 }) });
  try {
    const counts = [await db.countries.count(), await db.districts.count(), await db.crops.count()];
    if (counts.some(count => count === 0)) throw new Error("Reference catalogue is empty. Apply the reference seed, or finish a verified data import.");
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE farmsave_anonymous");
      await tx.$queryRaw`SELECT set_config('farmsave.user_id','',true)`;
      await tx.$queryRaw`SELECT public.public_impact()`;
    });
    let denied = false;
    try { await db.$transaction(async tx => { await tx.$executeRawUnsafe("SET LOCAL ROLE farmsave_anonymous"); await tx.profiles.findMany({ take: 1 }); }); } catch { denied = true; }
    if (!denied) throw new Error("Anonymous private-profile access was not denied. Review grants and RLS before continuing.");
    console.info("PASS Prisma database connection, reference catalogue, public reporting and anonymous private-record denial.");
    console.info(process.env.RESEND_API_KEY && process.env.EMAIL_FROM ? "CONFIGURED verification/recovery email provider; actual delivery still needs testing." : "MISSING RESEND_API_KEY / EMAIL_FROM for verification and recovery delivery.");
    const storageKeys = ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
    if (storageKeys.every(key => process.env[key])) {
      const client = new S3Client({ region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true", credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } });
      await client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }));
      console.info("PASS private storage bucket is reachable. Verify bucket privacy, browser CORS, upload and download separately.");
    } else console.info("MISSING private S3 storage configuration; document/image upload is unavailable until configured.");
  } catch { console.error("Connection checks failed. Verify Neon URLs, applied migrations, reference data, RLS runtime-role membership and any configured bucket permissions. Credentials were not logged."); process.exitCode = 1; }
  finally { await db.$disconnect(); }
}
