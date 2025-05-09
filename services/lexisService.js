// services/sftpUnzipService.js
const SftpClient = require("ssh2-sftp-client");
const Seven = require("node-7z");
const { path7za } = require("7zip-bin");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { v4: uuid } = require("uuid");

/**
 * Download the newest ZIP from OUT → temp file
 */
async function downloadLatestZip() {
  const sftp = new SftpClient();
  const remoteDir = process.env.SFTP_REMOTE_DIR || "OUT";
  const tmpDir = os.tmpdir();

  try {
    await sftp.connect({
      host: process.env.SFTP_HOST,
      port: 22,
      username: process.env.SFTP_USER,
      password: process.env.SFTP_SITE_PASSWORD,
    });

    const list = (await sftp.list(remoteDir)).filter((i) => i.type === "-");
    if (!list.length) throw new Error(`No files in ${remoteDir}`);

    const latest = list.reduce((a, b) => (a.modifyTime > b.modifyTime ? a : b));
    const remotePath = path.posix.join(remoteDir, latest.name);

    const localName = `${uuid()}-${latest.name}`;
    const localPath = path.join(tmpDir, localName);
    await sftp.fastGet(remotePath, localPath);
    return localPath;
  } finally {
    await sftp.end();
  }
}

/**
 * Unzip with password via 7‑Zip → outDir, return array of file paths
 */
async function unzipPassworded(zipPath, outDir, password) {
  fs.mkdirSync(outDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const extractor = Seven.extractFull(zipPath, outDir, {
      $bin: path7za,
      password,
      recursive: true,
    });
    extractor.on("end", () => {
      const files = fs
        .readdirSync(outDir)
        .map((name) => path.join(outDir, name));
      resolve(files);
    });
    extractor.on("error", reject);
  });
}

module.exports = { downloadLatestZip, unzipPassworded };
