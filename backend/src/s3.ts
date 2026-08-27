import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin'
  },
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  forcePathStyle: true, // Needed for MinIO / localstack
});

const bucketName = process.env.AWS_S3_BUCKET || 'scrimba';

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

export { s3Client };
