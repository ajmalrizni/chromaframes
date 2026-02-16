import {
  ditherImage,
  getDeviceColors,
  replaceColors
} from "https://cdn.jsdelivr.net/npm/epdoptimize/+esm";

const fileInput = document.getElementById("fileInput");
const imageToCrop = document.getElementById("imageToCrop");
const cropCanvas = document.getElementById("cropCanvas");
const outputCanvas = document.getElementById("outputCanvas");
const deviceCanvas = document.getElementById("deviceCanvas");
const ditherBtn = document.getElementById("ditherBtn");
const uploadBtn = document.getElementById("uploadBtn");
const applyCropBtn = document.getElementById("applyCropBtn");

let cropper = null;

// ----------------------------
// Load image into Cropper.js
// ----------------------------
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    imageToCrop.src = e.target.result;

    if (cropper) {
      cropper.destroy();
    }

    cropper = new Cropper(imageToCrop, {
      aspectRatio: 3 / 4,   // 🔒 LOCKED 3:4 ratio
      viewMode: 1,
      autoCropArea: 1,
      responsive: true
    });
  };

  reader.readAsDataURL(file);
});

// ----------------------------
// Apply crop → render EXACT 1200x1600
// ----------------------------
applyCropBtn.addEventListener("click", () => {
  if (!cropper) return;

  const croppedCanvas = cropper.getCroppedCanvas({
    width: 1200,
    height: 1600,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high"
  });

  const ctx = cropCanvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, 1200, 1600);
  ctx.drawImage(croppedCanvas, 0, 0);
});

// ----------------------------
// Dither EXACTLY like demo
// ----------------------------
ditherBtn.addEventListener("click", () => {
  const myPalette = [
    "#191E21",
    "#e8e8e8",
    "#2157ba",
    "#125f20",
    "#b21318",
    "#efde44"
  ];

  const deviceColors = getDeviceColors("spectra6");

  // 1️⃣ Dither
  ditherImage(cropCanvas, outputCanvas, {
    algorithm: "floydSteinberg",
    palette: myPalette
  });

  // 2️⃣ Replace perceptual → device colors
  replaceColors(outputCanvas, deviceCanvas, {
    originalColors: myPalette,
    replaceColors: deviceColors
  });
});

// ----------------------------
// Canvas → 24-bit BMP
// ----------------------------
function canvasToBMP(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const rowSize = Math.ceil((24 * width) / 32) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;

  const buffer = new ArrayBuffer(fileSize);
  const dv = new DataView(buffer);
  let p = 0;

  const u16 = v => { dv.setUint16(p, v, true); p += 2; };
  const u32 = v => { dv.setUint32(p, v, true); p += 4; };

  dv.setUint8(p++, 0x42);
  dv.setUint8(p++, 0x4D);
  u32(fileSize);
  u32(0);
  u32(54);

  u32(40);
  u32(width);
  u32(height);
  u16(1);
  u16(24);
  u32(0);
  u32(pixelDataSize);
  u32(2835);
  u32(2835);
  u32(0);
  u32(0);

  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      dv.setUint8(p++, data[i + 2]);
      dv.setUint8(p++, data[i + 1]);
      dv.setUint8(p++, data[i]);
    }
    p += rowSize - width * 3;
  }

  return new Blob([buffer], { type: "image/bmp" });
}

// ----------------------------
// Upload DEVICE COLORS BMP
// ----------------------------
uploadBtn.addEventListener("click", async () => {
  const bmpBlob = canvasToBMP(deviceCanvas);

  const UPLOAD_ENDPOINT =
    "https://dakkqppdipyhvam5k7hzyowupi0huiow.lambda-url.eu-north-1.on.aws/";

  const res = await fetch(UPLOAD_ENDPOINT);
  const { uploadUrl } = await res.json();

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/bmp" },
    body: bmpBlob
  });

  if (!put.ok) {
    alert("Upload failed");
    return;
  }

  alert("Device-accurate BMP UPLOADED!");
});