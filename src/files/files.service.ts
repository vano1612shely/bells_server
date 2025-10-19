// src/files/files.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { getUploadsDir } from './multer.util';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  uploadPath = getUploadsDir();

  buildFileUrl(relativePath: string) {
    // relativePath наприклад 'categories/abc.png'
    return `/uploads/${relativePath.replace(/\\/g, '/')}`;
  }

  async removeFile(relativePath: string) {
    try {
      const full = path.join(this.uploadPath, relativePath);
      if (fs.existsSync(full)) {
        await fs.promises.unlink(full);
      }
    } catch (e) {
      this.logger.warn(`Could not remove file ${relativePath}: ${e}`);
    }
  }
}
