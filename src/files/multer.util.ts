import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export function getUploadsDir() {
  return path.join(process.cwd(), 'uploads');
}

/**
 * Створює multer storage для підпапки: uploads/<subfolder>
 * Використовувати в декораторах FileInterceptor / FileFieldsInterceptor
 */
export function makeMulterStorage(subfolder = '') {
  const uploadsRoot = getUploadsDir();
  const dest = path.join(uploadsRoot, subfolder || '');
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  return diskStorage({
    destination: dest,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, uuidv4() + ext);
    },
  });
}

/**
 * Отримує відносний шлях до uploads з абсолютного шляху файлу,
 * наприклад:
 *  pathRelativeToUploads("/.../project/uploads/categories/av.png") => "categories/av.png"
 */
export function pathRelativeToUploads(fullFilePath: string) {
  const uploadsRoot = getUploadsDir();
  const rel = path.relative(uploadsRoot, fullFilePath);
  // нормалізуємо на прямі слеші для URL
  return rel.replace(/\\/g, '/');
}
