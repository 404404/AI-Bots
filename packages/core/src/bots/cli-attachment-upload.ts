import {
  constants,
  openSync,
  closeSync,
  fstatSync,
  readSync,
  realpathSync,
  lstatSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { MAX_ATTACHMENT_BYTES } from '../attachments/store.js';
import { ATTACHMENT_FILE_ID_PATTERN } from '../attachments/ref.js';
import { CliLiveError } from './cli-live-error.js';

export function attachmentUploadInput(file: unknown, uploadId: unknown, requireId = false) {
  if (typeof file !== 'string' || !file.trim())
    throw new CliLiveError('usage', 'attachment-upload requires --file <regular-file-path>.');
  if (uploadId === undefined && requireId)
    throw new CliLiveError('usage', 'attachment-upload requires a stable --upload-id <UUID-v4>.');
  const id = uploadId ?? randomUUID();
  if (typeof id !== 'string' || !ATTACHMENT_FILE_ID_PATTERN.test('file:' + id))
    throw new CliLiveError('usage', '--upload-id must be a UUID-v4.');
  const path = resolve(file);
  let fd: number | undefined;
  try {
    if (realpathSync(path) !== path)
      throw new CliLiveError(
        'input-unavailable',
        'Select a canonical regular file without symlinks.',
      );
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(fd);
    const validate = () => {
      const current = lstatSync(path);
      if (
        realpathSync(path) !== path ||
        !current.isFile() ||
        current.dev !== before.dev ||
        current.ino !== before.ino
      )
        throw new CliLiveError('input-changed', 'Selected attachment file is no longer available.');
    };
    if (!before.isFile()) throw new CliLiveError('input-unavailable', 'Select a regular file.');
    validate();
    if (before.size > MAX_ATTACHMENT_BYTES)
      throw new CliLiveError('too-large', 'Attachment exceeds the 25 MiB limit.');
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const chunk = Buffer.alloc(64 * 1024);
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (count === 0) break;
      size += count;
      if (size > MAX_ATTACHMENT_BYTES)
        throw new CliLiveError('too-large', 'Attachment exceeds the 25 MiB limit.');
      chunks.push(chunk.subarray(0, count));
    }
    validate();
    const after = fstatSync(fd);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || size !== before.size)
      throw new CliLiveError('input-changed', 'Selected file changed during transfer preparation.');
    const bytes = Buffer.concat(chunks);
    return {
      name: basename(path),
      uploadId: id,
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  } catch (error) {
    if (error instanceof CliLiveError) throw error;
    throw new CliLiveError('input-unavailable', 'Cannot read the selected attachment file.');
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
