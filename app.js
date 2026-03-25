import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyArauYviigQgZuFeAJ6Z8CICkARxLV1Bd8",
  authDomain: "agenda-checklist-c18bc.firebaseapp.com",
  projectId: "agenda-checklist-c18bc",
  storageBucket: "agenda-checklist-c18bc.firebasestorage.app",
  messagingSenderId: "66218788574",
  appId: "1:66218788574:web:160eb241654247057a644f",
  measurementId: "G-EZHZPX33WM",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const tasksRef = collection(db, "tasks");
const tasksQuery = query(tasksRef, orderBy("createdAt", "desc"));

const settingsKey = "agendaChecklist:settings:v1";

const form = document.getElementById("taskForm");
const list = document.getElementById("taskList");
const emptyState = document.getElementById("emptyState");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const progressMeta = document.getElementById("progressMeta");
const streakMeta = document.getElementById("streakMeta");

const statusFilters = document.getElementById("statusFilters");
const priorityFilters = document.getElementById("priorityFilters");
const searchInput = document.getElementById("searchInput");
const sortInput = document.getElementById("sortInput");
const reminderTimeInput = document.getElementById("reminderTimeInput");
const clearCompletedBtn = document.getElementById("clearCompleted");
const clearAllBtn = document.getElementById("clearAll");

const titleInput = document.getElementById("titleInput");
const notesInput = document.getElementById("notesInput");
const dueDateInput = document.getElementById("dueDateInput");
const priorityInput = document.getElementById("priorityInput");
const tagsInput = document.getElementById("tagsInput");

const taskTemplate = document.getElementById("taskTemplate");
const toast = document.getElementById("toast");
const calPrev = document.getElementById("calPrev");
const calNext = document.getElementById("calNext");
const calLabel = document.getElementById("calLabel");
const calendarGrid = document.getElementById("calendarGrid");
const calendarDayTitle = document.getElementById("calendarDayTitle");
const calendarDayList = document.getElementById("calendarDayList");
const calendarDayEmpty = document.getElementById("calendarDayEmpty");

let tasks = [];
let settings = loadSettings();
let reminderTimer = null;
let calendarState = buildInitialCalendarState();
let filters = {
  status: "all",
  priority: "all",
  search: "",
  sort: "created",
};

start();

async function start() {
  try {
    await signInAnonymously(auth);
  } catch (error) {
    console.error("Anonymous sign-in failed", error);
  }
  init();
  subscribeTasks();
}

function init() {
  form.addEventListener("submit", handleCreateTask);
  statusFilters.addEventListener("click", handleStatusFilter);
  priorityFilters.addEventListener("click", handlePriorityFilter);
  searchInput.addEventListener("input", handleSearch);
  sortInput.addEventListener("change", handleSort);
  reminderTimeInput.addEventListener("change", handleReminderTime);
  clearCompletedBtn.addEventListener("click", clearCompleted);
  clearAllBtn.addEventListener("click", clearAll);
  calPrev.addEventListener("click", () => shiftCalendar(-1));
  calNext.addEventListener("click", () => shiftCalendar(1));
  calendarGrid.addEventListener("click", handleCalendarClick);

  reminderTimeInput.value = settings.reminderTime;
  render();
  scheduleDailyReminder();
}

function subscribeTasks() {
  onSnapshot(tasksQuery, (snapshot) => {
    tasks = snapshot.docs.map((docSnap) => mapTask(docSnap));
    render();
  });
}

async function handleCreateTask(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  if (!title) return;

  const task = {
    title,
    notes: notesInput.value.trim(),
    dueDate: dueDateInput.value || "",
    priority: priorityInput.value,
    tags: parseTags(tagsInput.value),
    completed: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await addDoc(tasksRef, task);
  resetForm();
}

function handleStatusFilter(event) {
  const button = event.target.closest("button");
  if (!button) return;
  filters.status = button.dataset.status;
  setActive(statusFilters, button);
  render();
}

function handlePriorityFilter(event) {
  const button = event.target.closest("button");
  if (!button) return;
  filters.priority = button.dataset.priority;
  setActive(priorityFilters, button);
  render();
}

function handleSearch(event) {
  filters.search = event.target.value.toLowerCase();
  render();
}

function handleSort(event) {
  filters.sort = event.target.value;
  render();
}

function handleReminderTime(event) {
  settings.reminderTime = event.target.value || "09:00";
  saveSettings();
  scheduleDailyReminder();
}

function render() {
  list.innerHTML = "";
  const filtered = applyFilters(tasks);

  filtered.forEach((task) => {
    const node = taskTemplate.content.cloneNode(true);
    const item = node.querySelector(".task");
    const check = node.querySelector(".check");
    const title = node.querySelector(".task-title");
    const meta = node.querySelector(".task-meta");
    const tags = node.querySelector(".task-tags");
    const editBtn = node.querySelector(".edit");
    const deleteBtn = node.querySelector(".delete");
    const editForm = node.querySelector(".edit-form");

    if (task.completed) item.classList.add("completed");

    title.textContent = task.title;
    meta.textContent = buildMeta(task);
    tags.append(...renderTags(task.tags));

    check.addEventListener("click", () => toggleComplete(task.id));
    editBtn.addEventListener("click", () => toggleEdit(item, task));
    deleteBtn.addEventListener("click", () => deleteTask(task.id));

    wireEditForm(editForm, item, task);

    list.appendChild(node);
  });

  emptyState.style.display = filtered.length === 0 ? "block" : "none";
  updateProgress();
  renderCalendar();
}

function applyFilters(source) {
  let result = [...source];

  if (filters.status === "active") {
    result = result.filter((task) => !task.completed);
  } else if (filters.status === "completed") {
    result = result.filter((task) => task.completed);
  }

  if (filters.priority !== "all") {
    result = result.filter((task) => task.priority === filters.priority);
  }

  if (filters.search) {
    result = result.filter((task) => {
      const haystack = `${task.title} ${task.notes} ${task.tags.join(" ")}`.toLowerCase();
      return haystack.includes(filters.search);
    });
  }

  if (filters.sort === "due") {
    result.sort((a, b) => getDueValue(a) - getDueValue(b));
  } else if (filters.sort === "priority") {
    result.sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority));
  } else {
    result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return result;
}

async function toggleComplete(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;
  await updateDoc(doc(db, "tasks", id), {
    completed: !task.completed,
    updatedAt: serverTimestamp(),
  });
}

function toggleEdit(item, task) {
  const isEditing = item.classList.toggle("editing");
  if (isEditing) {
    const titleInput = item.querySelector(".edit-title");
    const notesInput = item.querySelector(".edit-notes");
    const dueDateInput = item.querySelector(".edit-due-date");
    const priorityInput = item.querySelector(".edit-priority");
    const tagsInput = item.querySelector(".edit-tags");

    titleInput.value = task.title;
    notesInput.value = task.notes;
    dueDateInput.value = task.dueDate || "";
    priorityInput.value = task.priority;
    tagsInput.value = task.tags.join(", ");
  }
}

function wireEditForm(editForm, item, task) {
  const cancelBtn = editForm.querySelector(".cancel");
  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const titleValue = editForm.querySelector(".edit-title").value.trim();
    if (!titleValue) return;

    await updateDoc(doc(db, "tasks", task.id), {
      title: titleValue,
      notes: editForm.querySelector(".edit-notes").value.trim(),
      dueDate: editForm.querySelector(".edit-due-date").value || "",
      priority: editForm.querySelector(".edit-priority").value,
      tags: parseTags(editForm.querySelector(".edit-tags").value),
      updatedAt: serverTimestamp(),
    });
  });

  cancelBtn.addEventListener("click", () => {
    item.classList.remove("editing");
  });
}

async function deleteTask(id) {
  await deleteDoc(doc(db, "tasks", id));
}

async function clearCompleted() {
  const batch = writeBatch(db);
  tasks
    .filter((task) => task.completed)
    .forEach((task) => batch.delete(doc(db, "tasks", task.id)));
  await batch.commit();
}

async function clearAll() {
  if (!confirm("Delete all tasks?")) return;
  const batch = writeBatch(db);
  tasks.forEach((task) => batch.delete(doc(db, "tasks", task.id)));
  await batch.commit();
}

function updateProgress() {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  progressText.textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;
  progressMeta.textContent = `${completed} of ${total} done`;
  streakMeta.textContent = `Streak: ${computeStreak()}`;
}

function computeStreak() {
  const completedDates = tasks
    .filter((task) => task.completed)
    .map((task) => task.updatedAt.slice(0, 10));

  const uniqueDates = new Set(completedDates);
  let streak = 0;
  let cursor = new Date();

  while (uniqueDates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function buildMeta(task) {
  const parts = [];
  if (task.dueDate) {
    parts.push(`Due: ${task.dueDate}`);
  }
  parts.push(`Priority: ${capitalize(task.priority)}`);
  return parts.join(" · ");
}

function renderTags(tags) {
  return tags.map((tag) => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = tag;
    return span;
  });
}

function parseTags(text) {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function resetForm() {
  form.reset();
  priorityInput.value = "medium";
}

function setActive(container, activeButton) {
  container.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button === activeButton);
  });
}

function priorityScore(priority) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function getDueValue(task) {
  if (!task.dueDate) return Number.MAX_SAFE_INTEGER;
  return new Date(`${task.dueDate}T00:00`).getTime();
}

function buildInitialCalendarState() {
  const today = new Date();
  return {
    year: today.getFullYear(),
    month: today.getMonth(),
    selectedDate: toDateKey(today),
  };
}

function shiftCalendar(direction) {
  const nextMonth = calendarState.month + direction;
  const nextDate = new Date(calendarState.year, nextMonth, 1);
  calendarState.year = nextDate.getFullYear();
  calendarState.month = nextDate.getMonth();
  renderCalendar();
}

function handleCalendarClick(event) {
  const dayButton = event.target.closest(".calendar-day");
  if (!dayButton) return;
  const dateValue = dayButton.dataset.date;
  if (!dateValue) return;
  calendarState.selectedDate = dateValue;
  renderCalendar();
}

function renderCalendar() {
  const { year, month, selectedDate } = calendarState;
  const monthLabel = new Date(year, month, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  calLabel.textContent = monthLabel;

  const tasksByDate = groupTasksByDate();
  const firstDay = new Date(year, month, 1);
  const startDayIndex = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toDateKey(new Date());

  calendarGrid.innerHTML = "";

  for (let i = 0; i < startDayIndex; i += 1) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "calendar-cell empty";
    calendarGrid.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateValue = toDateKey(new Date(year, month, day));
    const tasksForDay = tasksByDate[dateValue] || [];

    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.dataset.date = dateValue;

    if (dateValue === todayKey) {
      button.classList.add("today");
    }
    if (dateValue === selectedDate) {
      button.classList.add("selected");
    }

    const number = document.createElement("span");
    number.className = "calendar-number";
    number.textContent = day;
    button.appendChild(number);

    if (tasksForDay.length > 0) {
      const count = document.createElement("span");
      count.className = "calendar-count";
      count.textContent = tasksForDay.length;
      button.appendChild(count);
    }

    calendarGrid.appendChild(button);
  }

  while (calendarGrid.children.length % 7 !== 0) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "calendar-cell empty";
    calendarGrid.appendChild(emptyCell);
  }

  renderCalendarDayDetails(tasksByDate);
}

function renderCalendarDayDetails(tasksByDate) {
  const selectedDate = calendarState.selectedDate;
  const tasksForDay = tasksByDate[selectedDate] || [];

  calendarDayTitle.textContent = `Tasks for ${selectedDate}`;
  calendarDayList.innerHTML = "";

  tasksForDay.forEach((task) => {
    const item = document.createElement("li");
    item.className = `calendar-day-item${task.completed ? " completed" : ""}`;

    const name = document.createElement("span");
    name.textContent = task.title;

    const badge = document.createElement("span");
    badge.className = "calendar-day-badge";
    badge.textContent = capitalize(task.priority);

    item.append(name, badge);
    calendarDayList.appendChild(item);
  });

  calendarDayEmpty.style.display = tasksForDay.length === 0 ? "block" : "none";
}

function groupTasksByDate() {
  return tasks.reduce((map, task) => {
    if (!task.dueDate) return map;
    if (!map[task.dueDate]) {
      map[task.dueDate] = [];
    }
    map[task.dueDate].push(task);
    return map;
  }, {});
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadSettings() {
  const raw = localStorage.getItem(settingsKey);
  if (!raw) {
    return { reminderTime: "09:00" };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      reminderTime: typeof parsed.reminderTime === "string" ? parsed.reminderTime : "09:00",
    };
  } catch {
    return { reminderTime: "09:00" };
  }
}

function saveSettings() {
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

function scheduleDailyReminder() {
  if (reminderTimer) {
    clearTimeout(reminderTimer);
  }

  const next = getNextReminderTime(settings.reminderTime);
  const delay = Math.max(next.getTime() - Date.now(), 1000);

  reminderTimer = setTimeout(() => {
    fireReminder();
    scheduleDailyReminder();
  }, delay);
}

function getNextReminderTime(timeValue) {
  const [hour, minute] = timeValue.split(":").map(Number);
  const now = new Date();
  const target = new Date();

  target.setHours(Number.isFinite(hour) ? hour : 9);
  target.setMinutes(Number.isFinite(minute) ? minute : 0);
  target.setSeconds(0);
  target.setMilliseconds(0);

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return target;
}

function fireReminder() {
  const today = new Date().toISOString().slice(0, 10);
  const dueTasks = tasks.filter((task) => {
    if (!task.dueDate || task.completed) return false;
    return task.dueDate <= today;
  });

  if (dueTasks.length === 0) return;

  const list = dueTasks.map((task) => `• ${task.title}`).join("\n");
  const message = `You have ${dueTasks.length} due task(s).`;

  showToast(message, list);
  showNotification(message, list);
}

function showToast(title, body) {
  toast.innerHTML = "";
  const heading = document.createElement("h3");
  const text = document.createElement("p");
  heading.textContent = title;
  text.textContent = body;
  toast.append(heading, text);
  toast.classList.add("visible");

  setTimeout(() => {
    toast.classList.remove("visible");
  }, 8000);
}

function showNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("Agenda Checklist", { body: `${title}\n${body}` });
    return;
  }
  if (Notification.permission === "default") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        new Notification("Agenda Checklist", { body: `${title}\n${body}` });
      }
    });
  }
}

function mapTask(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    title: data.title || "",
    notes: data.notes || "",
    dueDate: data.dueDate || "",
    priority: data.priority || "medium",
    tags: Array.isArray(data.tags) ? data.tags : [],
    completed: Boolean(data.completed),
    createdAt: toIsoString(data.createdAt) || new Date(0).toISOString(),
    updatedAt: toIsoString(data.updatedAt) || new Date().toISOString(),
  };
}

function toIsoString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return "";
}

function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}
