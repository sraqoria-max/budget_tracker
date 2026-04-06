const STORAGE_KEYS = {
  users: "bt_users",
  session: "bt_session",
  secure: "bt_secure_data"
};

const state = {
  currentUser: null,
  users: [],
  secureData: {},
  viewMonth: ""
};

const CURRENCY = "USD";

const authScreen = document.getElementById("authScreen");
const appScreen = document.getElementById("appScreen");
const authMessage = document.getElementById("authMessage");
const appMessage = document.getElementById("appMessage");

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: CURRENCY }).format(value || 0);
}

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function setAuthMessage(message, isError = true) {
  authMessage.textContent = message || "";
  authMessage.style.color = isError ? "#b91c1c" : "#15803d";
}

function setAppMessage(message, isError = false) {
  appMessage.textContent = message || "";
  appMessage.style.color = isError ? "#b91c1c" : "#15803d";
  if (message) {
    setTimeout(() => {
      appMessage.textContent = "";
    }, 2200);
  }
}

async function hashText(text) {
  const enc = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function loadUsers() {
  state.users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || "[]");
}

function saveUsers() {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(state.users));
}

async function saveSecureData() {
  const secret = await hashText(`app-secret-${state.currentUser.email}`);
  const payload = JSON.stringify(state.secureData);
  const merged = `${secret}|${payload}`;
  localStorage.setItem(STORAGE_KEYS.secure, btoa(unescape(encodeURIComponent(merged))));
}

async function loadSecureData() {
  const encoded = localStorage.getItem(STORAGE_KEYS.secure);
  if (!encoded) {
    state.secureData = {};
    return;
  }
  try {
    const merged = decodeURIComponent(escape(atob(encoded)));
    const payload = merged.split("|").slice(1).join("|");
    state.secureData = JSON.parse(payload || "{}");
  } catch {
    state.secureData = {};
  }
}

function getUserData() {
  if (!state.currentUser) return { expenses: [], incomes: [], budgets: {} };
  const data = state.secureData[state.currentUser.id] || { expenses: [], incomes: [], budgets: {} };
  return {
    expenses: data.expenses || [],
    incomes: data.incomes || [],
    budgets: data.budgets || {}
  };
}

function setUserData(data) {
  state.secureData[state.currentUser.id] = data;
  return saveSecureData();
}

function switchAuthTab(showLogin) {
  document.getElementById("loginForm").classList.toggle("hidden", !showLogin);
  document.getElementById("registerForm").classList.toggle("hidden", showLogin);
  document.getElementById("showLoginBtn").classList.toggle("active", showLogin);
  document.getElementById("showRegisterBtn").classList.toggle("active", !showLogin);
  setAuthMessage("");
}

function showApp() {
  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  document.getElementById("welcomeText").textContent = `Welcome, ${state.currentUser.name}`;
  renderAll();
}

function showAuth() {
  appScreen.classList.add("hidden");
  authScreen.classList.remove("hidden");
}

async function registerUser(name, email, password) {
  const found = state.users.some((u) => u.email.toLowerCase() === email.toLowerCase());
  if (found) throw new Error("Email already registered.");
  const passwordHash = await hashText(password);
  const user = { id: uid(), name, email, passwordHash };
  state.users.push(user);
  saveUsers();
  setAuthMessage("Account created. Please login.", false);
  switchAuthTab(true);
}

async function loginUser(email, password) {
  const passwordHash = await hashText(password);
  const user = state.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.passwordHash === passwordHash
  );
  if (!user) throw new Error("Invalid email or password.");
  state.currentUser = { id: user.id, name: user.name, email: user.email };
  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(state.currentUser));
  await loadSecureData();
  showApp();
}

function logoutUser() {
  state.currentUser = null;
  localStorage.removeItem(STORAGE_KEYS.session);
  showAuth();
}

function totalsForMonth(data, month) {
  const expenseTotal = data.expenses
    .filter((x) => (x.date || "").startsWith(month))
    .reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const incomeTotal = data.incomes
    .filter((x) => (x.date || "").startsWith(month))
    .reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const budget = Number(data.budgets[month] || 0);
  return { expenseTotal, incomeTotal, budget };
}

function renderDashboard(data) {
  const month = state.viewMonth || currentMonth();
  const { expenseTotal, incomeTotal, budget } = totalsForMonth(data, month);
  const balance = incomeTotal - expenseTotal;
  document.getElementById("incomeTotal").textContent = formatMoney(incomeTotal);
  document.getElementById("expenseTotal").textContent = formatMoney(expenseTotal);
  document.getElementById("budgetTotal").textContent = formatMoney(budget);
  const balanceEl = document.getElementById("balanceTotal");
  balanceEl.textContent = formatMoney(balance);
  balanceEl.style.color = balance >= 0 ? "#15803d" : "#b91c1c";

  const percent = budget > 0 ? Math.min(100, (expenseTotal / budget) * 100) : 0;
  const progress = document.getElementById("budgetProgressBar");
  if (progress) {
    progress.style.width = `${percent.toFixed(1)}%`;
    progress.style.background = percent < 80 ? "#15803d" : percent < 100 ? "#d97706" : "#b91c1c";
  }
  const budgetUsageText = document.getElementById("budgetUsageText");
  if (budgetUsageText) {
    budgetUsageText.textContent = budget > 0
      ? `${percent.toFixed(1)}% of budget used for ${month}`
      : "Set a monthly budget to track usage.";
  }
}

function rowHtml(item, type) {
  const label = type === "expense" ? item.category : item.source;
  return `
    <div class="item">
      <div class="item-main">
        <strong>${item.title || item.source}</strong>
        <span class="muted">${item.date} - ${label}</span>
      </div>
      <div class="item-actions">
        <strong>${formatMoney(item.amount)}</strong>
        <button class="mini-btn" data-edit="${type}:${item.id}">Edit</button>
        <button class="mini-btn" data-delete="${type}:${item.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderLists(data) {
  const expenses = [...data.expenses].sort((a, b) => (a.date < b.date ? 1 : -1));
  const incomes = [...data.incomes].sort((a, b) => (a.date < b.date ? 1 : -1));
  document.getElementById("expenseList").innerHTML =
    expenses.length ? expenses.map((x) => rowHtml(x, "expense")).join("") : "<p class='muted'>No expenses yet.</p>";
  document.getElementById("incomeList").innerHTML =
    incomes.length ? incomes.map((x) => rowHtml(x, "income")).join("") : "<p class='muted'>No income records yet.</p>";
}

function renderCategoryAnalytics(data) {
  const month = state.viewMonth || currentMonth();
  const monthly = data.expenses.filter((x) => (x.date || "").startsWith(month));
  const categoryTotals = monthly.reduce((map, item) => {
    map[item.category] = (map[item.category] || 0) + Number(item.amount || 0);
    return map;
  }, {});
  const entries = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 0;

  const report = document.getElementById("categoryReport");
  const bars = document.getElementById("analyticsBars");
  if (!entries.length) {
    report.innerHTML = "<p class='muted'>No category data for this month yet.</p>";
    if (bars) bars.innerHTML = "<p class='muted'>Add expenses to view analytics.</p>";
    return;
  }

  report.innerHTML = entries
    .map(([cat, amount]) => `<p><strong>${cat}</strong>: ${formatMoney(amount)}</p>`)
    .join("");

  if (bars) {
    bars.innerHTML = entries
      .map(([cat, amount]) => {
        const width = max ? ((amount / max) * 100).toFixed(1) : "0";
        return `
        <div class="bar-row">
          <span>${cat}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
          <strong>${formatMoney(amount)}</strong>
        </div>`;
      })
      .join("");
  }
}

function renderAll() {
  const data = getUserData();
  if (!state.viewMonth) state.viewMonth = currentMonth();
  renderDashboard(data);
  renderLists(data);
  renderCategoryAnalytics(data);
  document.getElementById("viewMonth").value = state.viewMonth;
  document.getElementById("budgetMonth").value = state.viewMonth;
  document.getElementById("expenseDate").value = new Date().toISOString().slice(0, 10);
  document.getElementById("incomeDate").value = new Date().toISOString().slice(0, 10);
  document.getElementById("budgetAmount").value = data.budgets[state.viewMonth] || "";
}

function openEdit(type, id) {
  const data = getUserData();
  const list = type === "expense" ? data.expenses : data.incomes;
  const row = list.find((x) => x.id === id);
  if (!row) return;

  const titleField = type === "expense" ? "title" : "source";
  const newName = prompt(`Edit ${titleField}`, row[titleField]);
  if (!newName) return;
  const newAmount = Number(prompt("Edit amount", String(row.amount)));
  if (Number.isNaN(newAmount) || newAmount < 0) {
    setAppMessage("Invalid amount.", true);
    return;
  }

  row[titleField] = newName.trim();
  row.amount = newAmount;
  if (type === "expense") {
    const newCategory = prompt("Edit category", row.category);
    if (newCategory) row.category = newCategory.trim();
  }
  setUserData(data).then(() => {
    renderAll();
    setAppMessage("Updated successfully.");
  });
}

function deleteRow(type, id) {
  const data = getUserData();
  if (type === "expense") data.expenses = data.expenses.filter((x) => x.id !== id);
  else data.incomes = data.incomes.filter((x) => x.id !== id);
  setUserData(data).then(() => {
    renderAll();
    setAppMessage("Deleted successfully.");
  });
}

document.getElementById("showLoginBtn").addEventListener("click", () => switchAuthTab(true));
document.getElementById("showRegisterBtn").addEventListener("click", () => switchAuthTab(false));

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;
  try {
    await registerUser(name, email, password);
  } catch (err) {
    setAuthMessage(err.message || "Unable to register.");
  }
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    await loginUser(email, password);
  } catch (err) {
    setAuthMessage(err.message || "Unable to login.");
  }
});

document.getElementById("logoutBtn").addEventListener("click", logoutUser);
document.getElementById("viewMonth").addEventListener("change", (e) => {
  state.viewMonth = e.target.value || currentMonth();
  const data = getUserData();
  document.getElementById("budgetAmount").value = data.budgets[state.viewMonth] || "";
  renderAll();
});

document.getElementById("budgetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = getUserData();
  const month = document.getElementById("budgetMonth").value;
  const amount = Number(document.getElementById("budgetAmount").value);
  if (!month || Number.isNaN(amount) || amount < 0) {
    setAppMessage("Please enter a valid month and budget.", true);
    return;
  }
  data.budgets[month] = amount;
  await setUserData(data);
  renderAll();
  setAppMessage("Monthly budget saved.");
});

document.getElementById("incomeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = getUserData();
  const income = {
    id: uid(),
    date: document.getElementById("incomeDate").value,
    source: document.getElementById("incomeSource").value.trim(),
    amount: Number(document.getElementById("incomeAmount").value)
  };
  if (!income.date || !income.source || Number.isNaN(income.amount) || income.amount < 0) {
    setAppMessage("Please provide valid income details.", true);
    return;
  }
  data.incomes.push(income);
  await setUserData(data);
  document.getElementById("incomeForm").reset();
  renderAll();
  setAppMessage("Income added.");
});

document.getElementById("expenseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = getUserData();
  const expense = {
    id: uid(),
    date: document.getElementById("expenseDate").value,
    title: document.getElementById("expenseTitle").value.trim(),
    category: document.getElementById("expenseCategory").value,
    amount: Number(document.getElementById("expenseAmount").value)
  };
  if (!expense.date || !expense.title || Number.isNaN(expense.amount) || expense.amount < 0) {
    setAppMessage("Please provide valid expense details.", true);
    return;
  }
  data.expenses.push(expense);
  await setUserData(data);
  document.getElementById("expenseForm").reset();
  renderAll();
  setAppMessage("Expense added.");
});

document.getElementById("expenseList").addEventListener("click", (e) => {
  const edit = e.target.getAttribute("data-edit");
  const del = e.target.getAttribute("data-delete");
  if (edit) {
    const [type, id] = edit.split(":");
    openEdit(type, id);
  }
  if (del) {
    const [type, id] = del.split(":");
    if (confirm("Delete this record?")) deleteRow(type, id);
  }
});

document.getElementById("incomeList").addEventListener("click", (e) => {
  const edit = e.target.getAttribute("data-edit");
  const del = e.target.getAttribute("data-delete");
  if (edit) {
    const [type, id] = edit.split(":");
    openEdit(type, id);
  }
  if (del) {
    const [type, id] = del.split(":");
    if (confirm("Delete this record?")) deleteRow(type, id);
  }
});

document.getElementById("backupBtn").addEventListener("click", () => {
  const backup = {
    version: 1,
    users: state.users,
    secureData: state.secureData,
    exportDate: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `budget-tracker-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setAppMessage("Backup downloaded.");
});

document.getElementById("restoreInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed.users || !parsed.secureData) throw new Error("Invalid backup file.");
    localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(parsed.users));
    localStorage.setItem(
      STORAGE_KEYS.secure,
      btoa(unescape(encodeURIComponent(`restored|${JSON.stringify(parsed.secureData)}`)))
    );
    loadUsers();
    await loadSecureData();
    renderAll();
    setAppMessage("Backup restored successfully.");
  } catch {
    setAppMessage("Restore failed. Please use a valid backup JSON.", true);
  } finally {
    e.target.value = "";
  }
});

async function boot() {
  loadUsers();
  const session = JSON.parse(localStorage.getItem(STORAGE_KEYS.session) || "null");
  if (!session) {
    showAuth();
    return;
  }
  state.currentUser = session;
  await loadSecureData();
  showApp();
}

boot();
