import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin'
  },
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  forcePathStyle: true, // Needed for MinIO / localstack
});

const bucketName = process.env.S3_BUCKET || 'scrimba';

export async function getPresignedPutUrl(key: string, contentType: string, expiresIn = 3600): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function getPresignedGetUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

import { CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

export async function initS3() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`[S3] Bucket ${bucketName} exists.`);
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      console.log(`[S3] Creating bucket ${bucketName}...`);
      try {
        await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
        console.log(`[S3] Bucket ${bucketName} created.`);
      } catch (createErr) {
        console.error(`[S3] Failed to create bucket:`, createErr);
      }
    } else {
      console.error(`[S3] Error checking bucket:`, err);
    }
  }
}

export { s3Client };
