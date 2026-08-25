import * as fs from 'fs/promises';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { LessonScrim } from '@scrimba-clone/shared';

const gzip = promisify(zlib.gzip);

export class ScrimWriter {
  /**
   * Serializes a LessonScrim object to JSON and gzips it
   * into a .scrim file on disk.
   */
  public static async write(filePath: string, scrim: LessonScrim): Promise<void> {
    const jsonString = JSON.stringify(scrim);
    const compressedData = await gzip(Buffer.from(jsonString, 'utf-8'));
    await fs.writeFile(filePath, compressedData);
  }
}
