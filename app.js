const storeKey = "testflow-qa-state-v1";

const seedState = {
  currentUserId: "u1",
  users: [
    { id: "u1", name: "Администратор", email: "admin@test.local", password: "admin123", role: "QA Lead", groupIds: ["g1"] },
    { id: "u2", name: "Анна QA", email: "anna@test.local", password: "test123", role: "Tester", groupIds: ["g2"] },
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

const state = loadState();
const app = document.querySelector("#app");

let view = "dashboard";
let authMode = "login";
let selectedGroupId = "all";
let editingCaseId = null;
let editingSuiteId = null;

function loadState() {
  const saved = localStorage.getItem(storeKey);
  const loadedState = saved ? JSON.parse(saved) : structuredClone(seedState);
  loadedState.cases.forEach((testCase) => {
    testCase.steps = testCase.steps.map(normalizeStep);
  });
  return loadedState;
}

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function id(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function currentUser() {
  return state.users.find((user) => user.id === state.currentUserId);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
      return acc;
    },
    { total: 0, passed: 0, failed: 0 },
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
          ${navButton("suites", "▣", "Сьюты")}
          ${navButton("groups", "◌", "Группы")}
          ${navButton("users", "◎", "Пользователи")}
        </nav>
        <div class="sidebar-user">
          <div>
            <strong>${escapeHtml(currentUser().name)}</strong>
            <div class="muted">${escapeHtml(currentUser().role)}</div>
          </div>
          <button class="secondary" data-action="logout">Выйти</button>
        </div>
      </aside>
      <section class="content">${renderView()}</section>
    </section>
  `;
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
  };
  return views[view]();
}

function renderDashboard() {
  const stats = aggregate();
  const recentCases = state.cases.slice(0, 4).map(renderCaseCard).join("");

  return `
    ${topbar("Обзор", "Контроль прохождения тестов", "Общий процент успешных и упавших шагов считается по всем кейсам.")}
    <section class="grid stats">
      ${stat("Кейсов", state.cases.length)}
      ${stat("Сьютов", state.suites.length)}
      ${stat("Успешно", `${stats.passPercent}%`)}
      ${stat("Не успешно", `${stats.failPercent}%`)}
    </section>
    <section class="grid two-col" style="margin-top:16px">
      <div class="panel">
        <div class="panel-title"><h2>Прогресс</h2><span class="badge success">${stats.passed}/${stats.total} успешно</span></div>
        <div class="progress"><span style="width:${stats.passPercent}%"></span></div>
        <p class="muted">${stats.failed} шагов упало, ${Math.max(stats.total - stats.passed - stats.failed, 0)} еще без результата.</p>
      </div>
      <div class="panel">
        <div class="panel-title"><h2>Группы</h2><button class="secondary" data-view="groups">Открыть</button></div>
        <div class="badge-row">${state.groups.map((group) => `<span class="badge">${escapeHtml(group.name)}</span>`).join("")}</div>
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

function renderCases() {
  const filtered = filterByGroup(state.cases);
  return `
    ${topbar(
      "Тест-кейсы",
      "Кейсы",
      "Список кейсов, их группы, ответственные и текущий прогресс по строкам проверки.",
      `<button class="primary" data-view="create-case">Создать кейс</button>`,
    )}
    ${renderFilters()}
    <section>
      <div class="case-list">${filtered.map(renderCaseCard).join("") || empty("Нет кейсов в выбранной группе")}</div>
    </section>
  `;
}

function renderCreateCase() {
  return `
    ${topbar(
      "Новый кейс",
      "Создание кейса",
      "Заполните описание, выберите группы и добавьте строки проверки с ожидаемым и фактическим результатом.",
      `<button class="secondary" data-view="cases">Назад к кейсам</button>`,
    )}
    <section class="panel form-page">
      <form class="form-stack" data-form="case">
        <label>Название<input name="title" required placeholder="Например, оформление заказа" /></label>
        <label>Описание<textarea name="description" placeholder="Что проверяем"></textarea></label>
        <label>Ответственный<select name="ownerId">${state.users.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("")}</select></label>
        <label>Группы<select name="groupIds" multiple size="4">${renderGroupOptions()}</select></label>
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
  return `
    <article class="item-card">
      <div class="item-head">
        <div>
          <h3>${escapeHtml(testCase.title)}</h3>
          <p class="muted">${escapeHtml(testCase.description)}</p>
        </div>
        <div class="item-actions">
          <button class="secondary" data-edit-case="${testCase.id}">Редактировать</button>
          <button class="danger" data-delete-case="${testCase.id}">Удалить</button>
        </div>
      </div>
      <div class="badge-row">
        ${groupBadges(testCase.groupIds)}
        <span class="badge">${ownerName(testCase.ownerId)}</span>
        <span class="badge success">${progress.passPercent}% успешно</span>
        <span class="badge danger">${progress.failPercent}% не успешно</span>
      </div>
      <div class="progress"><span style="width:${progress.passPercent}%"></span></div>
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
          ${testCase.steps.map((step) => renderEditableStepRow(testCase.id, step)).join("") || empty("Шагов пока нет")}
        </div>
      </div>
    </article>
  `;
}

function renderEditCase() {
  const testCase = state.cases.find((item) => item.id === editingCaseId);
  if (!testCase) {
    view = "cases";
    return renderCases();
  }

  return `
    ${topbar(
      "Редактирование",
      escapeHtml(testCase.title),
      "Добавьте новые строки проверки в существующий кейс. Созданные строки можно редактировать прямо в карточках кейсов.",
      `<button class="secondary" data-view="cases">Назад к кейсам</button>`,
    )}
    <section class="panel form-page">
      <div class="form-stack">
        <div>
          <h2>Текущие строки</h2>
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
              testCase.steps.map((step) => renderReadonlyStepRow(step)).join("") || `<p class="muted">Шагов пока нет</p>`
            }
          </div>
        </div>
        <form class="form-stack" data-form="edit-case">
          <h2>Добавить строки</h2>
          <div class="step-list step-table" data-steps>
            ${renderStepInputRow("add")}
          </div>
          <div class="toolbar">
            <button class="primary">Сохранить строки</button>
            <button class="secondary" type="button" data-view="cases">Отмена</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function renderStepInputRow(action = "add") {
  const isRemove = action === "remove";
  const buttonClass = isRemove ? "step-action danger-step" : "step-action add-step";
  const buttonAction = isRemove ? "remove-new-step" : "add-step";
  const buttonLabel = isRemove ? "-" : "+";
  return `
    <div class="case-step-grid step-input-row">
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

function renderReadonlyStepRow(step) {
  return `
    <div class="case-step-grid readonly-step">
      <span>${escapeHtml(step.precondition) || "—"}</span>
      <span>${escapeHtml(step.action) || "—"}</span>
      <span>${escapeHtml(step.expected) || "—"}</span>
      <span>${escapeHtml(step.actual) || "—"}</span>
      <span>${escapeHtml(step.comment) || "—"}</span>
      <span class="badge ${step.status === "passed" ? "success" : step.status === "failed" ? "danger" : ""}">${statusLabel(step.status)}</span>
      <span></span>
    </div>
  `;
}

function collectStepRows(form) {
  return Array.from(form.querySelectorAll(".step-input-row"))
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
  return state.cases.find((item) => item.id === caseId)?.steps.find((item) => item.id === stepId);
}

function renderSuites() {
  const filtered = filterByGroup(state.suites);
  return `
    ${topbar(
      "Сьюты",
      "Наборы тест-кейсов",
      "Список сьютов, привязанных кейсов, групп и агрегированного прогресса.",
      `<button class="primary" data-view="create-suite">Создать сьют</button>`,
    )}
    ${renderFilters()}
    <section>
      <div class="suite-list">${filtered.map(renderSuiteCard).join("") || empty("Нет сьютов в выбранной группе")}</div>
    </section>
  `;
}

function renderCreateSuite() {
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
          <button class="danger" data-delete-suite="${suite.id}">Удалить</button>
        </div>
      </div>
      <div class="badge-row">${groupBadges(suite.groupIds)}<span class="badge">${cases.length} кейсов</span><span class="badge success">${stats.passPercent}% успешно</span><span class="badge danger">${stats.failPercent}% не успешно</span></div>
      <div class="progress"><span style="width:${stats.passPercent}%"></span></div>
      <div class="badge-row">${cases.map((item) => `<span class="badge">${escapeHtml(item.title)}</span>`).join("") || `<span class="muted">Кейсы не выбраны</span>`}</div>
    </article>
  `;
}

function renderEditSuite() {
  const suite = state.suites.find((item) => item.id === editingSuiteId);
  if (!suite) {
    view = "suites";
    return renderSuites();
  }

  const currentCases = suite.caseIds.map((caseId) => state.cases.find((item) => item.id === caseId)).filter(Boolean);
  const availableCases = state.cases.filter((item) => !suite.caseIds.includes(item.id));

  return `
    ${topbar(
      "Редактирование",
      escapeHtml(suite.title),
      "Добавьте в сьют готовые кейсы из общей базы.",
      `<button class="secondary" data-view="suites">Назад к сьютам</button>`,
    )}
    <section class="panel form-page">
      <form class="form-stack" data-form="edit-suite">
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
        ${availableCases.length ? "" : `<p class="muted">Все существующие кейсы уже добавлены в этот сьют.</p>`}
        <div class="toolbar">
          <button class="primary" ${availableCases.length ? "" : "disabled"}>Добавить выбранные</button>
          <button class="secondary" type="button" data-view="suites">Отмена</button>
        </div>
      </form>
    </section>
  `;
}

function renderGroups() {
  return `
    ${topbar("Группы", "Группы пользователей, кейсов и сьютов", "Используйте группы как продуктовые зоны, команды или типы регрессии.")}
    <section class="grid two-col">
      <form class="panel form-stack" data-form="group">
        <h2>Новая группа</h2>
        <label>Название<input name="name" required placeholder="Например, Billing" /></label>
        <label>Описание<textarea name="description" placeholder="Контекст группы"></textarea></label>
        <button class="primary">Создать группу</button>
      </form>
      <div class="grid three-col">
        ${state.groups.map(renderGroupCard).join("") || empty("Групп пока нет")}
      </div>
    </section>
  `;
}

function renderGroupCard(group) {
  const caseCount = state.cases.filter((item) => item.groupIds.includes(group.id)).length;
  const suiteCount = state.suites.filter((item) => item.groupIds.includes(group.id)).length;
  const userCount = state.users.filter((item) => item.groupIds.includes(group.id)).length;
  return `
    <article class="item-card">
      <div class="item-head">
        <div>
          <h3>${escapeHtml(group.name)}</h3>
          <p class="muted">${escapeHtml(group.description)}</p>
        </div>
        <button class="danger" data-delete-group="${group.id}">Удалить</button>
      </div>
      <div class="badge-row">
        <span class="badge">${caseCount} кейсов</span>
        <span class="badge">${suiteCount} сьютов</span>
        <span class="badge">${userCount} пользователей</span>
      </div>
    </article>
  `;
}

function renderUsers() {
  return `
    ${topbar("Пользователи", "Команды и доступ", "Добавляйте пользователей и включайте их в группы тестирования.")}
    <section class="grid two-col">
      <form class="panel form-stack" data-form="user">
        <h2>Новый пользователь</h2>
        <label>Имя<input name="name" required placeholder="Имя пользователя" /></label>
        <label>Email<input name="email" type="email" required placeholder="name@company.com" /></label>
        <label>Роль<input name="role" required placeholder="QA, Developer, Manager" /></label>
        <label>Пароль<input name="password" type="password" required placeholder="Минимум 4 символа" /></label>
        <label>Группы<select name="groupIds" multiple size="4">${renderGroupOptions()}</select></label>
        <button class="primary">Создать пользователя</button>
      </form>
      <div class="user-list">${state.users.map(renderUserCard).join("")}</div>
    </section>
  `;
}

function renderUserCard(user) {
  return `
    <article class="item-card">
      <div class="item-head">
        <div>
          <h3>${escapeHtml(user.name)}</h3>
          <p class="muted">${escapeHtml(user.email)} · ${escapeHtml(user.role)}</p>
        </div>
        <button class="danger" data-delete-user="${user.id}" ${user.id === state.currentUserId ? "disabled" : ""}>Удалить</button>
      </div>
      <div class="badge-row">${groupBadges(user.groupIds)}</div>
    </article>
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
          <label>Email<input name="email" type="email" required value="${authMode === "login" ? "admin@test.local" : ""}" /></label>
          <label>Пароль<input name="password" type="password" required value="${authMode === "login" ? "admin123" : ""}" /></label>
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

function renderGroupOptions(selected = []) {
  return state.groups
    .map((group) => `<option value="${group.id}" ${selected.includes(group.id) ? "selected" : ""}>${escapeHtml(group.name)}</option>`)
    .join("");
}

function renderFilters() {
  return `
    <div class="filters">
      <button class="filter-chip ${selectedGroupId === "all" ? "active" : ""}" data-filter-group="all">Все группы</button>
      ${state.groups.map((group) => `<button class="filter-chip ${selectedGroupId === group.id ? "active" : ""}" data-filter-group="${group.id}">${escapeHtml(group.name)}</button>`).join("")}
    </div>
  `;
}

function filterByGroup(items) {
  if (selectedGroupId === "all") return items;
  return items.filter((item) => item.groupIds.includes(selectedGroupId));
}

function groupBadges(groupIds) {
  const badges = groupIds
    .map((groupId) => state.groups.find((group) => group.id === groupId))
    .filter(Boolean)
    .map((group) => `<span class="badge warn">${escapeHtml(group.name)}</span>`)
    .join("");
  return badges || `<span class="badge">Без группы</span>`;
}

function ownerName(ownerId) {
  const owner = state.users.find((user) => user.id === ownerId);
  return owner ? owner.name : "Без владельца";
}

function empty(text) {
  return `<div class="empty">${text}</div>`;
}

function selectedValues(select) {
  return Array.from(select.selectedOptions).map((option) => option.value);
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.view) {
    view = button.dataset.view;
    render();
  }

  if (button.dataset.editCase) {
    editingCaseId = button.dataset.editCase;
    view = "edit-case";
    render();
  }

  if (button.dataset.editSuite) {
    editingSuiteId = button.dataset.editSuite;
    view = "edit-suite";
    render();
  }

  if (button.dataset.authMode) {
    authMode = button.dataset.authMode;
    renderAuth();
  }

  if (button.dataset.action === "logout") {
    state.currentUserId = null;
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

  if (button.dataset.deleteCase) {
    state.cases = state.cases.filter((item) => item.id !== button.dataset.deleteCase);
    state.suites.forEach((suite) => {
      suite.caseIds = suite.caseIds.filter((caseId) => caseId !== button.dataset.deleteCase);
    });
    saveState();
    render();
  }

  if (button.dataset.deleteSuite) {
    state.suites = state.suites.filter((item) => item.id !== button.dataset.deleteSuite);
    saveState();
    render();
  }

  if (button.dataset.deleteGroup) {
    const groupId = button.dataset.deleteGroup;
    state.groups = state.groups.filter((group) => group.id !== groupId);
    [...state.users, ...state.cases, ...state.suites].forEach((item) => {
      item.groupIds = item.groupIds.filter((idValue) => idValue !== groupId);
    });
    if (selectedGroupId === groupId) selectedGroupId = "all";
    saveState();
    render();
  }

  if (button.dataset.deleteUser) {
    state.users = state.users.filter((user) => user.id !== button.dataset.deleteUser);
    saveState();
    render();
  }

  if (button.dataset.deleteStep) {
    const [caseId, stepId] = button.dataset.deleteStep.split(":");
    const testCase = state.cases.find((item) => item.id === caseId);
    testCase.steps = testCase.steps.filter((step) => step.id !== stepId);
    saveState();
    render();
  }
});

app.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);

  if (form.dataset.form === "auth") {
    const email = formData.get("email").trim().toLowerCase();
    const password = formData.get("password");
    if (authMode === "login") {
      const user = state.users.find((item) => item.email.toLowerCase() === email && item.password === password);
      if (!user) {
        alert("Пользователь не найден или пароль неверный");
        return;
      }
      state.currentUserId = user.id;
    } else {
      if (state.users.some((item) => item.email.toLowerCase() === email)) {
        alert("Пользователь с таким email уже есть");
        return;
      }
      const user = { id: id("u"), name: formData.get("name").trim(), email, password, role: "Tester", groupIds: [] };
      state.users.push(user);
      state.currentUserId = user.id;
    }
    saveState();
    render();
  }

  if (form.dataset.form === "case") {
    state.cases.unshift({
      id: id("c"),
      title: formData.get("title").trim(),
      description: formData.get("description").trim(),
      ownerId: formData.get("ownerId"),
      groupIds: selectedValues(form.elements.groupIds),
      steps: collectStepRows(form),
    });
    saveState();
    view = "cases";
    render();
  }

  if (form.dataset.form === "suite") {
    state.suites.unshift({
      id: id("q"),
      title: formData.get("title").trim(),
      description: formData.get("description").trim(),
      groupIds: selectedValues(form.elements.groupIds),
      caseIds: selectedValues(form.elements.caseIds),
    });
    saveState();
    view = "suites";
    render();
  }

  if (form.dataset.form === "edit-case") {
    const testCase = state.cases.find((item) => item.id === editingCaseId);
    if (!testCase) return;

    testCase.steps.push(...collectStepRows(form));
    saveState();
    view = "cases";
    render();
  }

  if (form.dataset.form === "edit-suite") {
    const suite = state.suites.find((item) => item.id === editingSuiteId);
    if (!suite) return;

    const addedCaseIds = selectedValues(form.elements.caseIds);
    suite.caseIds = Array.from(new Set([...suite.caseIds, ...addedCaseIds]));
    saveState();
    view = "suites";
    render();
  }

  if (form.dataset.form === "group") {
    state.groups.unshift({
      id: id("g"),
      name: formData.get("name").trim(),
      description: formData.get("description").trim(),
    });
    saveState();
    render();
  }

  if (form.dataset.form === "user") {
    state.users.unshift({
      id: id("u"),
      name: formData.get("name").trim(),
      email: formData.get("email").trim(),
      role: formData.get("role").trim(),
      password: formData.get("password"),
      groupIds: selectedValues(form.elements.groupIds),
    });
    saveState();
    render();
  }
});

app.addEventListener("change", (event) => {
  if (event.target.dataset.stepStatus) {
    const [caseId, stepId] = event.target.dataset.stepStatus.split(":");
    const step = findStep(caseId, stepId);
    if (!step) return;
    step.status = event.target.value;
    saveState();
    render();
  }
});

app.addEventListener("input", (event) => {
  if (event.target.dataset.stepField) {
    const [caseId, stepId, field] = event.target.dataset.stepField.split(":");
    const step = findStep(caseId, stepId);
    if (!step) return;
    step[field] = event.target.value;
    saveState();
  }
});

render();
