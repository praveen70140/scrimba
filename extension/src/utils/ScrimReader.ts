import * as fs from 'fs/promises';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { LessonScrimSchema, LessonScrim } from '@scrimba-clone/shared';

const gunzip = promisify(zlib.gunzip);

export class ScrimReader {
  /**
   * Reads and parses a .scrim file (gzip-compressed JSON)
   * into a fully validated LessonScrim object.
   */
  public static async read(filePath: string): Promise<LessonScrim> {
    const compressedData = await fs.readFile(filePath);
    const jsonData = await gunzip(compressedData);
    const parsed = JSON.parse(jsonData.toString('utf-8'));
    
    // Type-safe validation using our shared schema
    return LessonScrimSchema.parse(parsed);
  }
}
