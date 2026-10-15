/**
 * File Validation Utility
 *
 * Validates file size and type for attachment uploads.
 * Allowed types: JPG, JPEG, PNG, GIF, PDF, DOC, DOCX, XLS, XLSX, ZIP
 * Max file size: 5MB
 */

export const ALLOWED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.zip',
] as const;

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
] as const;

export const MAX_FILE_SIZE_MB = 5;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024; // 5MB in bytes

export const ALLOWED_EXTENSIONS_DISPLAY = 'JPG, JPEG, PNG, GIF, PDF, DOC, DOCX, XLS, XLSX, ZIP';

export const ACCEPT_STRING = ALLOWED_EXTENSIONS.join(',');

export interface FileValidationResult {
  valid: boolean;
  error: string | null;
}

/**
 * Validates a single file against size and type restrictions.
 *
 * @param file - The File object to validate
 * @returns FileValidationResult with valid flag and error message if invalid
 */
export function validateFile(file: File): FileValidationResult {
  // Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File "${file.name}" is ${fileSizeMB}MB which exceeds the maximum allowed size of ${MAX_FILE_SIZE_MB}MB. Please choose a smaller file.`,
    };
  }

  // Check file extension
  const fileName = file.name.toLowerCase();
  const fileExtension = '.' + fileName.split('.').pop();
  const hasValidExtension = ALLOWED_EXTENSIONS.some(ext => fileExtension === ext);

  if (!hasValidExtension) {
    return {
      valid: false,
      error: `File "${file.name}" has an unsupported file type. Allowed types are: ${ALLOWED_EXTENSIONS_DISPLAY}. If attaching an Outlook message (.msg), please zip it first.`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Validates multiple files against size and type restrictions.
 *
 * @param files - Array of File objects to validate
 * @returns FileValidationResult with combined error messages if any files are invalid
 */
export function validateFiles(files: File[]): FileValidationResult {
  const errors: string[] = [];

  for (const file of files) {
    const result = validateFile(file);
    if (!result.valid && result.error) {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      error: errors.join('\n'),
    };
  }

  return { valid: true, error: null };
}