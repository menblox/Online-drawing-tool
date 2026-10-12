// ==== Тема — синхронизируем с рисовалкой ====
(function () {
    const t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") {
        document.body.dataset.theme = t;
    }
})();

// ==== Генерация id комнаты ====
function generateRoomId() {
    // 8 символов из алфавита без похожих (0/O, 1/l/I)
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 8; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
}

// ==== Переходы ====
function goToDrawing(roomId = null) {
    const url = roomId
        ? `/drawing/?room=${encodeURIComponent(roomId)}`
        : "/drawing/";
    location.href = url;
}

// ==== Кнопки ====
const menuItems = document.querySelectorAll(".menu-item");

menuItems.forEach((btn) => {
    btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (action === "solo") {
            goToDrawing();
        } else if (action === "coop") {
            const id = generateRoomId();
            goToDrawing(id);
        } else if (action === "join") {
            openJoinModal();
        }
    });
});

// ==== Модалка ввода кода ====
const modalBackdrop = document.getElementById("modal-backdrop");
const modalInput = document.getElementById("room-input");
const modalError = document.getElementById("modal-error");
const modalCancel = document.getElementById("modal-cancel");
const modalSubmit = document.getElementById("modal-submit");

function openJoinModal() {
    modalError.textContent = "";
    modalInput.value = "";
    modalBackdrop.classList.add("show");
    setTimeout(() => modalInput.focus(), 100);
}

function closeJoinModal() {
    modalBackdrop.classList.remove("show");
}

function submitJoin() {
    const val = modalInput.value.trim().toLowerCase();

    if (!val) {
        modalError.textContent = "Введите код комнаты";
        modalInput.focus();
        return;
    }

    // Простая валидация: буквы/цифры, от 4 до 20 символов
    if (!/^[a-z0-9]{4,20}$/.test(val)) {
        modalError.textContent = "Код может содержать только буквы и цифры (4–20 символов)";
        modalInput.focus();
        return;
    }

    goToDrawing(val);
}

modalCancel.addEventListener("click", closeJoinModal);
modalSubmit.addEventListener("click", submitJoin);

modalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        submitJoin();
    } else if (e.key === "Escape") {
        closeJoinModal();
    }
});

modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeJoinModal();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalBackdrop.classList.contains("show")) {
        closeJoinModal();
    }
});