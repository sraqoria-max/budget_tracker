const STORAGE_KEYS = {
  session: "bt_session",
  secure: "bt_secure_data"
};

const CURRENCY = "USD";

const reportState = {
  session: null,
  secureData: {},
  month: new Date().toISOString().slice(0, 7)
};

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: CURRENCY }).format(value || 0);
}

function setMessage(message, isError = false) {
  const node = document.getElementById("reportsMessage");
  node.textContent = message || "";
  node.style.color = isError ? "#b91c1c" : "#15803d";
}

async function loadSecureData() {
  const encoded = localStorage.getItem(STORAGE_KEYS.secure);
  if (!encoded) {
    reportState.secureData = {};
    return;
  }
  try {
    const merged = decodeURIComponent(escape(atob(encoded)));
    const payload = merged.split("|").slice(1).join("|");
    reportState.secureData = JSON.parse(payload || "{}");
  } catch {
    reportState.secureData = {};
  }
}

function getUserData() {
  if (!reportState.session) return { expenses: [], incomes: [], budgets: {} };
  const data = reportState.secureData[reportState.session.id] || { expenses: [], incomes: [], budgets: {} };
  return {
    expenses: data.expenses || [],
    incomes: data.incomes || [],
    budgets: data.budgets || {}
  };
}

function totalsForMonth(data, month) {
  const expense = data.expenses
    .filter((x) => (x.date || "").startsWith(month))
    .reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const income = data.incomes
    .filter((x) => (x.date || "").startsWith(month))
    .reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const budget = Number(data.budgets[month] || 0);
  return { expense, income, budget };
}

function render() {
  const data = getUserData();
  const { expense, income, budget } = totalsForMonth(data, reportState.month);
  const savings = income - expense;

  document.getElementById("rIncome").textContent = formatMoney(income);
  document.getElementById("rExpense").textContent = formatMoney(expense);
  document.getElementById("rBudget").textContent = formatMoney(budget);
  const savingsNode = document.getElementById("rSavings");
  savingsNode.textContent = formatMoney(savings);
  savingsNode.style.color = savings >= 0 ? "#15803d" : "#b91c1c";

  const budgetPct = budget > 0 ? Math.min(100, (expense / budget) * 100) : 0;
  const bar = document.getElementById("rBudgetBar");
  bar.style.width = `${budgetPct.toFixed(1)}%`;
  bar.style.background = budgetPct < 80 ? "#15803d" : budgetPct < 100 ? "#d97706" : "#b91c1c";
  document.getElementById("rBudgetText").textContent = budget > 0
    ? `${budgetPct.toFixed(1)}% used in ${reportState.month}`
    : `No budget set for ${reportState.month}`;

  const monthlyExpenses = data.expenses.filter((x) => (x.date || "").startsWith(reportState.month));
  const totals = monthlyExpenses.reduce((map, e) => {
    map[e.category] = (map[e.category] || 0) + Number(e.amount || 0);
    return map;
  }, {});

  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 0;

  const pieNode = document.getElementById("rCategoryPie");
  const legendNode = document.getElementById("rCategoryLegend");
  const summaryNode = document.getElementById("rCategorySummary");
  const colors = ["#6366f1", "#8b5cf6", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444", "#14b8a6", "#f97316"];

  if (!entries.length) {
    pieNode.style.background = "#e9edff";
    legendNode.innerHTML = "<p class='muted'>No expense records for this month.</p>";
    summaryNode.innerHTML = "<p class='muted'>Category summary will appear once expenses are added.</p>";
    return;
  }

  let angle = 0;
  const segments = entries.map(([, amount], idx) => {
    const pct = expense > 0 ? (amount / expense) * 100 : 0;
    const start = angle;
    angle += pct;
    const end = angle;
    const color = colors[idx % colors.length];
    return { pct, start, end, color };
  });

  pieNode.style.background = `conic-gradient(${segments
    .map((s) => `${s.color} ${s.start.toFixed(2)}% ${s.end.toFixed(2)}%`)
    .join(", ")})`;

  legendNode.innerHTML = entries.map(([cat, amount], idx) => {
    const color = colors[idx % colors.length];
    const pct = expense > 0 ? ((amount / expense) * 100).toFixed(1) : "0.0";
    return `
      <div class="legend-item">
        <span class="legend-dot" style="background:${color}"></span>
        <span>${cat}</span>
        <strong>${pct}%</strong>
      </div>
    `;
  }).join("");

  summaryNode.innerHTML = entries.map(([cat, amount]) => {
    const pct = expense > 0 ? ((amount / expense) * 100).toFixed(1) : "0.0";
    return `<p><strong>${cat}</strong>: ${formatMoney(amount)} (${pct}%)</p>`;
  }).join("");
}

async function boot() {
  const session = JSON.parse(localStorage.getItem(STORAGE_KEYS.session) || "null");
  if (!session) {
    window.location.href = "index.html";
    return;
  }
  reportState.session = session;
  document.getElementById("reportsTitle").textContent = `${session.name}'s Reports & Analytics`;
  document.getElementById("reportMonth").value = reportState.month;
  await loadSecureData();
  render();
  setMessage("Reports loaded.");
}

document.getElementById("reportMonth").addEventListener("change", (e) => {
  reportState.month = e.target.value || new Date().toISOString().slice(0, 7);
  render();
});

boot();
