import Cropper from "https://unpkg.com/cropperjs@1.6.2/dist/cropper.esm.js";

import {
  ditherImage,
  getDeviceColors,
  replaceColors,
  aitjcizeSpectra6Palette,
} from "https://cdn.jsdelivr.net/npm/epdoptimize/+esm";

const fileInput = document.getElementById("fileInput");
const imageToCrop = document.getElementById("imageToCrop");
const outputCanvas = document.getElementById("outputCanvas");
const deviceCanvas = document.getElementById("deviceCanvas");
const uploadBtn = document.getElementById("uploadBtn");

const downloadBtn = document.getElementById("downloadBtn");

const rotateRightBtn = document.getElementById("rotateRightBtn");
const editImageBtn = document.getElementById("editImageBtn");
const controlsPanel = document.getElementById("controlsPanel");
const adjustmentControls = document.getElementById("adjustmentControls");

const progressText = document.getElementById("progressText");

const config = {
  "palette": "aitjcizeSpectra6Palette",
  "imageAdjustmentOptions": {
    "toneMapping": {
      "exposure": 0,
      "saturation": 0.05,
      "contrast": 0,
      "strength": 0,
      "shadowBoost": 0,
      "highlightCompress": 0,
      "midpoint": 0.5
    },
    "dynamicRangeCompression": {
      "mode": "display",
      "strength": 0.85,
      "lowPercentile": 0.01,
      "highPercentile": 0.99
    }
  },
  "canvasDitherOptions": {
    "serpentine": true,
    "errorDiffusionMatrix": "stucki"
  }
};

let cropper = null;
let previewTimer = null;
let uploadedFiles = [];

function schedulePreviewRefresh() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    void prepareDeviceCanvas();
  }, 150);
}

function getNestedValue(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function setNestedValue(source, path, value) {
  const keys = path.split(".");
  const lastKey = keys.pop();
  const current = keys.reduce((value, key) => value[key], source);
  current[lastKey] = value;
}

function formatSliderValue(path, value) {
  if (path.includes("Percentile")) return value.toFixed(3);
  if (path.includes("exposure") || path.includes("saturation") || path.includes("contrast") || path.includes("strength") || path.includes("shadowBoost") || path.includes("highlightCompress") || path.includes("midpoint")) {
    return value.toFixed(2);
  }
  return String(value);
}

const sliderDefinitions = [
  { path: "toneMapping.exposure", label: "Exposure", min: -2, max: 2, step: 0.01 },
  { path: "toneMapping.saturation", label: "Saturation", min: -1, max: 1, step: 0.01 },
  { path: "toneMapping.contrast", label: "Contrast", min: -1, max: 1, step: 0.01 },
  { path: "toneMapping.strength", label: "Tone Strength", min: 0, max: 1, step: 0.01 },
  { path: "toneMapping.shadowBoost", label: "Shadow Boost", min: 0, max: 1, step: 0.01 },
  { path: "toneMapping.highlightCompress", label: "Highlight Compress", min: -2, max: 2, step: 0.01 },
  { path: "toneMapping.midpoint", label: "Midpoint", min: 0, max: 1, step: 0.01 },
  { path: "dynamicRangeCompression.strength", label: "Range Strength", min: 0, max: 1, step: 0.01 },
  { path: "dynamicRangeCompression.lowPercentile", label: "Low Percentile", min: 0, max: 0.1, step: 0.001 },
  { path: "dynamicRangeCompression.highPercentile", label: "High Percentile", min: 0.9, max: 1, step: 0.001 },
];

function createAdjustmentControls() {
  if (!adjustmentControls) return;

  adjustmentControls.innerHTML = "";

  sliderDefinitions.forEach((definition) => {
    const card = document.createElement("div");
    card.className = "slider-card";

    const value = getNestedValue(config.imageAdjustmentOptions, definition.path);

    card.innerHTML = `
      <div class="slider-header">
        <label class="slider-label" for="slider-${definition.path}">${definition.label}</label>
        <span id="value-${definition.path}" class="slider-value">${formatSliderValue(definition.path, value)}</span>
      </div>
      <input id="slider-${definition.path}" type="range" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${value}" />
    `;

    const input = card.querySelector("input");
    const valueLabel = card.querySelector(".slider-value");

    input.addEventListener("input", (event) => {
      const nextValue = Number(event.target.value);
      setNestedValue(config.imageAdjustmentOptions, definition.path, nextValue);
      valueLabel.textContent = formatSliderValue(definition.path, nextValue);
      schedulePreviewRefresh();
    });

    adjustmentControls.appendChild(card);
  });
}

// ----------------------------
// Load image into Cropper
// ----------------------------
const fileNameDisplay = document.getElementById("fileName");

createAdjustmentControls();

if (editImageBtn && controlsPanel) {
  editImageBtn.addEventListener("click", () => {
    controlsPanel.classList.toggle("is-hidden");
    editImageBtn.textContent = controlsPanel.classList.contains("is-hidden")
      ? "Edit Image"
      : "Hide Controls";
  });
}

fileInput.addEventListener("change", () => {
  uploadedFiles = Array.from(fileInput.files);

  if (uploadedFiles.length === 0) {
    document.body.classList.remove("has-image");
    imageToCrop.src = "";
    fileNameDisplay.textContent = "No file chosen";
    return;
  }

  fileNameDisplay.textContent =
    uploadedFiles.length === 1
      ? uploadedFiles[0].name
      : `${uploadedFiles.length} files selected`;

  const reader = new FileReader();

  reader.onload = e => {
    imageToCrop.src = e.target.result;
    document.body.classList.add("has-image");
  };

  reader.readAsDataURL(uploadedFiles[0]);
});

// ----------------------------
// Initialize Cropper with LIVE preview
// ----------------------------
imageToCrop.onload = () => {
  if (cropper) cropper.destroy();

  cropper = new Cropper(imageToCrop, {
    aspectRatio: 3 / 4,
    viewMode: 0,
    autoCropArea: 1,
    responsive: true,
    background: false,
    preview: ".img-preview",
    ready: schedulePreviewRefresh,
    cropend: schedulePreviewRefresh,
    zoom: schedulePreviewRefresh,
  });
};

// ----------------------------
// Generate 1200x1600 canvas internally when dithering
// ----------------------------
function getCropped1200x1600Canvas() {
  if (!cropper) return null;

  return cropper.getCroppedCanvas({
    width: 1200,
    height: 1600,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high"
  });
}

// ----------------------------
// Prepare device canvas by cropping & dithering
// ----------------------------
async function prepareDeviceCanvas() {
  const croppedCanvas = getCropped1200x1600Canvas();
  if (!croppedCanvas) return false;

  const previewOptions = {
    palette: aitjcizeSpectra6Palette,
    ditheringType: "errorDiffusion",
    errorDiffusionMatrix: config.canvasDitherOptions.errorDiffusionMatrix || "stucki",
    serpentine: config.canvasDitherOptions.serpentine ?? true,
    ...config.imageAdjustmentOptions,
  };

  await ditherImage(croppedCanvas, outputCanvas, previewOptions);

  replaceColors(outputCanvas, deviceCanvas, aitjcizeSpectra6Palette);

    /*replaceColors(outputCanvas, deviceCanvas, {
    originalColors: aitjcizeSpectra6Palette,//palette: myPalette
    replaceColors: deviceColors
  });*/

  return true;
}

// ----------------------------
// Batch processing helper
// ----------------------------
async function processImageFile(file, cropTemplate) {
  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onload = e => {

      const img = new Image();

      img.onload = async () => {

        const cropCanvas =
          document.createElement("canvas");

        cropCanvas.width = 1200;
        cropCanvas.height = 1600;

        const cropCtx =
          cropCanvas.getContext("2d");

        cropCtx.drawImage(
          img,
          cropTemplate.x,
          cropTemplate.y,
          cropTemplate.width,
          cropTemplate.height,
          0,
          0,
          1200,
          1600
        );

        const ditherCanvas =
          document.createElement("canvas");

        ditherCanvas.width = 1200;
        ditherCanvas.height = 1600;

        await ditherImage(
          cropCanvas,
          ditherCanvas,
          {
            palette: aitjcizeSpectra6Palette,
            ditheringType: "errorDiffusion",
            errorDiffusionMatrix:
              config.canvasDitherOptions.errorDiffusionMatrix,
            serpentine:
              config.canvasDitherOptions.serpentine ?? true,
            ...config.imageAdjustmentOptions
          }
        );

        const deviceCanvas =
          document.createElement("canvas");

        deviceCanvas.width = 1200;
        deviceCanvas.height = 1600;

        replaceColors(
          ditherCanvas,
          deviceCanvas,
          aitjcizeSpectra6Palette
        );

        resolve(deviceCanvas);
      };

      img.onerror = reject;
      img.src = e.target.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ----------------------------
// BMP Export
// ----------------------------
function canvasToBMP(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
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
// Upload
// ----------------------------
rotateRightBtn.addEventListener("click", () => {
  // rotate the underlying image data 90 degrees clockwise so cropping uses portrait orientation
  if (!imageToCrop.src) return;

  const img = new Image();
  img.onload = () => {
    const { naturalWidth: w, naturalHeight: h } = img;
    const canvas = document.createElement("canvas");
    canvas.width = h;
    canvas.height = w;
    const ctx = canvas.getContext("2d");

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2);

    imageToCrop.src = canvas.toDataURL();
  };
  img.src = imageToCrop.src;
});

uploadBtn.textContent = "Download All BMPs";

uploadBtn.addEventListener("click", async () => {
  if (!cropper) {
    alert("Please select and crop an image first.");
    return;
  }

  uploadBtn.disabled = true;
  uploadBtn.textContent = "Uploading...";

  try {
    await prepareDeviceCanvas();

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
      throw new Error("Upload failed");
    }

    alert("Image uploaded!");

  } catch (err) {
    console.error(err);
    alert("Upload failed");
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Upload To Frame";
  }
});

downloadBtn.addEventListener("click", async () => {
  if (!cropper || uploadedFiles.length === 0) {
    alert("Please select images first.");
    return;
  }

  const cropTemplate = cropper.getData(true);
  const zip = new JSZip();

  downloadBtn.disabled = true;
  downloadBtn.textContent = "Processing...";

  try {
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];

      const processedCanvas = await processImageFile(
        file,
        cropTemplate
      );

      const bmpBlob = canvasToBMP(processedCanvas);

      const filename = file.name.replace(/\.[^/.]+$/, "");
      zip.file(`${filename}.bmp`, bmpBlob);

      downloadBtn.textContent = `Processing ${i + 1}/${uploadedFiles.length}`;
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(zipBlob);
    link.download = "processed-images.zip";
    link.click();

    URL.revokeObjectURL(link.href);

  } catch (err) {
    console.error(err);
    alert("An error occurred while processing images.");
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = "Download All BMPs";
  }
});