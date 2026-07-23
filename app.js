const storeKey = "testflow-qa-state-v1";
const sessionKey = "testflow-qa-session-v1";
const legacySessionKey = "testflow-qa-current-user";
const sessionTimeoutMs = 30 * 60 * 1000;
const sessionTouchIntervalMs = 60 * 1000;

const seedState = {
  currentUserId: null,
  users: [
    { id: "u1", name: "Администратор", email: "admin@test.local", password: "admin123", role: "Admin", status: "approved", groupIds: ["g1"] },
    { id: "u2", name: "Анна QA", email: "anna@test.local", password: "test123", role: "QA", status: "approved", groupIds: ["g2"] },
  ],
  groups: [
    { id: "g1", name: "Regression", description: "Критичные проверки перед релизом" },
    { id: "g2", name: "Mobile", description: "Проверки мобильного клиента" },
  ],
  cases: [
    {
      id: "c1",
      title: "Авторизация по email",
      description: "Проверка входа зарегистрированного пользователя.",
      ownerId: "u1",
      assignedUserIds: ["u2"],
      groupIds: ["g1"],
      steps: [
        {
          id: "s1",
          precondition: "Пользователь зарегистрирован",
          action: "Открыть форму входа",
          expected: "Форма входа отображается",
          actual: "Форма открылась",
          comment: "",
          status: "passed",
        },
        {
          id: "s2",
          precondition: "Форма входа открыта",
          action: "Ввести email и пароль",
          expected: "Данные принимаются без ошибок",
          actual: "Поля заполнены",
          comment: "",
          status: "passed",
        },
        {
          id: "s3",
          precondition: "Данные введены",
          action: "Проверить переход в кабинет",
          expected: "Открывается кабинет пользователя",
          actual: "Кабинет открыт",
          comment: "",
          status: "passed",
        },
      ],
    },
    {
      id: "c2",
      title: "Восстановление пароля",
      description: "Пользователь получает ссылку восстановления.",
      ownerId: "u2",
      assignedUserIds: ["u2"],
      groupIds: ["g1", "g2"],
      steps: [
        {
          id: "s4",
          precondition: "Пользователь не авторизован",
          action: "Открыть страницу восстановления",
          expected: "Страница восстановления доступна",
          actual: "Страница открылась",
          comment: "",
          status: "passed",
        },
        {
          id: "s5",
          precondition: "Email зарегистрирован",
          action: "Отправить email",
          expected: "Письмо восстановления отправлено",
          actual: "Появилась ошибка отправки",
          comment: "Проверить почтовый сервис",
          status: "failed",
        },
        {
          id: "s6",
          precondition: "Письмо отправлено",
          action: "Проверить письмо",
          expected: "Письмо содержит рабочую ссылку",
          actual: "",
          comment: "",
          status: "untested",
        },
      ],
    },
  ],
  suites: [
    { id: "q1", title: "Smoke Web", description: "Быстрый набор проверок веб-приложения", groupIds: ["g1"], caseIds: ["c1", "c2"] },
    { id: "q2", title: "Mobile Login", description: "Логин и восстановление на мобильных устройствах", groupIds: ["g2"], caseIds: ["c2"] },
  ],
};

let state = cloneState(seedState);
const app = document.querySelector("#app");
let apiAvailable = false;

let view = "dashboard";
let authMode = "login";
let authNotice = "";
let appNotice = "";
let selectedGroupId = "all";
let selectedCaseSuiteId = "all";
let expandedCaseId = null;
let editingSuiteGroupIds = [];
let editingCaseId = null;
let editingSuiteId = null;
let userModalMode = null;
let editingUserId = null;
let groupModalMode = null;
let editingGroupId = null;

async function loadState() {
  const apiState = await loadApiState();
  const saved = localStorage.getItem(storeKey);
  const savedState = saved ? JSON.parse(saved) : null;
  const loadedState = apiState || savedState || cloneState(seedState);
  const session = currentSession();
  if (!loadedState.users || !loadedState.users.length) {
    return cloneState(seedState);
  }
  loadedState.groups = loadedState.groups || [];
  loadedState.cases = loadedState.cases || [];
  loadedState.suites = loadedState.suites || [];
  loadedState.users.forEach((user) => {
    const savedUser = savedState && savedState.users ? savedState.users.find((item) => item.id === user.id) : null;
    if (savedUser) {
      if (!user.status) {
        user.status = savedUser.status;
      }
      if (!user.requestedAt && savedUser.requestedAt) {
        user.requestedAt = savedUser.requestedAt;
      }
    }
    user.role = normalizeRole(user.role);
    user.status = normalizeUserStatus(user.status);
    user.groupIds = user.groupIds || [];
    if (!user.activeSessionToken && savedUser && savedUser.activeSessionToken === session.token) {
      user.activeSessionToken = savedUser.activeSessionToken;
      user.lastActivityAt = savedUser.lastActivityAt;
    }
  });
  loadedState.cases.forEach((testCase) => {
    testCase.steps = testCase.steps.map(normalizeStep);
    testCase.groupIds = testCase.groupIds || [];
    testCase.assignedUserIds = normalizeAssignedUsers(testCase);
  });
  loadedState.remoteUsers = apiState && apiState.users ? cloneState(apiState.users) : [];
  const sessionUser = loadedState.users.find((user) => user.id === session.userId);
  loadedState.currentUserId = isValidSession(session, sessionUser) ? session.userId : null;
  if (!loadedState.currentUserId) {
    clearSession();
  }
  return loadedState;
}

function saveState() {
  const { remoteUsers, ...stateForSave } = state;
  const persistedState = { ...stateForSave, currentUserId: null };
  localStorage.setItem(storeKey, JSON.stringify(persistedState));
  saveApiState(mergeWithRemoteState(persistedState));
}

function mergeWithRemoteState(nextState) {
  if (!state.remoteUsers) return nextState;

  const users = nextState.users.map((user) => {
    const remoteUser = state.remoteUsers.find((item) => item.id === user.id);
    if (!remoteUser) return user;
    if (normalizeUserStatus(remoteUser.status) === "approved" && normalizeUserStatus(user.status) === "pending") {
      return { ...user, status: "approved", requestedAt: remoteUser.requestedAt || user.requestedAt };
    }
    return user;
  });

  return { ...nextState, users };
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function currentSession() {
  const rawSession = localStorage.getItem(sessionKey) || sessionStorage.getItem(sessionKey);
  if (rawSession) {
    try {
      return JSON.parse(rawSession);
    } catch {
      return { userId: rawSession };
    }
  }
  return { userId: localStorage.getItem(legacySessionKey) };
}

function rememberSession(user) {
  const session = { userId: user.id, token: id("t"), lastActivityAt: Date.now() };
  user.activeSessionToken = session.token;
  user.lastActivityAt = session.lastActivityAt;
  localStorage.setItem(sessionKey, JSON.stringify(session));
  sessionStorage.setItem(sessionKey, JSON.stringify(session));
  localStorage.removeItem(legacySessionKey);
}

function clearSession() {
  localStorage.removeItem(sessionKey);
  sessionStorage.removeItem(sessionKey);
  localStorage.removeItem(legacySessionKey);
}

function isValidSession(session, user) {
  if (!session || !session.userId || !user) return false;
  if (normalizeUserStatus(user.status) !== "approved") return false;
  if (!session.token || user.activeSessionToken !== session.token) return false;
  return Date.now() - Number(session.lastActivityAt || 0) <= sessionTimeoutMs;
}

function touchSession() {
  const user = currentUser();
  const session = currentSession();
  if (!isValidSession(session, user)) {
    state.currentUserId = null;
    clearSession();
    authNotice = "Сессия завершена. Войдите снова.";
    renderAuth();
    return false;
  }

  const now = Date.now();
  if (now - Number(session.lastActivityAt || 0) < sessionTouchIntervalMs) return true;

  const nextSession = { ...session, lastActivityAt: now };
  user.lastActivityAt = now;
  localStorage.setItem(sessionKey, JSON.stringify(nextSession));
  sessionStorage.setItem(sessionKey, JSON.stringify(nextSession));
  saveState();
  return true;
}

async function checkRemoteSession() {
  const user = currentUser();
  if (!user) return;

  const session = currentSession();
  const apiState = await loadApiState();
  const remoteUser = apiState && apiState.users ? apiState.users.find((item) => item.id === user.id) : null;
  if (!isValidSession(session, remoteUser)) {
    state.currentUserId = null;
    clearSession();
    renderAuth();
  }
}

async function loadApiState() {
  try {
    const response = await fetch("api/index.php?action=state", { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    apiAvailable = true;
    return payload;
  } catch {
    apiAvailable = false;
    return null;
  }
}

async function saveApiState(nextState) {
  if (!apiAvailable) return;

  try {
    const response = await fetch("api/index.php?action=state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextState),
    });
    apiAvailable = response.ok;
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      console.error("Не удалось сохранить данные в API", payload);
      notify(payload.error ? `Ошибка сохранения: ${payload.error}` : "Ошибка сохранения в БД.");
    } else {
      state.remoteUsers = cloneState(nextState.users || []);
    }
  } catch {
    apiAvailable = false;
    console.error("API недоступен, данные сохранены только локально.");
  }
}

function id(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function currentUser() {
  return state.users.find((user) => user.id === state.currentUserId);
}

function normalizeRole(role = "QA") {
  const normalized = String(role).trim().toLowerCase();
  if (normalized === "admin" || normalized === "qa lead") return "Admin";
  if (normalized === "manager") return "Manager";
  if (normalized === "qa" || normalized === "tester") return "QA";
  return "QA";
}

function normalizeUserStatus(status = "approved") {
  const normalized = String(status).trim().toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "rejected") return "rejected";
  return "approved";
}

function isPendingUser(user) {
  return normalizeUserStatus(user.status) === "pending";
}

function userStatusLabel(status) {
  const labels = {
    approved: "Одобрен",
    pending: "Ожидает одобрения",
    rejected: "Отклонён",
  };
  return labels[normalizeUserStatus(status)];
}

function roleLabel(role) {
  return normalizeRole(role);
}

function isAdmin(user = currentUser()) {
  return normalizeRole(user && user.role) === "Admin";
}

function isManager(user = currentUser()) {
  return normalizeRole(user && user.role) === "Manager";
}

function canManageCases(user = currentUser()) {
  return isAdmin(user) || isManager(user);
}

function canCreateCases(user = currentUser()) {
  return Boolean(user) && (isAdmin(user) || isManager(user) || normalizeRole(user.role) === "QA");
}

function canEditCase(testCase, user = currentUser()) {
  if (!testCase || !user) return false;
  if (canManageCases(user)) return true;
  return hasSharedGroup(testCase.groupIds, user.groupIds) || normalizeAssignedUsers(testCase).includes(user.id);
}

function canDeleteCase(user = currentUser()) {
  return isAdmin(user);
}

function canManageSuites(user = currentUser()) {
  return isAdmin(user) || isManager(user);
}

function canManageGroups(user = currentUser()) {
  return isAdmin(user) || isManager(user);
}

function canManageUsers(user = currentUser()) {
  return isAdmin(user);
}

function canAssignQa(user = currentUser()) {
  return isAdmin(user) || isManager(user);
}

function canOpenView(target, user = currentUser()) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (isManager(user)) return true;
  if (normalizeRole(user.role) === "QA") return ["dashboard", "cases", "create-case", "edit-case"].includes(target);
  return false;
}

function pendingUsers() {
  return state.users.filter(isPendingUser);
}

function canUseCase(testCase, user = currentUser()) {
  if (!testCase || !user) return false;
  if (canManageCases(user)) return true;
  return hasSharedGroup(testCase.groupIds, user.groupIds) || normalizeAssignedUsers(testCase).includes(user.id);
}

function canEditUserGroups(targetUser, user = currentUser()) {
  if (isAdmin(user)) return true;
  return isManager(user) && normalizeRole(targetUser.role) === "QA";
}

function canViewUserDetails(targetUser, user = currentUser()) {
  return canManageUsers(user) || isManager(user) || canEditUserGroups(targetUser, user);
}

function normalizeAssignedUsers(testCase) {
  const assigned = testCase.assignedUserIds || [];
  const owner = state.users.find((user) => user.id === testCase.ownerId);
  const fallbackOwner = normalizeRole(owner && owner.role) === "QA" ? [testCase.ownerId] : [];
  return Array.from(new Set([...assigned, ...fallbackOwner].filter(Boolean)));
}

function hasSharedGroup(groupIds = [], userGroupIds = []) {
  return groupIds.some((groupId) => userGroupIds.includes(groupId));
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeStep(step) {
  return {
    id: step.id || id("s"),
    precondition: step.precondition || "",
    action: step.action || step.title || "",
    expected: step.expected || "",
    actual: step.actual || "",
    comment: step.comment || "",
    status: step.status || "untested",
  };
}

function progressForCase(testCase) {
  const total = testCase.steps.length;
  const passed = testCase.steps.filter((step) => step.status === "passed").length;
  const failed = testCase.steps.filter((step) => step.status === "failed").length;
  return {
    total,
    passed,
    failed,
    untested: total - passed - failed,
    passPercent: total ? Math.round((passed / total) * 100) : 0,
    failPercent: total ? Math.round((failed / total) * 100) : 0,
  };
}

function aggregate(cases = state.cases) {
  const totals = cases.reduce(
    (acc, item) => {
      const progress = progressForCase(item);
      acc.total += progress.total;
      acc.passed += progress.passed;
      acc.failed += progress.failed;
      acc.untested += progress.untested;
      return acc;
    },
    { total: 0, passed: 0, failed: 0, untested: 0 },
  );
  return {
    ...totals,
    passPercent: totals.total ? Math.round((totals.passed / totals.total) * 100) : 0,
    failPercent: totals.total ? Math.round((totals.failed / totals.total) * 100) : 0,
  };
}

function render() {
  if (!currentUser()) {
    renderAuth();
    return;
  }

  app.innerHTML = `
    <section class="app-shell">
      <aside class="sidebar">
        <div class="logo">TestFlow QA</div>
        <nav class="nav">
          ${navButton("dashboard", "▦", "Дашборд")}
          ${navButton("cases", "✓", "Кейсы")}
          ${canManageSuites() ? navButton("suites", "▣", "Сьюты") : ""}
          ${isAdmin() || isManager() ? navButton("groups", "◌", "Группы") : ""}
          ${isAdmin() || isManager() ? navButton("users", "◎", "Пользователи") : ""}
          ${isAdmin() ? navButton("registration-requests", "◍", `Заявки${pendingUsers().length ? ` (${pendingUsers().length})` : ""}`) : ""}
        </nav>
        <div class="sidebar-user">
          <div>
            <strong>${escapeHtml(currentUser().name)}</strong>
            <div class="muted">${escapeHtml(roleLabel(currentUser().role))}</div>
          </div>
          <button class="secondary" data-action="logout">Выйти</button>
        </div>
      </aside>
      <section class="content">${renderAppNotice()}${renderView()}</section>
    </section>
  `;
}

function renderAppNotice() {
  if (!appNotice) return "";
  const text = appNotice;
  appNotice = "";
  return `<p class="notice app-notice">${escapeHtml(text)}</p>`;
}

function notify(text) {
  appNotice = text;
}

function navButton(target, icon, label) {
  const active =
    view === target ||
    (target === "cases" && ["create-case", "edit-case"].includes(view)) ||
    (target === "suites" && ["create-suite", "edit-suite"].includes(view));
  return `<button class="${active ? "active" : ""}" data-view="${target}"><span>${icon}</span>${label}</button>`;
}

function topbar(kicker, title, text, action = "") {
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">${kicker}</p>
        <h1>${title}</h1>
        <p class="muted">${text}</p>
      </div>
      <div class="toolbar">${action}</div>
    </header>
  `;
}

function renderView() {
  if (!canOpenView(view)) {
    view = "cases";
  }

  const views = {
    dashboard: renderDashboard,
    cases: renderCases,
    "create-case": renderCreateCase,
    "edit-case": renderEditCase,
    suites: renderSuites,
    "create-suite": renderCreateSuite,
    "edit-suite": renderEditSuite,
    groups: renderGroups,
    users: renderUsers,
    "registration-requests": renderRegistrationRequests,
  };
  return views[view]();
}

function renderDashboard() {
  const cases = visibleCases();
  const suites = visibleSuites();
  const stats = aggregate(cases);
  const recentCases = cases.slice(0, 4).map(renderCaseCard).join("");

  return `
    ${topbar("Обзор", "Контроль прохождения тестов", "Общий процент успешных и упавших шагов считается по доступным кейсам.")}
    <section class="grid stats">
      ${stat("Кейсов", cases.length)}
      ${stat("Сьютов", suites.length)}
      ${stat("Успешно", `${stats.passPercent}%`)}
      ${stat("Не успешно", `${stats.failPercent}%`)}
    </section>
    <section class="grid two-col" style="margin-top:16px">
      <div class="panel">
        <div class="panel-title"><h2>Прогресс</h2><span class="badge success">${stats.passed}/${stats.total} успешно</span></div>
        ${progressBar(stats)}
        <p class="muted">${stats.failed} шагов упало, ${Math.max(stats.total - stats.passed - stats.failed, 0)} еще без результата.</p>
      </div>
      <div class="panel">
        <div class="panel-title"><h2>Группы</h2>${isAdmin() || isManager() ? `<button class="secondary" data-view="groups">Открыть</button>` : ""}</div>
        <div class="badge-row">${visibleGroups().map((group) => `<span class="badge">${escapeHtml(group.name)}</span>`).join("") || `<span class="muted">Группы не назначены</span>`}</div>
      </div>
    </section>
    <section class="panel" style="margin-top:16px">
      <div class="panel-title"><h2>Последние кейсы</h2><button class="secondary" data-view="cases">Все кейсы</button></div>
      <div class="case-list">${recentCases || empty("Кейсов пока нет")}</div>
    </section>
  `;
}

function stat(label, value) {
  return `<article class="stat"><span class="muted">${label}</span><strong>${value}</strong></article>`;
}

function progressBar(progress) {
  const total = progress.total || 0;
  if (!total) {
    return `<div class="progress" aria-label="Прогресс"><span class="progress-empty" style="width:100%"></span></div>`;
  }

  const passed = Math.round(((progress.passed || 0) / total) * 100);
  const failed = Math.round(((progress.failed || 0) / total) * 100);
  const untested = Math.max(0, 100 - passed - failed);
  return `
    <div class="progress" aria-label="Прогресс">
      <span class="progress-passed" style="width:${passed}%"></span>
      <span class="progress-untested" style="width:${untested}%"></span>
      <span class="progress-failed" style="width:${failed}%"></span>
    </div>
  `;
}

function renderCases() {
  const filtered = filterCasesBySuite(visibleCases());
  return `
    ${topbar(
      "Тест-кейсы",
      "Кейсы",
      "Список кейсов, их сьюты, группы, ответственные и текущий прогресс по строкам проверки.",
      canCreateCases() ? `<button class="primary" data-view="create-case">Создать кейс</button>` : "",
    )}
    ${renderCaseSuiteFilters()}
    <section>
      <div class="case-list">${filtered.map(renderCaseCard).join("") || empty("Нет кейсов в выбранном сьюте")}</div>
    </section>
  `;
}

function renderCreateCase() {
  if (!canCreateCases()) return forbidden();
  const availableSuites = suitesForCurrentUser();

  return `
    ${topbar(
      "Новый кейс",
      "Создание кейса",
      "Заполните описание, выберите сьюты и добавьте строки проверки с ожидаемым и фактическим результатом.",
      `<button class="secondary" data-view="cases">Назад к кейсам</button>`,
    )}
    <section class="panel form-page">
      <form class="form-stack" data-form="case">
        <label>Название<input name="title" required placeholder="Например, оформление заказа" /></label>
        <label>Описание<textarea name="description" placeholder="Что проверяем"></textarea></label>
        <label>Ответственный<select name="ownerId">${renderOwnerOptions()}</select></label>
        ${canAssignQa() ? `<label>Назначенные QA<select name="assignedUserIds" multiple size="4">${renderQaOptions()}</select></label>` : ""}
        <label>Сьюты<select name="suiteIds" multiple size="4" ${availableSuites.length ? "" : "disabled"}>${renderSuiteOptions([], availableSuites)}</select></label>
        ${availableSuites.length ? "" : `<p class="muted">Для создания кейса нужно быть назначенным хотя бы в одну группу со сьютом.</p>`}
        <div class="step-list step-table" data-steps>
          ${renderStepInputRow("add")}
        </div>
        <div class="toolbar">
          <button class="primary">Создать кейс</button>
          <button class="secondary" type="button" data-view="cases">Отмена</button>
        </div>
      </form>
    </section>
  `;
}

function renderCaseCard(testCase) {
  const progress = progressForCase(testCase);
  const editable = canEditCase(testCase);
  const expanded = expandedCaseId === testCase.id;
  return `
    <article class="item-card case-card ${expanded ? "expanded" : ""}">
      <button class="case-summary" data-toggle-case="${testCase.id}" aria-expanded="${expanded ? "true" : "false"}">
        <div>
          <h3><span class="case-caret">${expanded ? "−" : "+"}</span>${escapeHtml(testCase.title)}</h3>
          <p class="muted">${escapeHtml(testCase.description)}</p>
        </div>
        <span class="badge">${testCase.steps.length} шагов</span>
      </button>
      <div class="badge-row">
        ${suiteBadges(testCase.id)}
        ${groupBadges(testCase.groupIds)}
        <span class="badge">${ownerName(testCase.ownerId)}</span>
        ${assignedQaBadges(testCase.assignedUserIds)}
        <span class="badge success">${progress.passPercent}% успешно</span>
        <span class="badge danger">${progress.failPercent}% не успешно</span>
      </div>
      ${progressBar(progress)}
      ${
        expanded
          ? `<div class="item-actions">
          ${editable ? `<button class="secondary" data-edit-case="${testCase.id}">Редактировать</button>` : ""}
        </div>
      <div class="step-table-wrap">
        <div class="case-step-grid step-header">
          <span>Предусловие</span>
          <span>Шаги</span>
          <span>ОР</span>
          <span>ФР</span>
          <span>Комментарии</span>
          <span>Статус результата</span>
          <span></span>
        </div>
        <div class="step-list">
          ${testCase.steps.map((step) => renderStatusOnlyStepRow(testCase.id, step)).join("") || empty("Шагов пока нет")}
        </div>
      </div>`
          : ""
      }
    </article>
  `;
}

function renderEditCase() {
  const testCase = state.cases.find((item) => item.id === editingCaseId);
  if (!testCase) {
    view = "cases";
    return renderCases();
  }
  if (!canEditCase(testCase)) return forbidden();

  const availableSuites = suitesForCurrentUser(testCase);
  const selectedSuiteIds = suiteIdsForCase(testCase.id);

  return `
    ${topbar(
      "Редактирование",
      escapeHtml(testCase.title),
      "Здесь можно редактировать, удалять и добавлять строки проверки, а также менять сьюты кейса.",
      `<button class="secondary" data-view="cases">Назад к кейсам</button>${canDeleteCase() ? `<button class="danger" data-delete-case="${testCase.id}">Удалить кейс</button>` : ""}`,
    )}
    <section class="panel form-page">
      <form class="form-stack" data-form="edit-case">
        <label>Название<input name="title" required value="${escapeHtml(testCase.title)}" /></label>
        <label>Описание<textarea name="description" placeholder="Что проверяем">${escapeHtml(testCase.description)}</textarea></label>
        ${canAssignQa() ? `<label>Назначенные QA<select name="assignedUserIds" multiple size="4">${renderQaOptions(testCase.assignedUserIds)}</select></label>` : ""}
        <label>Сьюты<select name="suiteIds" multiple size="4">${renderSuiteOptions(selectedSuiteIds, availableSuites)}</select></label>
        <div>
          <h2>Текущие шаги</h2>
          <div class="step-table-wrap" style="margin-top:12px">
            <div class="case-step-grid step-header">
              <span>Предусловие</span>
              <span>Шаги</span>
              <span>ОР</span>
              <span>ФР</span>
              <span>Комментарии</span>
              <span>Статус результата</span>
              <span></span>
            </div>
            ${
              testCase.steps.map((step) => renderEditableStepRow(testCase.id, step)).join("") || `<p class="muted">Шагов пока нет</p>`
            }
          </div>
        </div>
        <h2>Добавить строки</h2>
        <div class="step-list step-table" data-steps>
          ${renderStepInputRow("add")}
        </div>
        <div class="toolbar">
          <button class="primary">Сохранить строки</button>
          <button class="secondary" type="button" data-view="cases">Отмена</button>
        </div>
      </form>
    </section>
  `;
}

function renderStepInputRow(action = "add") {
  const isRemove = action === "remove";
  const buttonClass = isRemove ? "step-action danger-step" : "step-action add-step";
  const buttonAction = isRemove ? "remove-new-step" : "add-step";
  const buttonLabel = isRemove ? "-" : "+";
  return `
    <div class="case-step-grid step-input-row" data-new-step-row>
      <label>Предусловие<textarea name="stepPrecondition" placeholder="Что должно быть готово"></textarea></label>
      <label>Шаги<textarea name="stepAction" placeholder="Действие или проверка"></textarea></label>
      <label>ОР<textarea name="stepExpected" placeholder="Ожидаемый результат"></textarea></label>
      <label>ФР<textarea name="stepActual" placeholder="Фактический результат"></textarea></label>
      <label>Комментарии<textarea name="stepComment" placeholder="Заметки, ссылки, дефекты"></textarea></label>
      <label>Статус результата<select name="stepStatus">${statusOptions()}</select></label>
      <button class="${buttonClass}" type="button" data-action="${buttonAction}">${buttonLabel}</button>
    </div>
  `;
}

function renderEditableStepRow(caseId, step) {
  return `
    <div class="case-step-grid step-input-row">
      <label>Предусловие<textarea data-step-field="${caseId}:${step.id}:precondition">${escapeHtml(step.precondition)}</textarea></label>
      <label>Шаги<textarea data-step-field="${caseId}:${step.id}:action">${escapeHtml(step.action)}</textarea></label>
      <label>ОР<textarea data-step-field="${caseId}:${step.id}:expected">${escapeHtml(step.expected)}</textarea></label>
      <label>ФР<textarea data-step-field="${caseId}:${step.id}:actual">${escapeHtml(step.actual)}</textarea></label>
      <label>Комментарии<textarea data-step-field="${caseId}:${step.id}:comment">${escapeHtml(step.comment)}</textarea></label>
      <label>Статус результата<select data-step-status="${caseId}:${step.id}">${statusOptions(step.status)}</select></label>
      <button class="step-action danger-step" data-delete-step="${caseId}:${step.id}">-</button>
    </div>
  `;
}

function renderStatusOnlyStepRow(caseId, step) {
  return `
    <div class="case-step-grid readonly-step">
      <span>${escapeHtml(step.precondition) || "—"}</span>
      <span>${escapeHtml(step.action) || "—"}</span>
      <span>${escapeHtml(step.expected) || "—"}</span>
      <span>${escapeHtml(step.actual) || "—"}</span>
      <span>${escapeHtml(step.comment) || "—"}</span>
      <label class="status-only"><span>Статус результата</span><select data-step-status="${caseId}:${step.id}">${statusOptions(step.status)}</select></label>
      <span></span>
    </div>
  `;
}

function collectStepRows(form) {
  return Array.from(form.querySelectorAll("[data-new-step-row]"))
    .map((row) =>
      normalizeStep({
        id: id("s"),
        precondition: row.querySelector('[name="stepPrecondition"]').value.trim(),
        action: row.querySelector('[name="stepAction"]').value.trim(),
        expected: row.querySelector('[name="stepExpected"]').value.trim(),
        actual: row.querySelector('[name="stepActual"]').value.trim(),
        comment: row.querySelector('[name="stepComment"]').value.trim(),
        status: row.querySelector('[name="stepStatus"]').value,
      }),
    )
    .filter((step) => step.precondition || step.action || step.expected || step.actual || step.comment);
}

function findStep(caseId, stepId) {
  const testCase = state.cases.find((item) => item.id === caseId);
  return testCase ? testCase.steps.find((item) => item.id === stepId) : null;
}

function renderSuites() {
  if (!canManageSuites()) return forbidden();
  const filtered = filterByGroup(visibleSuites());
  return `
    ${topbar(
      "Сьюты",
      "Наборы тест-кейсов",
      "Список сьютов, привязанных кейсов, групп и агрегированного прогресса.",
      `<button class="primary" data-view="create-suite">Создать сьют</button>`,
    )}
    ${renderGroupFilters()}
    <section>
      <div class="suite-list">${filtered.map(renderSuiteCard).join("") || empty("Нет сьютов в выбранной группе")}</div>
    </section>
  `;
}

function renderCreateSuite() {
  if (!canManageSuites()) return forbidden();

  return `
    ${topbar(
      "Новый сьют",
      "Создание сьюта",
      "Выберите группы и кейсы, которые должны входить в набор проверок.",
      `<button class="secondary" data-view="suites">Назад к сьютам</button>`,
    )}
    <section class="panel form-page">
      <form class="form-stack" data-form="suite">
        <label>Название<input name="title" required placeholder="Например, Release 2.4" /></label>
        <label>Описание<textarea name="description" placeholder="Назначение набора"></textarea></label>
        <label>Группы<select name="groupIds" multiple size="4">${renderGroupOptions()}</select></label>
        <label>Кейсы<select name="caseIds" multiple size="6">${state.cases.map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`).join("")}</select></label>
        <div class="toolbar">
          <button class="primary">Создать сьют</button>
          <button class="secondary" type="button" data-view="suites">Отмена</button>
        </div>
      </form>
    </section>
  `;
}

function renderSuiteCard(suite) {
  const cases = suite.caseIds.map((caseId) => state.cases.find((item) => item.id === caseId)).filter(Boolean);
  const stats = aggregate(cases);
  return `
    <article class="item-card">
      <div class="item-head">
        <div>
          <h3>${escapeHtml(suite.title)}</h3>
          <p class="muted">${escapeHtml(suite.description)}</p>
        </div>
        <div class="item-actions">
          <button class="secondary" data-edit-suite="${suite.id}">Редактировать</button>
          ${isAdmin() ? `<button class="danger" data-delete-suite="${suite.id}">Удалить</button>` : ""}
        </div>
      </div>
      <div class="badge-row">${groupBadges(suite.groupIds)}<span class="badge">${cases.length} кейсов</span><span class="badge success">${stats.passPercent}% успешно</span><span class="badge danger">${stats.failPercent}% не успешно</span></div>
      ${progressBar(stats)}
      <div class="badge-row">${cases.map((item) => `<span class="badge">${escapeHtml(item.title)}</span>`).join("") || `<span class="muted">Кейсы не выбраны</span>`}</div>
    </article>
  `;
}

function renderEditSuite() {
  if (!canManageSuites()) return forbidden();

  const suite = state.suites.find((item) => item.id === editingSuiteId);
  if (!suite) {
    view = "suites";
    return renderSuites();
  }

  const currentCases = suite.caseIds.map((caseId) => state.cases.find((item) => item.id === caseId)).filter(Boolean);
  const activeGroupIds = editingSuiteGroupIds;
  const availableCases = state.cases.filter(
    (item) =>
      !suite.caseIds.includes(item.id) &&
      (!activeGroupIds.length || item.groupIds.some((groupId) => activeGroupIds.includes(groupId))),
  );

  return `
    ${topbar(
      "Редактирование",
      escapeHtml(suite.title),
      "Выберите группы сьюта и добавьте готовые кейсы только из этих групп.",
      `<button class="secondary" data-view="suites">Назад к сьютам</button>`,
    )}
    <section class="panel form-page">
      <form class="form-stack" data-form="edit-suite">
        <label>Группы
          <select name="groupIds" multiple size="4" data-edit-suite-groups>
            ${renderGroupOptions(activeGroupIds)}
          </select>
        </label>
        <div>
          <h2>Текущие кейсы</h2>
          <div class="badge-row" style="margin-top:12px">
            ${currentCases.map((item) => `<span class="badge">${escapeHtml(item.title)}</span>`).join("") || `<span class="muted">Кейсы не выбраны</span>`}
          </div>
        </div>
        <label>Добавить кейсы
          <select name="caseIds" multiple size="6" ${availableCases.length ? "" : "disabled"}>
            ${availableCases.map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`).join("")}
          </select>
        </label>
        ${availableCases.length ? "" : `<p class="muted">В выбранных группах нет доступных кейсов для добавления.</p>`}
        <div class="toolbar">
          <button class="primary">Сохранить сьют</button>
          <button class="secondary" type="button" data-view="suites">Отмена</button>
        </div>
      </form>
    </section>
  `;
}

function renderGroups() {
  if (!isAdmin() && !isManager()) return forbidden();

  return `
    ${topbar(
      "Группы",
      "Группы пользователей, кейсов и сьютов",
      "Открывайте группу для редактирования названия, описания и просмотра состава.",
      canManageGroups() ? `<button class="primary" data-open-group-create>Новая группа</button>` : "",
    )}
    <section class="panel">
      <div class="data-table group-table">
        <div class="data-table-row group-table-row data-table-head">
          <span>Название</span>
          <span>Описание</span>
          <span>Кейсы</span>
          <span>Сьюты</span>
          <span>Пользователи</span>
          <span></span>
        </div>
        ${visibleGroups().map(renderGroupRow).join("") || empty("Групп пока нет")}
      </div>
    </section>
    ${renderGroupModal()}
  `;
}

function renderGroupRow(group) {
  const caseCount = state.cases.filter((item) => item.groupIds.includes(group.id)).length;
  const suiteCount = state.suites.filter((item) => item.groupIds.includes(group.id)).length;
  const userCount = state.users.filter((item) => item.groupIds.includes(group.id)).length;
  return `
    <div class="data-table-row group-table-row">
      <strong>${escapeHtml(group.name)}</strong>
      <span>${escapeHtml(group.description || "Без описания")}</span>
      <span>${caseCount}</span>
      <span>${suiteCount}</span>
      <span>${userCount}</span>
      <button class="secondary" data-open-group-edit="${group.id}">Открыть</button>
    </div>
  `;
}

function renderGroupModal() {
  if (!groupModalMode) return "";
  const isCreate = groupModalMode === "create";
  const group = isCreate ? null : state.groups.find((item) => item.id === editingGroupId);
  if (!isCreate && !group) return "";
  const caseCount = group ? state.cases.filter((item) => item.groupIds.includes(group.id)).length : 0;
  const suiteCount = group ? state.suites.filter((item) => item.groupIds.includes(group.id)).length : 0;
  const userCount = group ? state.users.filter((item) => item.groupIds.includes(group.id)).length : 0;

  return `
    <div class="modal-backdrop" data-close-group-modal>
      <section class="modal-panel" role="dialog" aria-modal="true">
        <div class="panel-title">
          <h2>${isCreate ? "Новая группа" : escapeHtml(group.name)}</h2>
          <button class="secondary" data-close-group-modal type="button">Закрыть</button>
        </div>
        <form class="form-stack" data-form="${isCreate ? "group" : "group-update"}" ${isCreate ? "" : `data-group-id="${group.id}"`}>
          <label>Название<input name="name" required placeholder="Например, Billing" value="${isCreate ? "" : escapeHtml(group.name)}" /></label>
          <label>Описание<textarea name="description" placeholder="Контекст группы">${isCreate ? "" : escapeHtml(group.description)}</textarea></label>
          ${isCreate ? "" : `<div class="badge-row"><span class="badge">${caseCount} кейсов</span><span class="badge">${suiteCount} сьютов</span><span class="badge">${userCount} пользователей</span></div>`}
          <div class="toolbar">
            <button class="primary">${isCreate ? "Создать группу" : "Сохранить группу"}</button>
            ${!isCreate && isAdmin() ? `<button class="danger" type="button" data-delete-group="${group.id}">Удалить</button>` : ""}
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderUsers() {
  if (!isAdmin() && !isManager()) return forbidden();
  const users = isAdmin() ? state.users : state.users.filter((user) => normalizeUserStatus(user.status) === "approved");

  return `
    ${topbar(
      "Пользователи",
      "Команды и доступ",
      isAdmin() ? "Открывайте карточку пользователя для редактирования или добавляйте нового." : "Manager может открывать QA и назначать их в группы.",
      isAdmin() ? `<button class="primary" data-open-user-create>Новый пользователь</button>` : "",
    )}
    <section class="panel">
      <div class="user-table">
        <div class="user-table-row user-table-head">
          <span>Имя</span>
          <span>Email</span>
          <span>Роль</span>
          <span>Статус</span>
          <span>Группы</span>
          <span></span>
        </div>
        ${users.map(renderUserRow).join("") || empty("Пользователей пока нет")}
      </div>
    </section>
    ${renderUserModal()}
  `;
}

function renderRegistrationRequests() {
  if (!isAdmin()) return forbidden();
  const requests = pendingUsers();

  return `
    ${topbar("Регистрация", "Заявки на регистрацию", "Новые пользователи ждут одобрения администратора перед первым входом.")}
    <section class="user-list">
      ${requests.map(renderRegistrationRequestCard).join("") || empty("Новых заявок нет")}
    </section>
  `;
}

function renderRegistrationRequestCard(user) {
  const requestedAt = user.requestedAt ? new Date(Number(user.requestedAt)).toLocaleString("ru-RU") : "Дата не указана";
  return `
    <article class="item-card">
      <form class="form-stack" data-form="registration-request" data-user-id="${user.id}">
        <div class="item-head">
          <div>
            <h3>${escapeHtml(user.name)}</h3>
            <p class="muted">${escapeHtml(user.email)} · ${escapeHtml(userStatusLabel(user.status))} · ${escapeHtml(requestedAt)}</p>
          </div>
          <span class="badge warn">Новая заявка</span>
        </div>
        <label>Роль<select name="role">${renderRoleOptions(user.role)}</select></label>
        <label>Группы<select name="groupIds" multiple size="4">${renderGroupOptions(user.groupIds)}</select></label>
        <div class="toolbar">
          <button class="primary" data-action="approve-registration" data-user-id="${user.id}">Одобрить</button>
          <button class="danger" type="button" data-reject-registration="${user.id}">Отклонить</button>
        </div>
      </form>
    </article>
  `;
}

function renderUserRow(user) {
  const groups = user.groupIds
    .map((groupId) => state.groups.find((group) => group.id === groupId))
    .filter(Boolean)
    .map((group) => group.name)
    .join(", ");

  return `
    <div class="user-table-row">
      <strong>${escapeHtml(user.name)}</strong>
      <span>${escapeHtml(user.email)}</span>
      <span>${escapeHtml(roleLabel(user.role))}</span>
      <span>${escapeHtml(userStatusLabel(user.status))}</span>
      <span>${escapeHtml(groups || "Без группы")}</span>
      <button class="secondary" data-open-user-edit="${user.id}">Открыть</button>
    </div>
  `;
}

function renderUserModal() {
  if (!userModalMode) return "";
  const isCreate = userModalMode === "create";
  const user = isCreate ? null : state.users.find((item) => item.id === editingUserId);
  if (!isCreate && !user) return "";
  const editableGroups = isCreate || canEditUserGroups(user);
  const editableUser = isCreate || canManageUsers();

  return `
    <div class="modal-backdrop" data-close-user-modal>
      <section class="modal-panel" role="dialog" aria-modal="true">
        <div class="panel-title">
          <h2>${isCreate ? "Новый пользователь" : escapeHtml(user.name)}</h2>
          <button class="secondary" data-close-user-modal type="button">Закрыть</button>
        </div>
        <form class="form-stack" data-form="${isCreate ? "user" : "user-update"}" ${isCreate ? "" : `data-user-id="${user.id}"`}>
          ${!editableUser && !isCreate ? `<div class="detail-list">
            <div><span class="muted">Имя</span><strong>${escapeHtml(user.name)}</strong></div>
            <div><span class="muted">Email</span><strong>${escapeHtml(user.email)}</strong></div>
            <div><span class="muted">Роль</span><strong>${escapeHtml(roleLabel(user.role))}</strong></div>
            <div><span class="muted">Статус</span><strong>${escapeHtml(userStatusLabel(user.status))}</strong></div>
          </div>` : ""}
          ${editableUser ? `<label>Имя<input name="name" required placeholder="Имя пользователя" value="${isCreate ? "" : escapeHtml(user.name)}" /></label>` : ""}
          ${editableUser ? `<label>Email<input name="email" type="email" required placeholder="name@company.com" value="${isCreate ? "" : escapeHtml(user.email)}" /></label>` : ""}
          ${editableUser ? `<label>Роль<select name="role" required>${renderRoleOptions(isCreate ? "QA" : user.role)}</select></label>` : ""}
          ${editableUser && !isCreate ? `<label>Статус<select name="status">${renderUserStatusOptions(user.status)}</select></label>` : ""}
          ${editableUser ? `<label>Пароль<input name="password" type="password" required placeholder="Минимум 4 символа" value="${isCreate ? "" : escapeHtml(user.password)}" /></label>` : ""}
          ${editableGroups ? `<label>Группы<select name="groupIds" multiple size="4">${renderGroupOptions(isCreate ? [] : user.groupIds)}</select></label>` : `<div class="badge-row">${groupBadges(user.groupIds)}</div>`}
          <div class="toolbar">
            ${editableUser || editableGroups ? `<button class="primary">${isCreate ? "Создать пользователя" : "Сохранить пользователя"}</button>` : ""}
            ${!isCreate && canManageUsers() ? `<button class="danger" type="button" data-delete-user="${user.id}" ${user.id === state.currentUserId ? "disabled" : ""}>Удалить</button>` : ""}
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderAuth() {
  app.innerHTML = `
    <section class="auth-shell">
      <div class="auth-visual">
        <div class="auth-brand">TestFlow QA</div>
        <div>
          <h1>Система управления тест-кейсами</h1>
          <p>Кейсы, сьюты, команды, группировка и прохождение шагов в одном рабочем интерфейсе.</p>
        </div>
      </div>
      <div class="auth-panel">
        <form class="auth-card form-stack" data-form="auth">
          <div class="auth-tabs">
            <button type="button" class="${authMode === "login" ? "active" : ""}" data-auth-mode="login">Вход</button>
            <button type="button" class="${authMode === "register" ? "active" : ""}" data-auth-mode="register">Регистрация</button>
          </div>
          ${authMode === "register" ? `<label>Имя<input name="name" required placeholder="Ваше имя" /></label>` : ""}
          <label>Email<input name="email" type="email" required placeholder="email@company.com" /></label>
          <label>Пароль<input name="password" type="password" required placeholder="Пароль" /></label>
          ${authNotice ? `<p class="notice">${escapeHtml(authNotice)}</p>` : ""}
          <button class="primary">${authMode === "login" ? "Войти" : "Создать аккаунт"}</button>
          <p class="muted">Демо-вход: admin@test.local / admin123</p>
        </form>
      </div>
    </section>
  `;
}

function statusOptions(selected = "untested") {
  const options = [
    ["untested", "Без результата"],
    ["passed", "Успешно"],
    ["failed", "Не успешно"],
  ];
  return options.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function statusLabel(status) {
  const labels = {
    untested: "Без результата",
    passed: "Успешно",
    failed: "Не успешно",
  };
  return labels[status] || labels.untested;
}

function renderRoleOptions(selected = "QA") {
  const roles = ["Admin", "Manager", "QA"];
  const current = normalizeRole(selected);
  return roles.map((role) => `<option value="${role}" ${role === current ? "selected" : ""}>${role}</option>`).join("");
}

function renderUserStatusOptions(selected = "approved") {
  const statuses = [
    ["approved", "Одобрен"],
    ["pending", "Ожидает одобрения"],
    ["rejected", "Отклонён"],
  ];
  const current = normalizeUserStatus(selected);
  return statuses.map(([value, label]) => `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`).join("");
}

function renderOwnerOptions(selected = currentUser().id) {
  const users = canManageCases() ? state.users : [currentUser()];
  return users.map((user) => `<option value="${user.id}" ${user.id === selected ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("");
}

function renderGroupOptions(selected = []) {
  return state.groups
    .map((group) => `<option value="${group.id}" ${selected.includes(group.id) ? "selected" : ""}>${escapeHtml(group.name)}</option>`)
    .join("");
}

function renderQaOptions(selected = []) {
  return state.users
    .filter((user) => normalizeRole(user.role) === "QA")
    .map((user) => `<option value="${user.id}" ${selected.includes(user.id) ? "selected" : ""}>${escapeHtml(user.name)}</option>`)
    .join("");
}

function renderSuiteOptions(selected = [], suites = state.suites) {
  return suites
    .map((suite) => `<option value="${suite.id}" ${selected.includes(suite.id) ? "selected" : ""}>${escapeHtml(suite.title)}</option>`)
    .join("");
}

function renderGroupFilters() {
  return `
    <div class="filters">
      <button class="filter-chip ${selectedGroupId === "all" ? "active" : ""}" data-filter-group="all">Все группы</button>
      ${state.groups.map((group) => `<button class="filter-chip ${selectedGroupId === group.id ? "active" : ""}" data-filter-group="${group.id}">${escapeHtml(group.name)}</button>`).join("")}
    </div>
  `;
}

function renderCaseSuiteFilters() {
  const suites = suitesForCurrentUser();
  return `
    <div class="filters">
      <button class="filter-chip ${selectedCaseSuiteId === "all" ? "active" : ""}" data-filter-suite="all">Все сьюты</button>
      ${suites.map((suite) => `<button class="filter-chip ${selectedCaseSuiteId === suite.id ? "active" : ""}" data-filter-suite="${suite.id}">${escapeHtml(suite.title)}</button>`).join("")}
    </div>
  `;
}

function filterByGroup(items) {
  if (selectedGroupId === "all") return items;
  return items.filter((item) => item.groupIds.includes(selectedGroupId));
}

function filterCasesBySuite(items) {
  if (selectedCaseSuiteId === "all") return items;
  const suite = state.suites.find((item) => item.id === selectedCaseSuiteId);
  if (!suite) return items;
  return items.filter((item) => suite.caseIds.includes(item.id));
}

function visibleCases() {
  return state.cases.filter((testCase) => canUseCase(testCase));
}

function visibleSuites() {
  if (canManageSuites()) return state.suites;
  const caseIds = new Set(visibleCases().map((testCase) => testCase.id));
  return state.suites.filter((suite) => suite.caseIds.some((caseId) => caseIds.has(caseId)) || hasSharedGroup(suite.groupIds, currentUser().groupIds));
}

function suitesForCurrentUser(testCase = null) {
  if (canManageSuites()) return state.suites;
  const selectedIds = testCase ? suiteIdsForCase(testCase.id) : [];
  return state.suites.filter((suite) => selectedIds.includes(suite.id) || hasSharedGroup(suite.groupIds, currentUser().groupIds));
}

function visibleGroups() {
  if (isAdmin() || isManager()) return state.groups;
  return state.groups.filter((group) => currentUser().groupIds.includes(group.id));
}

function groupBadges(groupIds) {
  const badges = groupIds
    .map((groupId) => state.groups.find((group) => group.id === groupId))
    .filter(Boolean)
    .map((group) => `<span class="badge warn">${escapeHtml(group.name)}</span>`)
    .join("");
  return badges || `<span class="badge">Без группы</span>`;
}

function suiteIdsForCase(caseId) {
  return state.suites.filter((suite) => suite.caseIds.includes(caseId)).map((suite) => suite.id);
}

function suiteBadges(caseId) {
  const badges = state.suites
    .filter((suite) => suite.caseIds.includes(caseId))
    .map((suite) => `<span class="badge">${escapeHtml(suite.title)}</span>`)
    .join("");
  return badges || `<span class="badge">Без сьюта</span>`;
}

function assignedQaBadges(userIds = []) {
  const badges = userIds
    .map((userId) => state.users.find((user) => user.id === userId))
    .filter(Boolean)
    .map((user) => `<span class="badge">${escapeHtml(user.name)}</span>`)
    .join("");
  return badges || `<span class="badge">QA не назначены</span>`;
}

function groupIdsFromSuites(suiteIds) {
  return Array.from(
    new Set(
      state.suites
        .filter((suite) => suiteIds.includes(suite.id))
        .flatMap((suite) => suite.groupIds),
    ),
  );
}

function syncCaseSuites(caseId, suiteIds) {
  state.suites.forEach((suite) => {
    if (suiteIds.includes(suite.id)) {
      suite.caseIds = Array.from(new Set([...suite.caseIds, caseId]));
    } else {
      suite.caseIds = suite.caseIds.filter((idValue) => idValue !== caseId);
    }
  });
}

function ownerName(ownerId) {
  const owner = state.users.find((user) => user.id === ownerId);
  return owner ? owner.name : "Без владельца";
}

function empty(text) {
  return `<div class="empty">${text}</div>`;
}

function forbidden() {
  return `
    ${topbar("Доступ", "Недостаточно прав", "Эта страница или действие недоступны для вашей роли.", `<button class="secondary" data-view="cases">К кейсам</button>`)}
    <div class="empty">Выберите доступный раздел в меню.</div>
  `;
}

function selectedValues(select) {
  if (!select) return [];
  return Array.from(select.selectedOptions).map((option) => option.value);
}

app.addEventListener("click", (event) => {
  if (event.target.dataset && event.target.dataset.closeGroupModal !== undefined) {
    groupModalMode = null;
    editingGroupId = null;
    render();
    return;
  }

  if (event.target.dataset && event.target.dataset.closeUserModal !== undefined) {
    userModalMode = null;
    editingUserId = null;
    render();
    return;
  }

  const button = event.target.closest("button");
  if (!button) return;
  if (state.currentUserId && button.dataset.action !== "logout" && !touchSession()) return;

  if (button.dataset.view) {
    if (!canOpenView(button.dataset.view)) return;
    view = button.dataset.view;
    userModalMode = null;
    editingUserId = null;
    groupModalMode = null;
    editingGroupId = null;
    render();
  }

  if (button.dataset.openGroupCreate !== undefined) {
    if (!canManageGroups()) return;
    groupModalMode = "create";
    editingGroupId = null;
    render();
  }

  if (button.dataset.openGroupEdit) {
    const group = state.groups.find((item) => item.id === button.dataset.openGroupEdit);
    if (!group || !canManageGroups()) return;
    groupModalMode = "edit";
    editingGroupId = group.id;
    render();
  }

  if (button.dataset.openUserCreate !== undefined) {
    if (!canManageUsers()) return;
    userModalMode = "create";
    editingUserId = null;
    render();
  }

  if (button.dataset.openUserEdit) {
    const user = state.users.find((item) => item.id === button.dataset.openUserEdit);
    if (!user || !canViewUserDetails(user)) return;
    userModalMode = "edit";
    editingUserId = user.id;
    render();
  }

  if (button.dataset.closeUserModal !== undefined) {
    userModalMode = null;
    editingUserId = null;
    render();
  }

  if (button.dataset.toggleCase) {
    expandedCaseId = expandedCaseId === button.dataset.toggleCase ? null : button.dataset.toggleCase;
    render();
  }

  if (button.dataset.editCase) {
    const testCase = state.cases.find((item) => item.id === button.dataset.editCase);
    if (!canEditCase(testCase)) return;
    editingCaseId = button.dataset.editCase;
    view = "edit-case";
    render();
  }

  if (button.dataset.editSuite) {
    if (!canManageSuites()) return;
    editingSuiteId = button.dataset.editSuite;
    const suite = state.suites.find((item) => item.id === editingSuiteId);
    editingSuiteGroupIds = suite ? [...suite.groupIds] : [];
    view = "edit-suite";
    render();
  }

  if (button.dataset.authMode) {
    authMode = button.dataset.authMode;
    authNotice = "";
    renderAuth();
  }

  if (button.dataset.action === "logout") {
    const user = currentUser();
    if (user) {
      user.activeSessionToken = null;
      user.lastActivityAt = null;
    }
    state.currentUserId = null;
    clearSession();
    saveState();
    renderAuth();
  }

  if (button.dataset.action === "add-step") {
    const list = button.closest("[data-steps]");
    list.insertAdjacentHTML("beforeend", renderStepInputRow("remove"));
  }

  if (button.dataset.action === "remove-new-step") {
    button.closest(".step-input-row").remove();
  }

  if (button.dataset.filterGroup) {
    selectedGroupId = button.dataset.filterGroup;
    render();
  }

  if (button.dataset.filterSuite) {
    selectedCaseSuiteId = button.dataset.filterSuite;
    render();
  }

  if (button.dataset.deleteCase) {
    if (!canDeleteCase()) return;
    state.cases = state.cases.filter((item) => item.id !== button.dataset.deleteCase);
    state.suites.forEach((suite) => {
      suite.caseIds = suite.caseIds.filter((caseId) => caseId !== button.dataset.deleteCase);
    });
    notify("Кейс удалён.");
    saveState();
    render();
  }

  if (button.dataset.deleteSuite) {
    if (!isAdmin()) return;
    state.suites = state.suites.filter((item) => item.id !== button.dataset.deleteSuite);
    if (selectedCaseSuiteId === button.dataset.deleteSuite) selectedCaseSuiteId = "all";
    notify("Сьют удалён.");
    saveState();
    render();
  }

  if (button.dataset.deleteGroup) {
    if (!isAdmin()) return;
    const groupId = button.dataset.deleteGroup;
    state.groups = state.groups.filter((group) => group.id !== groupId);
    [...state.users, ...state.cases, ...state.suites].forEach((item) => {
      item.groupIds = item.groupIds.filter((idValue) => idValue !== groupId);
    });
    editingSuiteGroupIds = editingSuiteGroupIds.filter((idValue) => idValue !== groupId);
    if (selectedGroupId === groupId) selectedGroupId = "all";
    groupModalMode = null;
    editingGroupId = null;
    notify("Группа удалена.");
    saveState();
    render();
  }

  if (button.dataset.deleteUser) {
    if (!canManageUsers()) return;
    const deletedUserId = button.dataset.deleteUser;
    state.users = state.users.filter((user) => user.id !== deletedUserId);
    state.cases.forEach((testCase) => {
      if (testCase.ownerId === deletedUserId) {
        testCase.ownerId = null;
      }
      testCase.assignedUserIds = (testCase.assignedUserIds || []).filter((userId) => userId !== deletedUserId);
    });
    userModalMode = null;
    editingUserId = null;
    notify("Пользователь удалён.");
    saveState();
    render();
  }

  if (button.dataset.rejectRegistration) {
    if (!isAdmin()) return;
    const user = state.users.find((item) => item.id === button.dataset.rejectRegistration);
    if (!user) return;
    user.status = "rejected";
    user.activeSessionToken = null;
    user.lastActivityAt = null;
    notify("Заявка отклонена.");
    saveState();
    render();
  }

  if (button.dataset.deleteStep) {
    const [caseId, stepId] = button.dataset.deleteStep.split(":");
    const testCase = state.cases.find((item) => item.id === caseId);
    if (!canEditCase(testCase)) return;
    testCase.steps = testCase.steps.filter((step) => step.id !== stepId);
    notify("Шаг удалён.");
    saveState();
    render();
  }
});

app.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  if (state.currentUserId && form.dataset.form !== "auth" && !touchSession()) return;

  if (form.dataset.form === "auth") {
    const email = formData.get("email").trim().toLowerCase();
    const password = formData.get("password");
    if (authMode === "login") {
      const user = state.users.find((item) => item.email.toLowerCase() === email && item.password === password);
      if (!user) {
        alert("Пользователь не найден или пароль неверный");
        return;
      }
      if (isPendingUser(user)) {
        authNotice = "Учётная запись ещё не активна. Дождитесь одобрения администратора.";
        renderAuth();
        return;
      }
      if (normalizeUserStatus(user.status) === "rejected") {
        authNotice = "Заявка на регистрацию отклонена. Обратитесь к администратору.";
        renderAuth();
        return;
      }
      authNotice = "";
      state.currentUserId = user.id;
      rememberSession(user);
    } else {
      if (state.users.some((item) => item.email.toLowerCase() === email)) {
        alert("Пользователь с таким email уже есть");
        return;
      }
      state.currentUserId = null;
      clearSession();
      const user = {
        id: id("u"),
        name: formData.get("name").trim(),
        email,
        password,
        role: "QA",
        status: "pending",
        requestedAt: Date.now(),
        activeSessionToken: null,
        lastActivityAt: null,
        groupIds: [],
      };
      state.users.push(user);
      authMode = "login";
      authNotice = "Заявка отправлена. Вход станет доступен после одобрения администратора.";
      saveState();
      renderAuth();
      return;
    }
    saveState();
    render();
  }

  if (form.dataset.form === "case") {
    if (!canCreateCases()) return;
    const suiteIds = selectedValues(form.elements.suiteIds);
    if (!canManageCases() && !suiteIds.length) {
      alert("Выберите сьют из своей группы");
      return;
    }
    const newCase = {
      id: id("c"),
      title: formData.get("title").trim(),
      description: formData.get("description").trim(),
      ownerId: canManageCases() ? formData.get("ownerId") : currentUser().id,
      assignedUserIds: canAssignQa() ? selectedValues(form.elements.assignedUserIds) : [currentUser().id],
      groupIds: groupIdsFromSuites(suiteIds),
      steps: collectStepRows(form),
    };

    state.cases.unshift(newCase);
    syncCaseSuites(newCase.id, suiteIds);
    notify("Кейс создан.");
    saveState();
    view = "cases";
    render();
  }

  if (form.dataset.form === "suite") {
    if (!canManageSuites()) return;
    state.suites.unshift({
      id: id("q"),
      title: formData.get("title").trim(),
      description: formData.get("description").trim(),
      groupIds: selectedValues(form.elements.groupIds),
      caseIds: selectedValues(form.elements.caseIds),
    });
    notify("Сьют создан.");
    saveState();
    view = "suites";
    render();
  }

  if (form.dataset.form === "edit-case") {
    const testCase = state.cases.find((item) => item.id === editingCaseId);
    if (!testCase) return;
    if (!canEditCase(testCase)) return;

    const suiteIds = selectedValues(form.elements.suiteIds);
    testCase.title = formData.get("title").trim();
    testCase.description = formData.get("description").trim();
    if (canAssignQa()) {
      testCase.assignedUserIds = selectedValues(form.elements.assignedUserIds);
    }
    testCase.groupIds = groupIdsFromSuites(suiteIds);
    testCase.steps.push(...collectStepRows(form));
    syncCaseSuites(testCase.id, suiteIds);
    notify("Кейс сохранён.");
    saveState();
    view = "cases";
    render();
  }

  if (form.dataset.form === "edit-suite") {
    if (!canManageSuites()) return;
    const suite = state.suites.find((item) => item.id === editingSuiteId);
    if (!suite) return;

    const addedCaseIds = selectedValues(form.elements.caseIds);
    suite.groupIds = selectedValues(form.elements.groupIds);
    suite.caseIds = Array.from(new Set([...suite.caseIds, ...addedCaseIds]));
    notify("Сьют сохранён.");
    saveState();
    view = "suites";
    render();
  }

  if (form.dataset.form === "group") {
    if (!canManageGroups()) return;
    state.groups.unshift({
      id: id("g"),
      name: formData.get("name").trim(),
      description: formData.get("description").trim(),
    });
    groupModalMode = null;
    editingGroupId = null;
    notify("Группа создана.");
    saveState();
    render();
  }

  if (form.dataset.form === "group-update") {
    if (!canManageGroups()) return;
    const group = state.groups.find((item) => item.id === form.dataset.groupId);
    if (!group) return;
    group.name = formData.get("name").trim();
    group.description = formData.get("description").trim();
    groupModalMode = null;
    editingGroupId = null;
    notify("Группа сохранена.");
    saveState();
    render();
  }

  if (form.dataset.form === "user") {
    if (!canManageUsers()) return;
    state.users.unshift({
      id: id("u"),
      name: formData.get("name").trim(),
      email: formData.get("email").trim(),
      role: normalizeRole(formData.get("role")),
      status: "approved",
      password: formData.get("password"),
      groupIds: selectedValues(form.elements.groupIds),
    });
    userModalMode = null;
    editingUserId = null;
    notify("Пользователь создан.");
    saveState();
    render();
  }

  if (form.dataset.form === "user-update") {
    const user = state.users.find((item) => item.id === form.dataset.userId);
    if (!user || (!canManageUsers() && !canEditUserGroups(user))) return;

    if (canManageUsers()) {
      const email = formData.get("email").trim().toLowerCase();
      const duplicate = state.users.some((item) => item.id !== user.id && item.email.toLowerCase() === email);
      if (duplicate) {
        alert("Пользователь с таким email уже есть");
        return;
      }
      user.name = formData.get("name").trim();
      user.email = email;
      user.role = normalizeRole(formData.get("role"));
      user.status = normalizeUserStatus(formData.get("status"));
      user.password = formData.get("password");
      if (user.status !== "approved") {
        user.activeSessionToken = null;
        user.lastActivityAt = null;
      }
    }

    if (canEditUserGroups(user)) {
      user.groupIds = selectedValues(form.elements.groupIds);
    }

    saveState();
    userModalMode = null;
    editingUserId = null;
    notify("Пользователь сохранён.");
    render();
  }

  if (form.dataset.form === "registration-request") {
    if (!isAdmin()) return;
    const user = state.users.find((item) => item.id === form.dataset.userId);
    if (!user) return;
    user.role = normalizeRole(formData.get("role"));
    user.status = "approved";
    user.groupIds = selectedValues(form.elements.groupIds);
    user.activeSessionToken = null;
    user.lastActivityAt = null;
    notify("Заявка одобрена.");
    saveState();
    render();
  }
});

app.addEventListener("change", (event) => {
  if (state.currentUserId && !touchSession()) return;

  if (event.target.dataset.editSuiteGroups !== undefined) {
    if (!canManageSuites()) return;
    editingSuiteGroupIds = selectedValues(event.target);
    render();
    return;
  }

  if (event.target.dataset.stepStatus) {
    const [caseId, stepId] = event.target.dataset.stepStatus.split(":");
    const testCase = state.cases.find((item) => item.id === caseId);
    if (!canUseCase(testCase)) return;
    const step = findStep(caseId, stepId);
    if (!step) return;
    step.status = event.target.value;
    notify("Статус шага сохранён.");
    saveState();
    render();
  }
});

app.addEventListener("input", (event) => {
  if (state.currentUserId && !touchSession()) return;

  if (event.target.dataset.stepField) {
    const [caseId, stepId, field] = event.target.dataset.stepField.split(":");
    const testCase = state.cases.find((item) => item.id === caseId);
    if (!canEditCase(testCase)) return;
    const step = findStep(caseId, stepId);
    if (!step) return;
    step[field] = event.target.value;
    saveState();
  }
});

async function init() {
  state = await loadState();
  render();
  setInterval(checkRemoteSession, sessionTouchIntervalMs);
}

init();
