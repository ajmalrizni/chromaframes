import {
  ditherImage,
  getDeviceColors,
  replaceColors
} from "https://cdn.jsdelivr.net/npm/epdoptimize/+esm";

const fileInput = document.getElementById("fileInput");
const rotateBtn = document.getElementById("rotateBtn");
const cropCanvas = document.getElementById("cropCanvas");
const outputCanvas = document.getElementById("outputCanvas");
const deviceCanvas = document.getElementById("deviceCanvas");
const ditherBtn = document.getElementById("ditherBtn");
const uploadBtn = document.getElementById("uploadBtn");

const ctx = cropCanvas.getContext("2d", { willReadFrequently: true });

const ASPECT = 1200 / 1600;
const HANDLE = 12;
const MIN_SIZE = 80;

let img = null;
let rotation = 0;

let draw = { x: 0, y: 0, w: 0, h: 0, scale: 1 };
let crop = { x: 0, y: 0, w: 0, h: 0 };

let mode = null;
let activeCorner = null;
let dragOffset = null;


// Load / rotate
fileInput.addEventListener("change", () => {
  if (!fileInput.files[0]) return;
  img = new Image();
  img.onload = () => {
    rotation = 0;
    fitImage();
  };
  img.src = URL.createObjectURL(fileInput.files[0]);
});

rotateBtn.addEventListener("click", () => {
  if (!img) return;
  rotation = (rotation + 90) % 360;
  fitImage();
});

// Fit image
function fitImage() {
  const iw = rotation % 180 === 0 ? img.width : img.height;
  const ih = rotation % 180 === 0 ? img.height : img.width;

  const scale = Math.min(
    cropCanvas.width / iw,
    cropCanvas.height / ih
  );

  draw.w = iw * scale;
  draw.h = ih * scale;
  draw.x = (cropCanvas.width - draw.w) / 2;
  draw.y = (cropCanvas.height - draw.h) / 2;
  draw.scale = scale;

  if (draw.w / draw.h > ASPECT) {
    crop.h = draw.h;
    crop.w = crop.h * ASPECT;
  } else {
    crop.w = draw.w;
    crop.h = crop.w / ASPECT;
  }

  crop.x = draw.x + (draw.w - crop.w) / 2;
  crop.y = draw.y + (draw.h - crop.h) / 2;

  render();
}

// Render
function render() {
  ctx.clearRect(0, 0, 1200, 1600);

  // Image
  ctx.save();
  ctx.translate(draw.x + draw.w / 2, draw.y + draw.h / 2);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.drawImage(
    img,
    -img.width / 2 * draw.scale,
    -img.height / 2 * draw.scale,
    img.width * draw.scale,
    img.height * draw.scale
  );
  ctx.restore();

  // Image border (visibility aid)
  ctx.strokeStyle = "#00ffd0";
  ctx.lineWidth = 1;
  ctx.strokeRect(draw.x, draw.y, draw.w, draw.h);

  // Mask
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.rect(0, 0, 1200, 1600);
  ctx.rect(crop.x, crop.y, crop.w, crop.h);
  ctx.fill("evenodd");

  // Crop
  ctx.strokeStyle = "#00ffd0";
  ctx.lineWidth = 2;
  ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);

  drawHandles();
}

function drawHandles() {
  ctx.fillStyle = "#00ffd0";
  getCorners().forEach(([x, y]) => {
    ctx.fillRect(x - HANDLE, y - HANDLE, HANDLE * 2, HANDLE * 2);
  });
}

// Geometry helpers
function getCorners() {
  return [
    [crop.x, crop.y, "tl"],
    [crop.x + crop.w, crop.y, "tr"],
    [crop.x, crop.y + crop.h, "bl"],
    [crop.x + crop.w, crop.y + crop.h, "br"]
  ];
}

function canvasPoint(e) {
  const r = cropCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (cropCanvas.width / r.width),
    y: (e.clientY - r.top) * (cropCanvas.height / r.height)
  };
}

function hitCorner(x, y) {
  return getCorners().find(
    ([cx, cy]) =>
      Math.abs(x - cx) < HANDLE * 1.5 &&
      Math.abs(y - cy) < HANDLE * 1.5
  );
}

// Cursor feedback
function updateCursor(p) {
  const corner = hitCorner(p.x, p.y);
  if (corner) {
    cropCanvas.style.cursor =
      corner[2] === "tl" || corner[2] === "br"
        ? "nwse-resize"
        : "nesw-resize";
    return;
  }

  if (
    p.x >= crop.x && p.x <= crop.x + crop.w &&
    p.y >= crop.y && p.y <= crop.y + crop.h
  ) {
    cropCanvas.style.cursor = "move";
  } else {
    cropCanvas.style.cursor = "default";
  }
}

// Pointer + mouse interaction
function onPointerDown(e) {
  const p = canvasPoint(e);
  const corner = hitCorner(p.x, p.y);

  cropCanvas.setPointerCapture(e.pointerId);

  if (corner) {
    mode = "resize";
    activeCorner = corner[2];
  } else if (
    p.x >= crop.x && p.x <= crop.x + crop.w &&
    p.y >= crop.y && p.y <= crop.y + crop.h
  ) {
    mode = "move";
    dragOffset = { x: p.x - crop.x, y: p.y - crop.y };
  }
}

function onPointerMove(e) {
  const p = canvasPoint(e);

  if (!mode) {
    updateCursor(p);
    return;
  }

  if (mode === "move") {
    crop.x = p.x - dragOffset.x;
    crop.y = p.y - dragOffset.y;
    constrainMove();
  } else {
    resizeFromCorner(activeCorner, p);
  }

  render();
}

function onPointerUp(e) {
  mode = null;
  activeCorner = null;
  dragOffset = null;
  cropCanvas.releasePointerCapture(e.pointerId);
}

cropCanvas.addEventListener("pointerdown", onPointerDown);
cropCanvas.addEventListener("pointermove", onPointerMove);
cropCanvas.addEventListener("pointerup", onPointerUp);

// Correctly bounded resize
function resizeFromCorner(corner, p) {
  let ax, ay, maxW, maxH;

  if (corner === "br") {
    ax = crop.x;
    ay = crop.y;
    maxW = draw.x + draw.w - ax;
    maxH = draw.y + draw.h - ay;
  } else if (corner === "bl") {
    ax = crop.x + crop.w;
    ay = crop.y;
    maxW = ax - draw.x;
    maxH = draw.y + draw.h - ay;
  } else if (corner === "tr") {
    ax = crop.x;
    ay = crop.y + crop.h;
    maxW = draw.x + draw.w - ax;
    maxH = ay - draw.y;
  } else {
    ax = crop.x + crop.w;
    ay = crop.y + crop.h;
    maxW = ax - draw.x;
    maxH = ay - draw.y;
  }

  let w = Math.abs(p.x - ax);
  let h = w / ASPECT;

  if (h > maxH) {
    h = maxH;
    w = h * ASPECT;
  }
  if (w > maxW) {
    w = maxW;
    h = w / ASPECT;
  }

  if (w < MIN_SIZE || h < MIN_SIZE) return;

  crop.w = w;
  crop.h = h;
  crop.x = corner.includes("l") ? ax - w : ax;
  crop.y = corner.includes("t") ? ay - h : ay;
}

// Constrain move
function constrainMove() {
  crop.x = Math.max(draw.x, Math.min(crop.x, draw.x + draw.w - crop.w));
  crop.y = Math.max(draw.y, Math.min(crop.y, draw.y + draw.h - crop.h));
}

// Crop → dither (unchanged)
ditherBtn.addEventListener("click", () => {
  const src = document.createElement("canvas");
  src.width = draw.w / draw.scale;
  src.height = draw.h / draw.scale;

  const sctx = src.getContext("2d");
  sctx.translate(src.width / 2, src.height / 2);
  sctx.rotate(rotation * Math.PI / 180);
  sctx.drawImage(img, -img.width / 2, -img.height / 2);

  const sx = (crop.x - draw.x) / draw.scale;
  const sy = (crop.y - draw.y) / draw.scale;
  const sw = crop.w / draw.scale;
  const sh = crop.h / draw.scale;

  const temp = document.createElement("canvas");
  temp.width = 1200;
  temp.height = 1600;

  temp.getContext("2d").drawImage(
    src,
    sx, sy, sw, sh,
    0, 0, 1200, 1600
  );

  const palette = [
    "#191E21",
    "#e8e8e8",
    "#2157ba",
    "#125f20",
    "#b21318",
    "#efde44"
  ];

  const deviceColors = getDeviceColors("spectra6");

  ditherImage(temp, outputCanvas, {
    algorithm: "floydSteinberg",
    palette
  });

  replaceColors(outputCanvas, deviceCanvas, {
    originalColors: palette,
    replaceColors: deviceColors
  });
});