// Vault save ala nfsu2.xyz: export data emulator, enkripsi dengan passphrase
// (PBKDF2 + AES-GCM 256 via Web Crypto), unduh sebagai satu file .vault.
// Pulihkan: dekripsi lalu importData kembali ke emulator.

const cheerpjWebRoot = "/app" + location.pathname.replace(/\/[^/]*$/, "");
const statusEl = document.getElementById("status");

let launcherUtilPromise = null;

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind || "";
}

async function getLauncherUtil() {
  if (!launcherUtilPromise) {
    launcherUtilPromise = (async () => {
      setStatus("Menyiapkan emulator (memuat CheerpJ)...");
      await cheerpjInit({ enableDebug: false });
      const lib = await cheerpjRunLibrary(cheerpjWebRoot + "/freej2me-web.jar");
      return await lib.pl.zb3.freej2me.launcher.LauncherUtil;
    })();
  }
  return launcherUtilPromise;
}

function b64encode(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64decode(text) {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function doBackup() {
  const pass = document.getElementById("backup-pass").value;
  if (pass.length < 6) {
    setStatus("Passphrase minimal 6 karakter.", "err");
    return;
  }
  const btn = document.getElementById("backup-btn");
  btn.disabled = true;
  try {
    const launcherUtil = await getLauncherUtil();
    setStatus("Mengumpulkan data save...");
    const exported = await launcherUtil.exportData();
    const plain = exported instanceof Uint8Array
      ? exported
      : new Uint8Array(exported.buffer || exported);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pass, salt);
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain)
    );

    const vault = {
      format: "javaplay-vault",
      version: 1,
      created: new Date().toISOString(),
      salt: b64encode(salt),
      iv: b64encode(iv),
      data: b64encode(cipher),
    };
    const blob = new Blob([JSON.stringify(vault)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gamejava-save.vault";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setStatus("File vault terunduh. Simpan file dan passphrase-nya baik-baik.", "ok");
  } catch (e) {
    console.error(e);
    setStatus("Backup gagal: " + (e && e.message ? e.message : e), "err");
  } finally {
    btn.disabled = false;
  }
}

async function doRestore() {
  const fileInput = document.getElementById("restore-file");
  const pass = document.getElementById("restore-pass").value;
  if (!fileInput.files || !fileInput.files[0]) {
    setStatus("Pilih file vault dulu.", "err");
    return;
  }
  if (!pass) {
    setStatus("Isi passphrase file vault.", "err");
    return;
  }
  const btn = document.getElementById("restore-btn");
  btn.disabled = true;
  try {
    const text = await fileInput.files[0].text();
    const vault = JSON.parse(text);
    if (vault.format !== "javaplay-vault") {
      throw new Error("Ini bukan file vault Game Java.");
    }
    const key = await deriveKey(pass, b64decode(vault.salt));
    let plain;
    try {
      plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64decode(vault.iv) },
        key,
        b64decode(vault.data)
      );
    } catch (decErr) {
      throw new Error("Passphrase salah atau file vault rusak.");
    }
    const launcherUtil = await getLauncherUtil();
    setStatus("Memulihkan data save...");
    await launcherUtil.importData(new Int8Array(plain));
    setStatus("Save berhasil dipulihkan. Silakan kembali ke koleksi dan main.", "ok");
  } catch (e) {
    console.error(e);
    setStatus("Pulihkan gagal: " + (e && e.message ? e.message : e), "err");
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("backup-btn").addEventListener("click", doBackup);
document.getElementById("restore-btn").addEventListener("click", doRestore);
