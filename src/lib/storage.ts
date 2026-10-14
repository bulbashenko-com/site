import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// S3-compatible object storage (Garage in the cluster, namespace data). Objects are served publicly
// from MEDIA_PUBLIC_URL (the bucket's website endpoint, e.g. https://media.bulbashenko.com).
let client: S3Client | undefined;

function getClient(): S3Client {
  client ??= new S3Client({
    region: process.env.S3_REGION ?? "garage",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  return client;
}

export function isStorageConfigured(): boolean {
  return Boolean(process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.MEDIA_PUBLIC_URL);
}

export async function putPublic(key: string, body: Uint8Array, contentType: string): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return `${process.env.MEDIA_PUBLIC_URL}/${key}`;
}
