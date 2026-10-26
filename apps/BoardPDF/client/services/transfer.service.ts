let transferredFile: File | null = null;

export function consumeTransferFile(): File | null {
  const file = transferredFile;
  transferredFile = null;
  return file;
}

export function getTransferFile(): File | null {
  return transferredFile;
}

export function setTransferFile(file: File | null): void {
  transferredFile = file;
}
