const storageKey = "agendaChecklist:v1";
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

let tasks = loadTasks();
let settings = loadSettings();
let reminderTimer = null;
let calendarState = buildInitialCalendarState();
let filters = {
  status: "all",
  priority: "all",
  search: "",
  sort: "created",
};

init();

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

function handleCreateTask(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  if (!title) return;

  const task = {
    id: crypto.randomUUID(),
    title,
    notes: notesInput.value.trim(),
    dueDate: dueDateInput.value || "",
    priority: priorityInput.value,
    tags: parseTags(tagsInput.value),
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  tasks.unshift(task);
  saveTasks();
  resetForm();
  render();
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

function toggleComplete(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;
  task.completed = !task.completed;
  task.updatedAt = new Date().toISOString();
  saveTasks();
  render();
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
  editForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const titleValue = editForm.querySelector(".edit-title").value.trim();
    if (!titleValue) return;

    task.title = titleValue;
    task.notes = editForm.querySelector(".edit-notes").value.trim();
    task.dueDate = editForm.querySelector(".edit-due-date").value || "";
    task.priority = editForm.querySelector(".edit-priority").value;
    task.tags = parseTags(editForm.querySelector(".edit-tags").value);
    task.updatedAt = new Date().toISOString();

    saveTasks();
    render();
  });

  cancelBtn.addEventListener("click", () => {
    item.classList.remove("editing");
  });
}

function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  saveTasks();
  render();
}

function clearCompleted() {
  tasks = tasks.filter((task) => !task.completed);
  saveTasks();
  render();
}

function clearAll() {
  if (!confirm("Delete all tasks?")) return;
  tasks = [];
  saveTasks();
  render();
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

function saveTasks() {
  localStorage.setItem(storageKey, JSON.stringify(tasks));
}

function loadTasks() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}
