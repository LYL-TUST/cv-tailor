/**
 * 本地加密备份 —— WebCrypto AES-GCM
 *
 * 原理：用户输入的密码经 PBKDF2(高迭代)派生出密钥，数据用 AES-GCM 加密。
 * 密码即钥匙：忘记密码则密文永远无法解密（这正是"端到端"的含义）。
 * 后续做"可选登录云同步"时，同一套加密可在上传前把明文留在本机。
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function fromB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** 加密：输入明文对象，返回 { salt, iv, data }（均 base64） */
export async function encryptData(plainObject, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(plainObject))
  );
  return {
    format: "arb-encrypted-v1",
    salt: toB64(salt.buffer),
    iv: toB64(iv.buffer),
    data: toB64(cipherBuf),
  };
}

/** 解密：输入上一步返回的密文结构与密码，返回明文对象 */
export async function decryptData(payload, passphrase) {
  if (!payload || payload.format !== "arb-encrypted-v1") {
    throw new Error("不是受支持的备份文件");
  }
  const salt = fromB64(payload.salt);
  const iv = fromB64(payload.iv);
  const key = await deriveKey(passphrase, salt);
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      fromB64(payload.data).buffer
    );
    return JSON.parse(decoder.decode(plainBuf));
  } catch {
    throw new Error("解密失败：密码错误或文件已损坏");
  }
}

/** 浏览器端把对象下载为 JSON 文件 */
export function downloadJsonFile(filename, object) {
  const blob = new Blob([JSON.stringify(object, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
