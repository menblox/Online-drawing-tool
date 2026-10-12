// ==== Константы ====
const WORLD_W = 5000;
const WORLD_H = 3500;
const MAX_HISTORY = 50;
const DEFAULT_LAYER_ID = "default_layer";

// ==== Параметры комнаты ====
const urlParams = new URLSearchParams(location.search);
const roomId = urlParams.get("room");

// ==== Элементы ====
const bodyEl = document.body;
const canvasArea = document.getElementById("canvas-area");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const cursorIndicator = document.getElementById("cursor-indicator");
const dropOverlay = document.getElementById("drop-overlay");

const roomBadge = document.getElementById("room-badge");
const roomIdText = document.getElementById("room-id-text");
const roomCopyBtn = document.getElementById("room-copy");

const copyModal = document.getElementById("copy-modal");
const copyUrlInput = document.getElementById("copy-url-input");
const copyModalClose = document.getElementById("copy-modal-close");

const statusTool = document.getElementById("status-tool");
const statusSize = document.getElementById("status-size");
const statusColorBox = document.getElementById("status-color-box");
const statusColor = document.getElementById("status-color");
const statusCoords = document.getElementById("status-coords");

const zoomSlider = document.getElementById("zoom-slider");
const zoomInBtn = document.getElementById("zoom-in");
const zoomOutBtn = document.getElementById("zoom-out");
const zoomResetBtn = document.getElementById("zoom-reset");

const spinnerOverlay = document.getElementById("spinner-overlay");

const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const themeToggle = document.getElementById("theme-toggle");

const colorInput = document.getElementById("color");
const sizeInput = document.getElementById("size");
const sizeValue = document.getElementById("size-value");
const sizePreview = document.getElementById("size-preview");
const clearBtn = document.getElementById("clear");
const resetViewBtn = document.getElementById("reset-view");
const exportPngBtn = document.getElementById("export-png");
const undoBtn = document.getElementById("undo");
const redoBtn = document.getElementById("redo");
const undoCount = document.getElementById("undo-count");
const redoCount = document.getElementById("redo-count");
const quickColorsEl = document.getElementById("quick-colors");
const addColorBtn = document.getElementById("add-color");
const toolButtons = document.querySelectorAll(".tool-btn");

const layersListEl = document.getElementById("layers-list");
const addLayerBtn = document.getElementById("add-layer");
const deleteLayerBtn = document.getElementById("delete-layer");
const moveLayerUpBtn = document.getElementById("move-layer-up");
const moveLayerDownBtn = document.getElementById("move-layer-down");

const toastContainer = document.getElementById("toast-container");

// ==== Тосты ====
function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = "toast toast-" + type;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ==== Тема ====
function loadTheme() {
    const saved = localStorage.getItem("theme");
    bodyEl.dataset.theme = (saved === "light" || saved === "dark") ? saved : "dark";
}

function toggleTheme() {
    const next = bodyEl.dataset.theme === "dark" ? "light" : "dark";
    bodyEl.dataset.theme = next;
    localStorage.setItem("theme", next);
    render();
    showToast(next === "dark" ? "Тёмная тема" : "Светлая тема");
}

// ==== Сворачивание панели ====
function loadSidebarState() {
    if (localStorage.getItem("sidebarCollapsed") === "1") {
        bodyEl.classList.add("sidebar-collapsed");
    }
}

function toggleSidebar() {
    bodyEl.classList.toggle("sidebar-collapsed");
    localStorage.setItem(
        "sidebarCollapsed",
        bodyEl.classList.contains("sidebar-collapsed") ? "1" : "0"
    );
    setTimeout(() => render(), 320);
}

// ==== Слои ====
let __layerIdCounter = 0;
let layers = [];
let activeLayerId = null;

function genLayerId() {
    __layerIdCounter++;
    const rand = Math.random().toString(36).substring(2, 10);
    return "layer_" + __layerIdCounter + "_" + Date.now() + "_" + rand;
}

function createLayer(name, id) {
    const c = document.createElement("canvas");
    c.width = WORLD_W;
    c.height = WORLD_H;
    const cctx = c.getContext("2d");
    return {
        id: id || genLayerId(),
        name: name || `Слой ${layers.length + 1}`,
        canvas: c,
        ctx: cctx,
        visible: true,
        opacity: 1,
    };
}

function getActiveLayer() {
    return layers.find((l) => l.id === activeLayerId) || null;
}

function getLayerById(id) {
    return layers.find((l) => l.id === id) || null;
}

function initFirstLayer() {
    const layer = createLayer("Слой 1", DEFAULT_LAYER_ID);
    layers.push(layer);
    activeLayerId = layer.id;
}

// ==== История (undo/redo) ====
const history = [];
let historyIndex = -1;
let actionBBox = null;
let actionLayerId = null;

const backupCanvas = document.createElement("canvas");
backupCanvas.width = WORLD_W;
backupCanvas.height = WORLD_H;
const backupCtx = backupCanvas.getContext("2d");

// ==== Состояние ====
let tool = "brush";
let color = "#000000";
let size = 4;

let scale = 1;
let offsetX = 0;
let offsetY = 0;

let mode = "idle";
let lastWorldX = 0;
let lastWorldY = 0;
let prevMidX = 0;
let prevMidY = 0;
let lastScreenX = 0;
let lastScreenY = 0;
let fastMode = false;

// ==== WebSocket ====
let ws = null;
let currentStroke = null;

function connectWebSocket() {
    if (!roomId) {
        updateRoomBadge(false);
        return;
    }
    updateRoomBadge(false);

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/ws/${roomId}`;

    try {
        ws = new WebSocket(url);
    } catch (e) {
        console.error("WS error", e);
        return;
    }

    ws.onopen = () => {
        console.log("WS connected:", url);
        updateRoomBadge(true);
        showToast(`Подключено к комнате: ${roomId}`, "success");
    };

    ws.onclose = () => {
        console.log("WS closed");
        updateRoomBadge(false);
    };

    ws.onerror = (e) => {
        console.error("WS error", e);
    };

    ws.onmessage = (e) => {
        try {
            const msg = JSON.parse(e.data);
            handleRemoteMessage(msg);
        } catch (err) {
            console.error("Bad message", err);
        }
    };
}

function wsSend(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(obj));
}

function updateRoomBadge(connected) {
    if (!roomId) {
        roomBadge.style.display = "none";
        return;
    }
    roomBadge.style.display = "flex";
    roomBadge.classList.toggle("connected", connected);
    roomIdText.textContent = roomId;
}

function handleRemoteMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
        case "stroke":
            applyRemoteStroke(msg);
            break;
        case "fill":
            applyRemoteFill(msg);
            break;
        case "layer_add":
            applyRemoteLayerAdd(msg);
            break;
        case "layer_delete":
            applyRemoteLayerDelete(msg);
            break;
        case "layer_move":
            applyRemoteLayerMove(msg);
            break;
        case "layer_clear":
            applyRemoteLayerClear(msg);
            break;
    }
}

// Применение чужого штриха
function applyRemoteStroke(msg) {
    const layerId = msg.layerId || DEFAULT_LAYER_ID;
    let layer = getLayerById(layerId);

    if (!layer) {
        layer = createLayer("Внешний слой", layerId);
        layers.push(layer);
        clearHistory();
        renderLayersList();
    }

    const c = layer.ctx;
    const points = msg.points || [];
    if (points.length === 0) return;

    c.save();
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.shadowBlur = 0;
    c.shadowColor = "transparent";

    let lineWidth, strokeStyle;
    if (msg.tool === "eraser") {
        c.globalCompositeOperation = "destination-out";
        lineWidth = (msg.size || 4) * 1.5;
        strokeStyle = "rgba(0,0,0,1)";
    } else if (msg.tool === "pencil") {
        lineWidth = Math.max(1, (msg.size || 4) * 0.35);
        strokeStyle = msg.color || "#000";
    } else {
        lineWidth = Math.max(1, (msg.size || 4) * 0.7);
        strokeStyle = msg.color || "#000";
    }

    c.lineWidth = lineWidth;
    c.strokeStyle = strokeStyle;
    c.lineCap = "round";
    c.lineJoin = "round";

    if (points.length === 1) {
        c.beginPath();
        c.arc(points[0][0], points[0][1], lineWidth / 2, 0, Math.PI * 2);
        c.fillStyle = strokeStyle;
        c.fill();
    } else {
        c.beginPath();
        c.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            c.lineTo(points[i][0], points[i][1]);
        }
        c.stroke();
    }

    c.restore();

    render();
    refreshAllLayerThumbs();
}

// Применение чужой заливки
function applyRemoteFill(msg) {
    const layerId = msg.layerId || DEFAULT_LAYER_ID;
    let layer = getLayerById(layerId);

    if (!layer) {
        layer = createLayer("Внешний слой", layerId);
        layers.push(layer);
        clearHistory();
        renderLayersList();
    }

    // Локально выполним ту же заливку. Без записи в undo-историю.
    actionBBox = null;
    actionLayerId = null;

    floodFillOnLayer(layer, msg.x, msg.y, msg.color || "#000");
    render();
    refreshAllLayerThumbs();
}

function applyRemoteLayerAdd(msg) {
    if (getLayerById(msg.id)) return;
    const layer = createLayer(msg.name || "Слой", msg.id);
    layers.push(layer);
    clearHistory();
    renderLayersList();
    render();
}

function applyRemoteLayerDelete(msg) {
    const idx = layers.findIndex((l) => l.id === msg.id);
    if (idx < 0) return;
    if (layers.length <= 1) return;
    layers.splice(idx, 1);
    if (activeLayerId === msg.id) {
        activeLayerId = layers[Math.min(idx, layers.length - 1)].id;
    }
    clearHistory();
    renderLayersList();
    render();
}

function applyRemoteLayerMove(msg) {
    const idx = layers.findIndex((l) => l.id === msg.id);
    if (idx < 0) return;
    const newIdx = idx + msg.dir;
    if (newIdx < 0 || newIdx >= layers.length) return;
    [layers[idx], layers[newIdx]] = [layers[newIdx], layers[idx]];
    clearHistory();
    renderLayersList();
    render();
}

function applyRemoteLayerClear(msg) {
    const layer = getLayerById(msg.layerId);
    if (!layer) return;
    layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
    layer.ctx.globalCompositeOperation = "source-over";
    layer.ctx.globalAlpha = 1;
    layer.ctx.shadowBlur = 0;
    layer.ctx.shadowColor = "transparent";
    layer.ctx.clearRect(0, 0, WORLD_W, WORLD_H);
    render();
    refreshAllLayerThumbs();
}

// ==== Копирование кода комнаты ====
function copyRoomLink() {
    if (!roomId) return;

    const tryClipboard = async () => {
        if (!navigator.clipboard || !window.isSecureContext) return false;
        try {
            await navigator.clipboard.writeText(roomId);
            return true;
        } catch {
            return false;
        }
    };

    tryClipboard().then((ok) => {
        if (ok) {
            showToast("Код скопирован: " + roomId, "success");
        } else {
            copyUrlInput.value = roomId;
            copyModal.classList.add("show");
            setTimeout(() => {
                copyUrlInput.focus();
                copyUrlInput.select();
            }, 100);
        }
    });
}

copyModalClose.addEventListener("click", () => {
    copyModal.classList.remove("show");
});

copyModal.addEventListener("click", (e) => {
    if (e.target === copyModal) copyModal.classList.remove("show");
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && copyModal.classList.contains("show")) {
        copyModal.classList.remove("show");
    }
});

// ==== Цвета ====
const DEFAULT_COLORS = [
    "#000000", "#ffffff", "#ff3b30", "#ff9500",
    "#ffcc00", "#34c759", "#007aff", "#5856d6",
    "#af52de", "#ff2d55", "#8b5a2b", "#808080",
];

function loadColors() {
    try {
        const saved = JSON.parse(localStorage.getItem("quickColors"));
        return Array.isArray(saved) && saved.length ? saved : [...DEFAULT_COLORS];
    } catch {
        return [...DEFAULT_COLORS];
    }
}

let quickColors = loadColors();
const saveColors = () => localStorage.setItem("quickColors", JSON.stringify(quickColors));

function renderQuickColors() {
    quickColorsEl.innerHTML = "";
    quickColors.forEach((c) => {
        const swatch = document.createElement("div");
        swatch.className = "color-swatch" + (c.toLowerCase() === color.toLowerCase() ? " selected" : "");
        swatch.style.background = c;
        swatch.title = c;

        swatch.addEventListener("click", () => {
            color = c;
            colorInput.value = c;
            renderQuickColors();
            updateSizePreview();
            updateCursorIndicator();
            updateStatusBar();
        });

        swatch.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            quickColors = quickColors.filter((x) => x !== c);
            saveColors();
            renderQuickColors();
            showToast("Цвет удалён");
        });

        quickColorsEl.appendChild(swatch);
    });
}

// ==== UI слоёв ====
const EYE_OPEN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_CLOSED = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;

function updateLayerThumb(layer, thumbCanvas) {
    const tctx = thumbCanvas.getContext("2d");
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, thumbCanvas.width, thumbCanvas.height);
    tctx.fillStyle = "#ffffff";
    tctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
    tctx.drawImage(layer.canvas, 0, 0, WORLD_W, WORLD_H, 0, 0, thumbCanvas.width, thumbCanvas.height);
}

function renderLayersList() {
    layersListEl.innerHTML = "";

    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        const item = document.createElement("div");
        item.className = "layer-item" + (layer.id === activeLayerId ? " active" : "");
        item.dataset.id = layer.id;

        const thumb = document.createElement("canvas");
        thumb.className = "layer-thumb";
        thumb.width = 80;
        thumb.height = 56;
        updateLayerThumb(layer, thumb);

        const vis = document.createElement("button");
        vis.className = "layer-visibility" + (layer.visible ? "" : " hidden");
        vis.innerHTML = layer.visible ? EYE_OPEN : EYE_CLOSED;
        vis.title = layer.visible ? "Скрыть" : "Показать";
        vis.addEventListener("click", (e) => {
            e.stopPropagation();
            layer.visible = !layer.visible;
            renderLayersList();
            render();
        });

        const name = document.createElement("span");
        name.className = "layer-name";
        name.textContent = layer.name;
        name.title = "Двойной клик — переименовать";
        name.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            const newName = prompt("Новое имя слоя:", layer.name);
            if (newName && newName.trim()) {
                layer.name = newName.trim();
                renderLayersList();
                showToast("Слой переименован");
            }
        });

        item.appendChild(thumb);
        item.appendChild(name);
        item.appendChild(vis);

        item.addEventListener("click", () => {
            if (activeLayerId !== layer.id) {
                activeLayerId = layer.id;
                clearHistory();
                renderLayersList();
                render();
                showToast("Слой: " + layer.name);
            }
        });

        layersListEl.appendChild(item);
    }
}

function refreshAllLayerThumbs() {
    const items = layersListEl.querySelectorAll(".layer-item");
    items.forEach((item) => {
        const id = item.dataset.id;
        const layer = getLayerById(id);
        if (!layer) return;
        const thumb = item.querySelector(".layer-thumb");
        if (thumb) updateLayerThumb(layer, thumb);
    });
}

const refreshActiveLayerThumb = refreshAllLayerThumbs;

// ==== Локальные действия со слоями (с отправкой в WS) ====
function addLayer() {
    const layer = createLayer();
    layers.push(layer);
    activeLayerId = layer.id;
    clearHistory();
    renderLayersList();
    render();
    wsSend({ type: "layer_add", id: layer.id, name: layer.name });
    showToast("Слой добавлен");
}

function deleteLayer(id) {
    if (layers.length <= 1) {
        showToast("Нельзя удалить последний слой", "error");
        return;
    }
    const idx = layers.findIndex((l) => l.id === id);
    if (idx < 0) return;
    layers.splice(idx, 1);
    if (activeLayerId === id) {
        activeLayerId = layers[Math.min(idx, layers.length - 1)].id;
    }
    clearHistory();
    renderLayersList();
    render();
    wsSend({ type: "layer_delete", id });
    showToast("Слой удалён");
}

function moveLayer(id, dir) {
    const idx = layers.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= layers.length) return;
    [layers[idx], layers[newIdx]] = [layers[newIdx], layers[idx]];
    clearHistory();
    renderLayersList();
    render();
    wsSend({ type: "layer_move", id, dir });
}

function duplicateLayer(id) {
    const idx = layers.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const src = layers[idx];
    const copy = createLayer(src.name + " (копия)");
    copy.ctx.drawImage(src.canvas, 0, 0);
    copy.visible = src.visible;
    layers.splice(idx + 1, 0, copy);
    activeLayerId = copy.id;
    clearHistory();
    renderLayersList();
    render();
    wsSend({ type: "layer_add", id: copy.id, name: copy.name });
    showToast("Слой дублирован");
}

// ==== Импорт картинки ====
function importImageAsLayer(img) {
    const layer = createLayer("Картинка");

    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;

    const maxW = WORLD_W * 0.9;
    const maxH = WORLD_H * 0.9;
    if (w > maxW || h > maxH) {
        const k = Math.min(maxW / w, maxH / h);
        w *= k;
        h *= k;
    }

    const x = (WORLD_W - w) / 2;
    const y = (WORLD_H - h) / 2;

    layer.ctx.drawImage(img, x, y, w, h);
    layers.push(layer);
    activeLayerId = layer.id;
    clearHistory();
    renderLayersList();
    render();
    wsSend({ type: "layer_add", id: layer.id, name: layer.name });
    showToast("Картинка добавлена как слой", "success");
}

function handleImageFile(file) {
    if (!file || !file.type.startsWith("image/")) {
        showToast("Поддерживаются только изображения", "error");
        return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        URL.revokeObjectURL(url);
        importImageAsLayer(img);
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
        showToast("Не удалось загрузить изображение", "error");
    };
    img.src = url;
}

// ==== Drag&drop ====
let dragDepth = 0;

canvasArea.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepth++;
    dropOverlay.classList.add("active");
});

canvasArea.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    dropOverlay.classList.add("active");
});

canvasArea.addEventListener("dragleave", (e) => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0 || !canvasArea.contains(e.relatedTarget)) {
        dragDepth = 0;
        dropOverlay.classList.remove("active");
    }
});

canvasArea.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.classList.remove("active");

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith("image/")) {
            handleImageFile(files[i]);
            return;
        }
    }
    showToast("Поддерживаются только изображения", "error");
});

window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
    if (!canvasArea.contains(e.target)) {
        e.preventDefault();
    }
});

// ==== Ресайз ====
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvasArea.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;

    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    render();
}

// ==== Трансформация ====
function setupScreenTransform() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(
        dpr * scale, 0,
        0, dpr * scale,
        dpr * offsetX, dpr * offsetY
    );
}

// ==== Рендер ====
function render() {
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const bgColor = getComputedStyle(document.body).getPropertyValue("--canvas-bg").trim() || "#1a1a22";
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    setupScreenTransform();

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    ctx.imageSmoothingEnabled = true;
    for (const layer of layers) {
        if (!layer.visible) continue;
        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(layer.canvas, 0, 0);
    }
    ctx.globalAlpha = 1;

    updateZoomUI();
}

function updateZoomUI() {
    zoomSlider.value = Math.round(Math.log2(scale) * 100);
}

// ==== Вписать мир в экран ====
function fitWorldToScreen() {
    const rect = canvas.getBoundingClientRect();
    scale = Math.max(rect.width / WORLD_W, rect.height / WORLD_H);
    offsetX = (rect.width - WORLD_W * scale) / 2;
    offsetY = (rect.height - WORLD_H * scale) / 2;
    render();
}

// ==== Координаты ====
function getScreenPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function screenToWorld(sx, sy) {
    return { x: (sx - offsetX) / scale, y: (sy - offsetY) / scale };
}

// ==== Параметры инструмента ====
function getToolParams() {
    if (tool === "eraser") {
        return {
            strokeStyle: "rgba(0,0,0,1)",
            lineWidth: size * 1.5,
            lineCap: "round",
            lineJoin: "round",
            shadowBlur: 0,
            shadowColor: "transparent",
            globalAlpha: 1,
            composite: "destination-out",
        };
    }
    if (tool === "pencil") {
        return {
            strokeStyle: color,
            lineWidth: Math.max(1, size * 0.35),
            lineCap: "round",
            lineJoin: "round",
            shadowBlur: 0,
            shadowColor: "transparent",
            globalAlpha: 1,
            composite: "source-over",
        };
    }
    return {
        strokeStyle: color,
        lineWidth: Math.max(1, size * 0.7),
        lineCap: "round",
        lineJoin: "round",
        shadowBlur: 0,
        shadowColor: "transparent",
        globalAlpha: 1,
        composite: "source-over",
    };
}

function applyToolSettings(c) {
    const p = getToolParams();
    c.globalCompositeOperation = p.composite || "source-over";
    c.strokeStyle = p.strokeStyle;
    c.lineWidth = p.lineWidth;
    c.lineCap = p.lineCap;
    c.lineJoin = p.lineJoin;
    c.shadowBlur = p.shadowBlur;
    c.shadowColor = p.shadowColor;
    c.globalAlpha = p.globalAlpha;
}

// ==== Снимок ====
function snapRegion(sourceCanvas, x, y, w, h) {
    const snap = document.createElement("canvas");
    snap.width = w;
    snap.height = h;
    const sctx = snap.getContext("2d");
    sctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, w, h);
    return snap;
}

// ==== История ====
function clearHistory() {
    history.length = 0;
    historyIndex = -1;
    actionBBox = null;
    actionLayerId = null;
    updateHistoryButtons();
}

function beginAction() {
    const layer = getActiveLayer();
    if (!layer) return;

    backupCtx.setTransform(1, 0, 0, 1, 0, 0);
    backupCtx.globalCompositeOperation = "source-over";
    backupCtx.globalAlpha = 1;
    backupCtx.clearRect(0, 0, WORLD_W, WORLD_H);
    backupCtx.drawImage(layer.canvas, 0, 0);

    actionBBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    actionLayerId = layer.id;
}

function extendActionBBox(x, y, pad) {
    if (!actionBBox) return;
    if (x - pad < actionBBox.minX) actionBBox.minX = x - pad;
    if (y - pad < actionBBox.minY) actionBBox.minY = y - pad;
    if (x + pad > actionBBox.maxX) actionBBox.maxX = x + pad;
    if (y + pad > actionBBox.maxY) actionBBox.maxY = y + pad;
}

function commitAction() {
    if (!actionBBox || !actionLayerId) return;
    if (!isFinite(actionBBox.minX)) { actionBBox = null; actionLayerId = null; return; }

    const layer = getLayerById(actionLayerId);
    if (!layer) { actionBBox = null; actionLayerId = null; return; }

    const pad = 12;
    const x = Math.max(0, Math.floor(actionBBox.minX - pad));
    const y = Math.max(0, Math.floor(actionBBox.minY - pad));
    const maxX = Math.min(WORLD_W, Math.ceil(actionBBox.maxX + pad) + 1);
    const maxY = Math.min(WORLD_H, Math.ceil(actionBBox.maxY + pad) + 1);
    const w = maxX - x;
    const h = maxY - y;

    if (w <= 0 || h <= 0) { actionBBox = null; actionLayerId = null; return; }

    const before = snapRegion(backupCanvas, x, y, w, h);
    const after = snapRegion(layer.canvas, x, y, w, h);

    if (historyIndex < history.length - 1) history.splice(historyIndex + 1);

    history.push({ layerId: layer.id, x, y, w, h, before, after });
    if (history.length > MAX_HISTORY) history.shift();
    historyIndex = history.length - 1;

    actionBBox = null;
    actionLayerId = null;
    updateHistoryButtons();
    refreshAllLayerThumbs();
}

function updateHistoryButtons() {
    undoBtn.disabled = historyIndex < 0;
    redoBtn.disabled = historyIndex >= history.length - 1;
    undoCount.textContent = Math.max(0, historyIndex + 1);
    redoCount.textContent = Math.max(0, history.length - historyIndex - 1);
}

function restoreSnapshot(snap, x, y, layerCtx) {
    layerCtx.setTransform(1, 0, 0, 1, 0, 0);
    layerCtx.globalCompositeOperation = "source-over";
    layerCtx.globalAlpha = 1;
    layerCtx.shadowBlur = 0;
    layerCtx.shadowColor = "transparent";
    layerCtx.clearRect(x, y, snap.width, snap.height);
    layerCtx.drawImage(snap, x, y);
}

function undo() {
    if (historyIndex < 0) return;
    const e = history[historyIndex];
    const layer = getLayerById(e.layerId);
    if (!layer) { historyIndex--; updateHistoryButtons(); return; }
    restoreSnapshot(e.before, e.x, e.y, layer.ctx);
    historyIndex--;
    render();
    refreshAllLayerThumbs();
    updateHistoryButtons();
    showToast("Отменено");
}

function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex++;
    const e = history[historyIndex];
    const layer = getLayerById(e.layerId);
    if (!layer) { historyIndex++; updateHistoryButtons(); return; }
    restoreSnapshot(e.after, e.x, e.y, layer.ctx);
    render();
    refreshAllLayerThumbs();
    updateHistoryButtons();
    showToast("Повторено");
}

// ==== Цвет ====
function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    };
}

function rgbToHex(r, g, b) {
    const toHex = (v) => v.toString(16).padStart(2, "0");
    return "#" + toHex(r) + toHex(g) + toHex(b);
}

function effectiveColor(data, i) {
    const a = data[i + 3];
    if (a === 0) return [255, 255, 255, 255];
    if (a === 255) return [data[i], data[i + 1], data[i + 2], 255];
    const alpha = a / 255;
    return [
        Math.round(data[i] * alpha + 255 * (1 - alpha)),
        Math.round(data[i + 1] * alpha + 255 * (1 - alpha)),
        Math.round(data[i + 2] * alpha + 255 * (1 - alpha)),
        255,
    ];
}

// ==== Заливка (параметризованная) ====
// Работает с указанным слоем и цветом, независимо от глобального состояния
function floodFillOnLayer(layer, startX, startY, fillColor) {
    startX = Math.floor(startX);
    startY = Math.floor(startY);
    if (startX < 0 || startY < 0 || startX >= WORLD_W || startY >= WORLD_H) return;

    const imageData = layer.ctx.getImageData(0, 0, WORLD_W, WORLD_H);
    const data = imageData.data;

    const startIdx = (startY * WORLD_W + startX) * 4;
    const [tR, tG, tB, tA] = effectiveColor(data, startIdx);

    const fc = hexToRgb(fillColor);
    const fR = fc.r, fG = fc.g, fB = fc.b, fA = 255;

    if (tR === fR && tG === fG && tB === fB) return;

    const tolerance = 30;

    const matches = (i) => {
        const [r, g, b, a] = effectiveColor(data, i);
        return (
            Math.abs(r - tR) <= tolerance &&
            Math.abs(g - tG) <= tolerance &&
            Math.abs(b - tB) <= tolerance &&
            Math.abs(a - tA) <= tolerance
        );
    };

    const stack = [[startX, startY]];

    while (stack.length) {
        const [x, y] = stack.pop();
        const startI = (y * WORLD_W + x) * 4;
        if (!matches(startI)) continue;

        let left = x;
        while (left > 0 && matches(((y * WORLD_W) + left - 1) * 4)) left--;
        let right = x;
        while (right < WORLD_W - 1 && matches(((y * WORLD_W) + right + 1) * 4)) right++;

        extendActionBBox(left, y, 1);
        extendActionBBox(right, y, 1);

        let spanAbove = false;
        let spanBelow = false;

        for (let i = left; i <= right; i++) {
            const idx = (y * WORLD_W + i) * 4;
            data[idx] = fR;
            data[idx + 1] = fG;
            data[idx + 2] = fB;
            data[idx + 3] = fA;

            if (y > 0) {
                const above = ((y - 1) * WORLD_W + i) * 4;
                const m = matches(above);
                if (m && !spanAbove) { stack.push([i, y - 1]); spanAbove = true; }
                else if (!m) { spanAbove = false; }
            }
            if (y < WORLD_H - 1) {
                const below = ((y + 1) * WORLD_W + i) * 4;
                const m = matches(below);
                if (m && !spanBelow) { stack.push([i, y + 1]); spanBelow = true; }
                else if (!m) { spanBelow = false; }
            }
        }
    }

    layer.ctx.putImageData(imageData, 0, 0);
}

// Обёртка для локального использования (активный слой + текущий цвет)
function floodFill(startX, startY) {
    const layer = getActiveLayer();
    if (!layer) return;
    floodFillOnLayer(layer, startX, startY, color);
}

// ==== Пипетка ====
function pickColorFromCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = Math.floor(clientX - rect.left);
    const py = Math.floor(clientY - rect.top);
    if (px < 0 || py < 0 || px >= rect.width || py >= rect.height) return null;

    const tmp = document.createElement("canvas");
    tmp.width = 1;
    tmp.height = 1;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(canvas, px, py, 1, 1, 0, 0, 1, 1);
    const d = tctx.getImageData(0, 0, 1, 1).data;

    if (d[3] === 0) return { r: 255, g: 255, b: 255 };
    return { r: d[0], g: d[1], b: d[2] };
}

// ==== Быстрый режим ====
function isActiveLayerTopmost() {
    const active = getActiveLayer();
    if (!active) return false;
    for (let i = layers.length - 1; i >= 0; i--) {
        if (layers[i].id === active.id) return true;
        if (layers[i].visible) return false;
    }
    return false;
}

// ==== Рисование ====
function drawSegmentOnBoth(prevMx, prevMy, lastX, lastY, midX, midY, useFast) {
    const layer = getActiveLayer();
    if (!layer) return;

    applyToolSettings(layer.ctx);
    layer.ctx.beginPath();
    layer.ctx.moveTo(prevMx, prevMy);
    layer.ctx.quadraticCurveTo(lastX, lastY, midX, midY);
    layer.ctx.stroke();

    if (useFast) {
        applyToolSettings(ctx);
        ctx.beginPath();
        ctx.moveTo(prevMx, prevMy);
        ctx.quadraticCurveTo(lastX, lastY, midX, midY);
        ctx.stroke();
    }
}

function drawDotOnBoth(x, y, useFast) {
    const layer = getActiveLayer();
    if (!layer) return;

    const p = getToolParams();

    applyToolSettings(layer.ctx);
    layer.ctx.beginPath();
    layer.ctx.arc(x, y, p.lineWidth / 2, 0, Math.PI * 2);
    layer.ctx.fillStyle = p.strokeStyle;
    layer.ctx.fill();

    if (useFast) {
        applyToolSettings(ctx);
        ctx.beginPath();
        ctx.arc(x, y, p.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = p.strokeStyle;
        ctx.fill();
    }
}

function bboxPadForCurrentTool() {
    const p = getToolParams();
    return p.lineWidth / 2 + (p.shadowBlur || 0) + 10;
}

// ==== Мышь ====
canvas.addEventListener("mousedown", (e) => {
    const pos = getScreenPos(e);

    const isPanTrigger =
        e.button === 1 ||
        e.ctrlKey ||
        (tool === "hand" && e.button === 0);

    if (isPanTrigger) {
        e.preventDefault();
        mode = "panning";
        lastScreenX = e.clientX;
        lastScreenY = e.clientY;
        canvas.style.cursor = "grabbing";
        return;
    }

    if (e.button !== 0) return;

    const world = screenToWorld(pos.x, pos.y);

    if (tool === "eyedropper") {
        const picked = pickColorFromCanvas(e.clientX, e.clientY);
        if (picked) {
            color = rgbToHex(picked.r, picked.g, picked.b);
            colorInput.value = color;
            renderQuickColors();
            updateSizePreview();
            updateStatusBar();
            showToast("Цвет: " + color.toUpperCase(), "success");
        }
        setTool("brush");
        return;
    }

    if (tool === "fill") {
        const layer = getActiveLayer();
        if (!layer) return;

        beginAction();
        showSpinner();
        setTimeout(() => {
            floodFill(world.x, world.y);
            commitAction();
            hideSpinner();
            render();

            // отправляем заливку другу
            wsSend({
                type: "fill",
                layerId: layer.id,
                x: world.x,
                y: world.y,
                color: color,
            });

            showToast("Заливка выполнена");
        }, 30);
        return;
    }

    if (tool === "brush" || tool === "pencil" || tool === "eraser") {
        const layer = getActiveLayer();
        if (!layer) return;

        mode = "drawing";
        beginAction();

        const pad = bboxPadForCurrentTool();
        extendActionBBox(world.x, world.y, pad);

        lastWorldX = world.x;
        lastWorldY = world.y;
        prevMidX = world.x;
        prevMidY = world.y;

        if (roomId) {
            currentStroke = {
                layerId: layer.id,
                color: color,
                size: size,
                tool: tool,
                points: [[world.x, world.y]],
            };
        } else {
            currentStroke = null;
        }

        fastMode = isActiveLayerTopmost() && tool !== "eraser";

        if (fastMode) {
            setupScreenTransform();
            drawDotOnBoth(world.x, world.y, true);
        } else {
            drawDotOnBoth(world.x, world.y, false);
            render();
        }
    }
});

canvas.addEventListener("mousemove", (e) => {
    moveCursorIndicator(e);
    updateCoords(e);

    if (mode === "panning") {
        const dx = e.clientX - lastScreenX;
        const dy = e.clientY - lastScreenY;
        offsetX += dx;
        offsetY += dy;
        lastScreenX = e.clientX;
        lastScreenY = e.clientY;
        render();
        return;
    }

    if (mode === "drawing") {
        const pos = getScreenPos(e);
        const world = screenToWorld(pos.x, pos.y);

        const midX = (lastWorldX + world.x) / 2;
        const midY = (lastWorldY + world.y) / 2;

        const pad = bboxPadForCurrentTool();
        extendActionBBox(world.x, world.y, pad);
        extendActionBBox(midX, midY, pad);
        extendActionBBox(lastWorldX, lastWorldY, pad);

        drawSegmentOnBoth(prevMidX, prevMidY, lastWorldX, lastWorldY, midX, midY, fastMode);

        if (!fastMode) render();

        if (currentStroke) {
            currentStroke.points.push([world.x, world.y]);
        }

        prevMidX = midX;
        prevMidY = midY;
        lastWorldX = world.x;
        lastWorldY = world.y;
    }
});

window.addEventListener("mouseup", () => {
    if (mode === "drawing") {
        const layer = getActiveLayer();
        if (layer) {
            const pad = bboxPadForCurrentTool();
            extendActionBBox(lastWorldX, lastWorldY, pad);
            extendActionBBox(prevMidX, prevMidY, pad);

            applyToolSettings(layer.ctx);
            layer.ctx.beginPath();
            layer.ctx.moveTo(prevMidX, prevMidY);
            layer.ctx.lineTo(lastWorldX, lastWorldY);
            layer.ctx.stroke();

            if (fastMode) {
                applyToolSettings(ctx);
                ctx.beginPath();
                ctx.moveTo(prevMidX, prevMidY);
                ctx.lineTo(lastWorldX, lastWorldY);
                ctx.stroke();
            }
        }

        if (currentStroke) {
            wsSend({ type: "stroke", ...currentStroke });
            currentStroke = null;
        }

        commitAction();
        fastMode = false;
    }
    if (mode === "panning" || mode === "drawing") {
        mode = "idle";
        updateCursorStyle();
    }
});

canvas.addEventListener("mouseleave", () => {
    if (mode === "drawing") mode = "idle";
    cursorIndicator.style.display = "none";
    statusCoords.textContent = "—, —";
});

canvas.addEventListener("mouseenter", () => {
    if (tool === "brush" || tool === "pencil" || tool === "eraser") {
        cursorIndicator.style.display = "block";
    }
});

// ==== Зум ====
canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const pos = getScreenPos(e);

    const factor = Math.exp(-e.deltaY * 0.0015);
    const newScale = Math.max(0.02, Math.min(20, scale * factor));

    const worldX = (pos.x - offsetX) / scale;
    const worldY = (pos.y - offsetY) / scale;

    offsetX = pos.x - worldX * newScale;
    offsetY = pos.y - worldY * newScale;
    scale = newScale;

    render();
    updateCursorIndicator();
    moveCursorIndicator(e);
}, { passive: false });

zoomInBtn.addEventListener("click", () => zoomAtCenter(scale * 1.25));
zoomOutBtn.addEventListener("click", () => zoomAtCenter(scale / 1.25));
zoomResetBtn.addEventListener("click", () => zoomAtCenter(1));
zoomSlider.addEventListener("input", () => {
    const target = Math.pow(2, zoomSlider.value / 100);
    zoomAtCenter(target);
});

function zoomAtCenter(newScale) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    newScale = Math.max(0.02, Math.min(20, newScale));

    const worldX = (cx - offsetX) / scale;
    const worldY = (cy - offsetY) / scale;

    offsetX = cx - worldX * newScale;
    offsetY = cy - worldY * newScale;
    scale = newScale;

    render();
    updateCursorIndicator();
}

// ==== Индикатор курсора ====
function getScreenDiameter() {
    let worldDia;
    if (tool === "eraser") worldDia = size * 1.5;
    else if (tool === "pencil") worldDia = Math.max(1, size * 0.35);
    else worldDia = Math.max(1, size * 0.7);
    return Math.max(6, worldDia * scale);
}

function updateCursorIndicator() {
    if (tool === "fill" || tool === "hand" || tool === "eyedropper") {
        cursorIndicator.style.display = "none";
        return;
    }

    const d = getScreenDiameter();
    cursorIndicator.style.width = d + "px";
    cursorIndicator.style.height = d + "px";

    cursorIndicator.classList.remove("eraser", "brush", "pencil");
    cursorIndicator.classList.add(tool);

    if (tool === "eraser") {
        cursorIndicator.style.borderColor = "rgba(0,0,0,0.6)";
        cursorIndicator.style.background = "rgba(255,255,255,0.2)";
    } else {
        cursorIndicator.style.borderColor = color;
        cursorIndicator.style.background = "transparent";
        cursorIndicator.style.opacity = "0.9";
    }
}

function moveCursorIndicator(e) {
    if (tool === "fill" || tool === "hand" || tool === "eyedropper") return;
    const areaRect = canvasArea.getBoundingClientRect();
    const x = e.clientX - areaRect.left;
    const y = e.clientY - areaRect.top;
    cursorIndicator.style.left = x + "px";
    cursorIndicator.style.top = y + "px";
    cursorIndicator.style.display = "block";
}

function updateCursorStyle() {
    if (mode === "panning") {
        canvas.style.cursor = "grabbing";
        return;
    }
    if (tool === "hand") {
        canvas.style.cursor = "grab";
        cursorIndicator.style.display = "none";
    } else if (tool === "fill" || tool === "eyedropper") {
        canvas.style.cursor = "crosshair";
        cursorIndicator.style.display = "none";
    } else {
        canvas.style.cursor = "none";
    }
}

// ==== Статус-бар ====
const TOOL_NAMES = {
    brush: "Кисть",
    pencil: "Карандаш",
    eraser: "Ластик",
    fill: "Заливка",
    eyedropper: "Пипетка",
    hand: "Рука",
};

function updateStatusBar() {
    statusTool.textContent = TOOL_NAMES[tool] || tool;
    statusSize.textContent = size;
    statusColorBox.style.background = color;
    statusColor.textContent = color.toUpperCase();
}

function updateCoords(e) {
    const pos = getScreenPos(e);
    const world = screenToWorld(pos.x, pos.y);
    if (world.x >= 0 && world.y >= 0 && world.x < WORLD_W && world.y < WORLD_H) {
        statusCoords.textContent = `${Math.round(world.x)}, ${Math.round(world.y)}`;
    } else {
        statusCoords.textContent = "—, —";
    }
}

// ==== Превью толщины ====
function updateSizePreview() {
    const visual = Math.min(34, size);
    sizePreview.style.width = visual + "px";
    sizePreview.style.height = visual + "px";
    sizePreview.style.background = tool === "eraser" ? "#888" : color;
}

// ==== UI инструментов ====
function setTool(newTool) {
    tool = newTool;
    toolButtons.forEach((b) => b.classList.toggle("active", b.dataset.tool === newTool));
    updateCursorStyle();
    updateCursorIndicator();
    updateSizePreview();
    updateStatusBar();
}

toolButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        setTool(btn.dataset.tool);
    });
});

colorInput.addEventListener("input", () => {
    color = colorInput.value;
    if (tool === "eraser") setTool("brush");
    renderQuickColors();
    updateCursorIndicator();
    updateSizePreview();
    updateStatusBar();
});

sizeInput.addEventListener("input", () => {
    size = Number(sizeInput.value);
    sizeValue.textContent = size;
    updateSizePreview();
    updateCursorIndicator();
    updateStatusBar();
});

addColorBtn.addEventListener("click", () => {
    if (quickColors.includes(color)) {
        showToast("Этот цвет уже сохранён");
        return;
    }
    quickColors.push(color);
    if (quickColors.length > 24) quickColors = quickColors.slice(-24);
    saveColors();
    renderQuickColors();
    showToast("Цвет сохранён", "success");
});

// ==== Кнопки слоёв ====
addLayerBtn.addEventListener("click", addLayer);
deleteLayerBtn.addEventListener("click", () => deleteLayer(activeLayerId));
moveLayerUpBtn.addEventListener("click", () => moveLayer(activeLayerId, +1));
moveLayerDownBtn.addEventListener("click", () => moveLayer(activeLayerId, -1));

// ==== Кнопки ====
resetViewBtn.addEventListener("click", () => {
    fitWorldToScreen();
    updateCursorIndicator();
    showToast("Вид сброшен");
});

undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);

exportPngBtn.addEventListener("click", exportPNG);

clearBtn.addEventListener("click", () => {
    const layer = getActiveLayer();
    if (!layer) return;

    beginAction();
    extendActionBBox(0, 0, 0);
    extendActionBBox(WORLD_W, WORLD_H, 0);

    layer.ctx.globalCompositeOperation = "source-over";
    layer.ctx.globalAlpha = 1;
    layer.ctx.shadowBlur = 0;
    layer.ctx.shadowColor = "transparent";
    layer.ctx.clearRect(0, 0, WORLD_W, WORLD_H);

    commitAction();
    render();
    refreshAllLayerThumbs();

    wsSend({ type: "layer_clear", layerId: layer.id });
    showToast("Слой очищен");
});

// ==== Тема / панель ====
themeToggle.addEventListener("click", toggleTheme);
sidebarToggle.addEventListener("click", toggleSidebar);

// ==== Плашка комнаты ====
roomCopyBtn.addEventListener("click", copyRoomLink);

// ==== Спиннер ====
function showSpinner() { spinnerOverlay.classList.add("active"); }
function hideSpinner() { spinnerOverlay.classList.remove("active"); }

// ==== Контекстное меню ====
let contextMenuEl = null;

function buildContextMenu() {
    if (contextMenuEl) contextMenuEl.remove();
    contextMenuEl = document.createElement("div");
    contextMenuEl.className = "context-menu";
    contextMenuEl.innerHTML = `
        <div class="context-item" data-action="pick">Взять цвет</div>
        <div class="context-divider"></div>
        <div class="context-item" data-action="duplicate">Дублировать слой</div>
        <div class="context-item" data-action="clear-layer">Очистить слой</div>
        <div class="context-divider"></div>
        <div class="context-item" data-action="export">Экспорт PNG</div>
        <div class="context-item" data-action="reset-view">Сбросить вид</div>
        <div class="context-divider"></div>
        <div class="context-item danger" data-action="delete-layer">Удалить слой</div>
    `;
    document.body.appendChild(contextMenuEl);

    contextMenuEl.addEventListener("click", (e) => {
        const item = e.target.closest(".context-item");
        if (!item) return;
        const action = item.dataset.action;
        hideContextMenu();

        if (action === "pick") {
            const picked = pickColorFromCanvas(lastScreenX, lastScreenY);
            if (picked) {
                color = rgbToHex(picked.r, picked.g, picked.b);
                colorInput.value = color;
                renderQuickColors();
                updateSizePreview();
                updateStatusBar();
                showToast("Цвет: " + color.toUpperCase(), "success");
            }
        } else if (action === "duplicate") duplicateLayer(activeLayerId);
        else if (action === "clear-layer") clearBtn.click();
        else if (action === "export") exportPNG();
        else if (action === "reset-view") resetViewBtn.click();
        else if (action === "delete-layer") deleteLayer(activeLayerId);
    });
}

function showContextMenu(x, y) {
    if (!contextMenuEl) buildContextMenu();
    contextMenuEl.style.left = x + "px";
    contextMenuEl.style.top = y + "px";
    contextMenuEl.classList.add("show");

    requestAnimationFrame(() => {
        const rect = contextMenuEl.getBoundingClientRect();
        if (rect.right > window.innerWidth - 8) {
            contextMenuEl.style.left = (window.innerWidth - rect.width - 8) + "px";
        }
        if (rect.bottom > window.innerHeight - 8) {
            contextMenuEl.style.top = (window.innerHeight - rect.height - 8) + "px";
        }
    });
}

function hideContextMenu() {
    if (contextMenuEl) contextMenuEl.classList.remove("show");
}

canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    lastScreenX = e.clientX;
    lastScreenY = e.clientY;
    showContextMenu(e.clientX, e.clientY);
});

document.addEventListener("click", (e) => {
    if (contextMenuEl && contextMenuEl.classList.contains("show")) {
        if (!contextMenuEl.contains(e.target)) hideContextMenu();
    }
});

document.addEventListener("scroll", hideContextMenu, true);

// ==== Экспорт PNG ====
function exportPNG() {
    const out = document.createElement("canvas");
    out.width = WORLD_W;
    out.height = WORLD_H;
    const octx = out.getContext("2d");
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, WORLD_W, WORLD_H);
    for (const layer of layers) {
        if (!layer.visible) continue;
        octx.globalAlpha = layer.opacity;
        octx.drawImage(layer.canvas, 0, 0);
    }
    octx.globalAlpha = 1;

    out.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "drawapp-" + Date.now() + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast("PNG сохранён", "success");
    }, "image/png");
}

// ==== Клавиатура ====
window.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (!ctrl && !e.target.matches("input, textarea")) {
        if (e.code === "KeyB") { e.preventDefault(); setTool("brush"); return; }
        if (e.code === "KeyP") { e.preventDefault(); setTool("pencil"); return; }
        if (e.code === "KeyE") { e.preventDefault(); setTool("eraser"); return; }
        if (e.code === "KeyG") { e.preventDefault(); setTool("fill"); return; }
        if (e.code === "KeyI") { e.preventDefault(); setTool("eyedropper"); return; }
        if (e.code === "KeyH") { e.preventDefault(); setTool("hand"); return; }
        if (e.code === "BracketLeft") {
            e.preventDefault();
            const v = Math.max(1, size - 2);
            size = v; sizeInput.value = v; sizeValue.textContent = v;
            updateSizePreview(); updateCursorIndicator(); updateStatusBar();
            return;
        }
        if (e.code === "BracketRight") {
            e.preventDefault();
            const v = Math.min(80, size + 2);
            size = v; sizeInput.value = v; sizeValue.textContent = v;
            updateSizePreview(); updateCursorIndicator(); updateStatusBar();
            return;
        }
    }

    if (!ctrl) return;

    if (e.code === "KeyZ" && !e.shiftKey) {
        e.preventDefault();
        undo();
    } else if (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey)) {
        e.preventDefault();
        redo();
    } else if (e.code === "Digit0") {
        e.preventDefault();
        fitWorldToScreen();
    } else if (e.code === "Digit1") {
        e.preventDefault();
        zoomAtCenter(1);
    } else if (e.code === "KeyS") {
        e.preventDefault();
        exportPNG();
    }
});

// ==== Ресайз ====
window.addEventListener("resize", () => {
    resizeCanvas();
    render();
});

// ==== Инициализация ====
loadTheme();
loadSidebarState();
initFirstLayer();
renderQuickColors();
resizeCanvas();
fitWorldToScreen();
renderLayersList();
updateSizePreview();
updateCursorStyle();
updateCursorIndicator();
updateHistoryButtons();
updateStatusBar();

connectWebSocket();