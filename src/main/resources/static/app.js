(() => {
    const app = document.getElementById("app");
    const feedback = document.getElementById("feedback");
    const questionDialog = document.getElementById("question-dialog");
    const confirmDialog = document.getElementById("confirm-dialog");

    const state = {
        questions: [],
        questionFilters: { search: "", difficulty: "", type: "", status: "active" },
        testSettings: { totalQuestions: 10, easyPercent: 40, mediumPercent: 40, hardPercent: 20 },
        generatedQuestions: [],
        testIndex: 0,
        testAnswers: {},
        testResult: null,
        attempt: null,
        answers: {},
        questionIndex: 0,
        pendingDeleteId: null,
        deletingQuestions: new Set(),
        questionDeleteErrors: new Map()
    };

    let routeVersion = 0;
    let feedbackTimer;

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function valueOrDash(value) {
        return value === null || value === undefined || value === ""
            ? "-"
            : escapeHtml(value);
    }

    function setActiveNavigation(path) {
        const section = path.startsWith("/questions")
            ? "questions"
            : path.startsWith("/tests") || path.startsWith("/assessment") || path.startsWith("/results")
                ? "tests"
                : "dashboard";

        document.querySelectorAll("[data-nav]").forEach((link) => {
            if (link.dataset.nav === section) {
                link.setAttribute("aria-current", "page");
            } else {
                link.removeAttribute("aria-current");
            }
        });
    }

    function pageHeading(title, description = "", actions = "") {
        return `<header class="page-heading">
            <div>
                <h1>${escapeHtml(title)}</h1>
                ${description ? `<p>${escapeHtml(description)}</p>` : ""}
            </div>
            ${actions ? `<div class="button-row">${actions}</div>` : ""}
        </header>`;
    }

    function showToast(message, isError = false) {
        window.clearTimeout(feedbackTimer);
        feedback.textContent = message;
        feedback.classList.toggle("is-error", isError);
        feedback.classList.add("is-visible");
        feedbackTimer = window.setTimeout(() => feedback.classList.remove("is-visible"), 3600);
    }

    function renderLoading(message = "Loading...") {
        app.innerHTML = `<div class="loading-state" role="status">${escapeHtml(message)}</div>`;
    }

    function renderError(error) {
        app.innerHTML = `${pageHeading("Unable to load this view")}
            <div class="empty-state">
                <div class="empty-state-title">Request failed</div>
                <div class="empty-state-text">${escapeHtml(error.message || "The request could not be completed.")}</div>
                <p style="margin-top: 14px;"><button class="button button-secondary" data-action="retry">Try again</button></p>
            </div>`;
    }

    function currentPath() {
        return window.location.hash.slice(1) || "/dashboard";
    }

    async function renderRoute() {
        const version = ++routeVersion;
        const path = currentPath();
        setActiveNavigation(path);
        renderLoading();

        try {
            if (path === "/dashboard") {
                const questions = await API.questions.list();
                if (version === routeVersion) renderDashboard(questions);
                return;
            }

            if (path === "/questions") {
                const questions = await API.questions.list();
                if (version === routeVersion) renderQuestionBank(questions);
                return;
            }

            if (path === "/questions/new") {
                const units = await API.units.list();
                if (version === routeVersion) renderQuestionForm(units);
                return;
            }

            const editMatch = path.match(/^\/questions\/(\d+)\/edit$/);
            if (editMatch) {
                const [question, units] = await Promise.all([
                    API.questions.get(editMatch[1]),
                    API.units.list()
                ]);
                if (version === routeVersion) renderQuestionForm(units, question);
                return;
            }

            if (path === "/tests") {
                const questions = await API.questions.list();
                if (version === routeVersion) renderTestBuilder(questions);
                return;
            }

            const assessmentMatch = path.match(/^\/assessment\/(\d+)$/);
            if (assessmentMatch) {
                const attempt = await API.attempts.get(assessmentMatch[1]);
                if (version !== routeVersion) return;
                if (attempt.result && attempt.result !== "NOT_SUBMITTED") {
                    window.location.hash = `#/results/${attempt.id}`;
                    return;
                }
                state.attempt = attempt;
                state.answers = readSavedAnswers(attempt.id);
                state.questionIndex = Math.min(state.questionIndex, Math.max(0, attempt.questions.length - 1));
                renderAssessment(attempt);
                return;
            }

            const resultsMatch = path.match(/^\/results\/(\d+)$/);
            if (resultsMatch) {
                const attempt = await API.attempts.get(resultsMatch[1]);
                if (version === routeVersion) renderResult(attempt);
                return;
            }

            window.location.hash = "#/dashboard";
        } catch (error) {
            if (version === routeVersion) renderError(error);
        }
    }

    // ==========================================================================
    // Dashboard
    // ==========================================================================

    function renderDashboard(questions) {
        state.questions = Array.isArray(questions) ? questions : [];
        const active = state.questions.filter((question) => String(question.status || "").toUpperCase() !== "DELETED");
        const skills = new Map();
        active.forEach((question) => {
            const skill = String(question.skill || "").trim();
            if (skill) skills.set(skill, (skills.get(skill) || 0) + 1);
        });

        const usedQuestions = active.filter((question) => Number(question.usageCount) > 0).length;
        const difficultyCounts = ["Easy", "Medium", "Hard"].map((difficulty) => ({
            difficulty,
            count: active.filter((question) => question.difficulty === difficulty).length
        }));
        const maxDifficulty = Math.max(1, ...difficultyCounts.map((item) => item.count));
        const skillRows = [...skills.entries()]
            .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
            .slice(0, 7);
        const mostUsed = [...active]
            .sort((first, second) => Number(second.usageCount || 0) - Number(first.usageCount || 0))
            .slice(0, 5);
        const lastResult = readLastResult();

        app.innerHTML = `${pageHeading("Dashboard", "Question bank and assessment activity", `<a class="button button-primary" href="#/questions/new">Add question</a>`)}
            
            <section class="info-strip" aria-label="Question bank overview">
                <div class="info-strip-cell">
                    <div class="metric-label">Active Questions</div>
                    <div class="metric-value">${active.length}</div>
                </div>
                <div class="info-strip-cell">
                    <div class="metric-label">Skills Represented</div>
                    <div class="metric-value">${skills.size}</div>
                </div>
                <div class="info-strip-cell">
                    <div class="metric-label">Questions Used</div>
                    <div class="metric-value">${usedQuestions}</div>
                </div>
            </section>

            <div class="dashboard-grid">
                <section class="section-block">
                    <div class="section-heading">
                        <h2>Questions by difficulty</h2>
                        <span class="small-text muted">Active questions</span>
                    </div>
                    ${active.length ? `<div class="distribution-list">${difficultyCounts.map((item) => `
                        <div class="distribution-row">
                            <span class="distribution-label">${item.difficulty}</span>
                            <div class="distribution-track" role="img" aria-label="${item.count} ${item.difficulty} questions">
                                <div class="distribution-fill" style="width:${(item.count / maxDifficulty) * 100}%"></div>
                            </div>
                            <span class="distribution-count">${item.count}</span>
                        </div>`).join("")}</div>` : `
                        <div class="empty-state">
                            <div class="empty-state-title">No active questions available</div>
                            <div class="empty-state-text">Create questions in the question bank to populate difficulty metrics.</div>
                        </div>`}
                </section>

                <section class="section-block">
                    <div class="section-heading">
                        <h2>Skills</h2>
                        <a class="small-text" href="#/questions">View bank</a>
                    </div>
                    ${skillRows.length ? `<div class="skill-list">${skillRows.map(([skill, count]) => `
                        <div class="skill-row">
                            <span class="skill-name">${escapeHtml(skill)}</span>
                            <span class="muted small-text">${count} ${count === 1 ? "question" : "questions"}</span>
                        </div>`).join("")}</div>` : `
                        <div class="empty-state">
                            <div class="empty-state-title">No skills recorded</div>
                            <div class="empty-state-text">Skills assigned to questions will appear here.</div>
                        </div>`}
                </section>
            </div>

            <section class="section-block">
                <div class="section-heading">
                    <h2>Question usage</h2>
                    <span class="small-text muted">Ordered by usage count</span>
                </div>
                ${mostUsed.length ? `<div class="table-wrap"><table class="usage-table">
                    <thead>
                        <tr>
                            <th style="width: 60%;">Question</th>
                            <th style="width: 25%;">Skill</th>
                            <th style="width: 15%; text-align: right;">Usage</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${mostUsed.map((question) => `
                        <tr>
                            <td class="question-cell">${escapeHtml(question.questionText || "")}</td>
                            <td class="table-secondary">${valueOrDash(question.skill)}</td>
                            <td style="text-align: right; font-weight: 700; font-variant-numeric: tabular-nums;">${Number(question.usageCount || 0)}</td>
                        </tr>`).join("")}
                    </tbody>
                </table></div>` : `
                <div class="empty-state">
                    <div class="empty-state-title">No question usage recorded</div>
                    <div class="empty-state-text">Generated assessments will record question usage frequency here.</div>
                </div>`}
            </section>

            ${lastResult ? renderRecentResult(lastResult) : ""}
            
            ${active.length === 0 ? `
            <div class="section-block">
                <div class="empty-state">
                    <div class="empty-state-title">Question bank is empty</div>
                    <div class="empty-state-text">Create questions in the bank before generating an assessment.</div>
                    <p style="margin-top: 14px;"><a class="button button-secondary" href="#/questions">Open Question Bank</a></p>
                </div>
            </div>` : ""}`;
    }

    function renderRecentResult(result) {
        const isPass = result.result === "PASS";
        return `<section class="section-block">
            <div class="section-heading">
                <h2>Last submitted assessment</h2>
                <a class="small-text" href="#/results/${encodeURIComponent(result.id)}">Open result</a>
            </div>
            <p class="muted">
                Attempt #${escapeHtml(result.id)} &middot;
                Status: <strong style="color: ${isPass ? "var(--accent)" : "var(--danger)"}">${escapeHtml(result.result)}</strong> &middot;
                Score: ${escapeHtml(result.score)} of ${escapeHtml(result.totalQuestions)} &middot;
                ${Number(result.percentage).toFixed(1)}%
            </p>
        </section>`;
    }

    // ==========================================================================
    // Question Bank
    // ==========================================================================

    function renderQuestionBank(questions) {
        state.questions = Array.isArray(questions) ? questions : [];
        state.questionFilters = { search: "", difficulty: "", type: "", status: "active" };
        const types = [...new Set(state.questions.map((question) => question.questionType).filter(Boolean))].sort();

        app.innerHTML = `${pageHeading("Question bank", "Review, filter, and maintain question records", `<a class="button button-primary" href="#/questions/new">Add question</a>`)}
            
            <div class="toolbar" aria-label="Question filters">
                <div class="field">
                    <label for="question-search">Search</label>
                    <input id="question-search" class="control" type="search" placeholder="Search question, skill, topic, unit, or tag">
                </div>
                <div class="field">
                    <label for="filter-difficulty">Difficulty</label>
                    <select id="filter-difficulty" class="control">
                        <option value="">All difficulties</option>
                        <option>Easy</option>
                        <option>Medium</option>
                        <option>Hard</option>
                    </select>
                </div>
                <div class="field">
                    <label for="filter-type">Question type</label>
                    <select id="filter-type" class="control">
                        <option value="">All types</option>
                        ${types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
                    </select>
                </div>
                <div class="field">
                    <label for="filter-status">Status</label>
                    <select id="filter-status" class="control">
                        <option value="active">Active</option>
                        <option value="all">All statuses</option>
                    </select>
                </div>
            </div>

            <div id="question-count" class="question-count-text"></div>

            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Question</th>
                            <th>Skill</th>
                            <th>Topic</th>
                            <th>Unit</th>
                            <th>Difficulty</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="question-rows"></tbody>
                </table>
            </div>`;

        renderQuestionRows();
    }

    function filteredQuestions() {
        const filters = state.questionFilters;
        return state.questions.filter((question) => {
            if (filters.status === "active" && String(question.status || "").toUpperCase() === "DELETED") return false;
            if (filters.difficulty && question.difficulty !== filters.difficulty) return false;
            if (filters.type && question.questionType !== filters.type) return false;
            if (filters.search) {
                const haystack = [question.questionText, question.skill, question.topic, question.unit?.name, question.tags]
                    .filter(Boolean).join(" ").toLowerCase();
                if (!haystack.includes(filters.search.toLowerCase())) return false;
            }
            return true;
        });
    }

    function renderQuestionRows() {
        const body = document.getElementById("question-rows");
        if (!body) return;
        const questions = filteredQuestions();
        const count = document.getElementById("question-count");
        count.textContent = `${questions.length} ${questions.length === 1 ? "question" : "questions"}`;

        if (!questions.length) {
            body.innerHTML = `<tr>
                <td colspan="8">
                    <div class="empty-state" style="border: 0; background: transparent; padding: 20px 8px;">
                        <div class="empty-state-title">No questions match these filters</div>
                        <div class="empty-state-text">Adjust the search query, difficulty, or question type to display records.</div>
                    </div>
                </td>
            </tr>`;
            return;
        }

        body.innerHTML = questions.map(questionRowHtml).join("");
    }

    function questionRowHtml(question) {
        const key = String(question.id);
        const deleted = String(question.status || "").toUpperCase() === "DELETED";
        const deleting = state.deletingQuestions.has(key);
        const statusClass = String(question.status || "").toUpperCase() === "APPROVED"
            ? "status-approved"
            : deleted ? "status-deleted" : "";

        return `<tr data-question-id="${question.id}">
            <td class="question-cell">${escapeHtml(question.questionText || "")}</td>
            <td class="table-secondary">${valueOrDash(question.skill)}</td>
            <td class="table-secondary">${valueOrDash(question.topic)}</td>
            <td class="table-secondary">${valueOrDash(question.unit?.name)}</td>
            <td class="table-secondary">${valueOrDash(question.difficulty)}</td>
            <td class="table-secondary">${valueOrDash(question.questionType)}</td>
            <td><span class="status-text ${statusClass}">${valueOrDash(question.status)}</span></td>
            <td>
                <div class="row-actions">
                    <button class="button-quiet" data-action="inspect-question" data-id="${question.id}">View</button>
                    <button class="button-quiet" data-action="edit-question" data-id="${question.id}">Edit</button>
                    ${deleted ? "" : `<button class="button-quiet button-delete" data-action="delete-question" data-id="${question.id}" ${deleting ? "disabled" : ""}>${deleting ? "Deleting..." : "Delete"}</button>`}
                </div>
                ${state.questionDeleteErrors.has(key) ? `<div class="row-error" role="alert">${escapeHtml(state.questionDeleteErrors.get(key))}</div>` : ""}
            </td>
        </tr>`;
    }

    function updateQuestionRow(id) {
        const key = String(id);
        const question = state.questions.find((item) => String(item.id) === key);
        const row = document.querySelector(`[data-question-id="${key}"]`);
        if (!question || !row) return;
        const filteredOut = state.questionFilters.status === "active" && String(question.status || "").toUpperCase() === "DELETED";

        if (filteredOut || !filteredQuestions().some((item) => String(item.id) === key)) {
            row.remove();
            const count = document.getElementById("question-count");
            const visibleCount = filteredQuestions().length;
            count.textContent = `${visibleCount} ${visibleCount === 1 ? "question" : "questions"}`;
            if (visibleCount === 0) renderQuestionRows();
            return;
        }
        row.outerHTML = questionRowHtml(question);
    }

    // ==========================================================================
    // Question Creation / Editing
    // ==========================================================================

    function canonicalType(type) {
        const normalized = String(type || "").toUpperCase();
        if (normalized === "MCQ" || normalized === "OBJECTIVE") return "MCQ";
        if (normalized === "CODING" || normalized === "PRACTICAL") return "CODING";
        return "SCENARIO";
    }

    function renderQuestionForm(units, question = null) {
        const editing = Boolean(question);
        const existingUnit = question?.unit;
        const unitOptions = [...(Array.isArray(units) ? units : [])];
        if (existingUnit?.id && !unitOptions.some((unit) => String(unit.id) === String(existingUnit.id))) {
            unitOptions.push(existingUnit);
        }
        const type = question ? canonicalType(question.questionType) : "MCQ";

        app.innerHTML = `${pageHeading(editing ? "Edit question" : "New question", "Enter question details, curriculum classification, and evaluation criteria.", `<a class="button button-secondary" href="#/questions">Back to bank</a>`)}
            
            <div class="form-layout">
                <form id="question-form" class="form-panel" novalidate>
                    <div id="question-form-message" class="form-message" aria-live="polite"></div>
                    
                    <section class="form-section">
                        <h2>Question</h2>
                        <div class="form-grid-1">
                            <div class="field">
                                <label for="question-text">Question text</label>
                                <textarea id="question-text" class="control" name="questionText" required placeholder="Enter assessment question text">${escapeHtml(question?.questionText)}</textarea>
                            </div>
                        </div>
                    </section>

                    <section class="form-section">
                        <h2>Classification</h2>
                        <div class="form-grid-3">
                            <div class="field">
                                <label for="question-skill">Skill</label>
                                <input id="question-skill" class="control" name="skill" list="skill-options" value="${escapeHtml(question?.skill)}" required placeholder="e.g. Java, Python, SQL">
                                <datalist id="skill-options">
                                    ${[...new Set(state.questions.map((item) => item.skill).filter(Boolean))].map((skill) => `<option value="${escapeHtml(skill)}"></option>`).join("")}
                                </datalist>
                            </div>
                            <div class="field">
                                <label for="question-topic">Topic</label>
                                <input id="question-topic" class="control" name="topic" value="${escapeHtml(question?.topic)}" placeholder="e.g. OOP, Collections">
                            </div>
                            <div class="field">
                                <label for="question-unit">Unit</label>
                                <select id="question-unit" class="control" name="unitId">
                                    <option value="">No unit</option>
                                    ${unitOptions.map((unit) => `<option value="${escapeHtml(unit.id)}" ${String(unit.id) === String(existingUnit?.id) ? "selected" : ""}>${escapeHtml(unit.name || `Unit ${unit.id}`)}</option>`).join("")}
                                </select>
                            </div>
                        </div>
                        <div class="form-grid-2" style="margin-top: 14px;">
                            <div class="field">
                                <label for="question-difficulty">Difficulty</label>
                                <select id="question-difficulty" class="control" name="difficulty" required>
                                    ${["Easy", "Medium", "Hard"].map((difficulty) => `<option value="${difficulty}" ${question?.difficulty === difficulty ? "selected" : ""}>${difficulty}</option>`).join("")}
                                </select>
                            </div>
                            <div class="field">
                                <label for="question-type">Question type</label>
                                <select id="question-type" class="control" name="questionType" required>
                                    ${[["MCQ", "Multiple Choice (MCQ)"], ["CODING", "Coding / Practical"], ["SCENARIO", "Scenario / Reasoning"]].map(([value, label]) => `<option value="${value}" ${type === value ? "selected" : ""}>${label}</option>`).join("")}
                                </select>
                            </div>
                        </div>
                    </section>

                    <section class="form-section type-fields" data-fields="MCQ" ${type !== "MCQ" ? "hidden" : ""}>
                        <h2>Options</h2>
                        <div class="form-grid-2">
                            <div class="field">
                                <label for="option-a">Option A</label>
                                <input id="option-a" class="control" name="optionA" value="${escapeHtml(question?.optionA)}" data-required="true">
                            </div>
                            <div class="field">
                                <label for="option-b">Option B</label>
                                <input id="option-b" class="control" name="optionB" value="${escapeHtml(question?.optionB)}" data-required="true">
                            </div>
                            <div class="field">
                                <label for="option-c">Option C</label>
                                <input id="option-c" class="control" name="optionC" value="${escapeHtml(question?.optionC)}" data-required="true">
                            </div>
                            <div class="field">
                                <label for="option-d">Option D</label>
                                <input id="option-d" class="control" name="optionD" value="${escapeHtml(question?.optionD)}" data-required="true">
                            </div>
                        </div>
                        <div class="form-grid-1" style="margin-top: 14px;">
                            <div class="field">
                                <label for="correct-answer-mcq">Correct answer</label>
                                <input id="correct-answer-mcq" class="control" name="correctAnswerMcq" value="${escapeHtml(question?.correctAnswer)}" data-required="true">
                                <span class="field-hint">Enter the exact option text matching the correct choice.</span>
                            </div>
                            <div class="field">
                                <label for="explanation-mcq">Explanation</label>
                                <textarea id="explanation-mcq" class="control" name="explanationMcq" placeholder="Rationale for correct answer">${escapeHtml(question?.explanation)}</textarea>
                            </div>
                        </div>
                    </section>

                    <section class="form-section type-fields" data-fields="CODING" ${type !== "CODING" ? "hidden" : ""}>
                        <h2>Practical evaluation</h2>
                        <div class="form-grid-2">
                            <div class="field">
                                <label for="programming-language">Programming language</label>
                                <input id="programming-language" class="control" name="language" value="${escapeHtml(question?.language)}" data-required="true" placeholder="e.g. Java, Python">
                            </div>
                            <div class="field">
                                <label for="evaluation-type">Evaluation type</label>
                                <input id="evaluation-type" class="control" name="evaluationType" value="${escapeHtml(question?.evaluationType)}" placeholder="e.g. Unit tests, Standard output">
                            </div>
                        </div>
                        <div class="form-grid-1" style="margin-top: 14px;">
                            <div class="field">
                                <label for="starter-code">Starter code</label>
                                <textarea id="starter-code" class="control code-control" name="starterCode" placeholder="// Template provided to candidate">${escapeHtml(question?.starterCode)}</textarea>
                            </div>
                            <div class="field">
                                <label for="test-cases">Test cases</label>
                                <textarea id="test-cases" class="control code-control" name="testCases" data-required="true" placeholder="// Automated assertions">${escapeHtml(question?.testCases)}</textarea>
                            </div>
                        </div>
                        <div class="form-grid-2" style="margin-top: 14px;">
                            <div class="field">
                                <label for="expected-output">Expected output</label>
                                <textarea id="expected-output" class="control" name="expectedOutput">${escapeHtml(question?.expectedOutput)}</textarea>
                            </div>
                            <div class="field">
                                <label for="constraints">Constraints</label>
                                <textarea id="constraints" class="control" name="constraints">${escapeHtml(question?.constraints)}</textarea>
                            </div>
                        </div>
                    </section>

                    <section class="form-section type-fields" data-fields="SCENARIO" ${type !== "SCENARIO" ? "hidden" : ""}>
                        <h2>Expected response</h2>
                        <div class="form-grid-1">
                            <div class="field">
                                <label for="correct-answer-scenario">Correct answer / Model solution</label>
                                <textarea id="correct-answer-scenario" class="control" name="correctAnswerScenario" data-required="true">${escapeHtml(question?.correctAnswer)}</textarea>
                            </div>
                            <div class="field">
                                <label for="explanation-scenario">Explanation / Rubric</label>
                                <textarea id="explanation-scenario" class="control" name="explanationScenario">${escapeHtml(question?.explanation)}</textarea>
                            </div>
                        </div>
                    </section>

                    <section class="form-section">
                        <h2>Metadata</h2>
                        <div class="form-grid-3">
                            <div class="field">
                                <label for="question-tags">Tags</label>
                                <input id="question-tags" class="control" name="tags" value="${escapeHtml(question?.tags)}" placeholder="comma-separated tags">
                            </div>
                            <div class="field">
                                <label for="question-source">Source</label>
                                <input id="question-source" class="control" name="source" value="${escapeHtml(question?.source)}" placeholder="e.g. Midterm 2024">
                            </div>
                            <div class="field">
                                <label for="question-status">Status</label>
                                <select id="question-status" class="control" name="status" required>
                                    <option value="APPROVED" ${question?.status === "APPROVED" || !question ? "selected" : ""}>APPROVED</option>
                                    <option value="DRAFT" ${question?.status === "DRAFT" ? "selected" : ""}>DRAFT</option>
                                </select>
                                <span class="field-hint">Only APPROVED questions are used in test generation.</span>
                            </div>
                        </div>
                    </section>

                    <div class="form-actions">
                        <a class="button button-secondary" href="#/questions">Cancel</a>
                        <button class="button button-primary" type="submit" data-label="${editing ? "Save changes" : "Create question"}">
                            ${editing ? "Save changes" : "Create question"}
                        </button>
                    </div>
                </form>
            </div>`;

        updateTypeFields(type);
        app.dataset.editingQuestionId = editing ? question.id : "";
    }

    function updateTypeFields(type) {
        document.querySelectorAll("[data-fields]").forEach((section) => {
            const visible = section.dataset.fields === type;
            section.hidden = !visible;
            section.querySelectorAll("input, textarea, select").forEach((control) => {
                control.required = visible && control.dataset.required === "true";
            });
        });
    }

    function buildQuestionPayload(form) {
        const data = new FormData(form);
        const type = data.get("questionType");
        const unitId = data.get("unitId");
        return {
            questionText: String(data.get("questionText") || "").trim(),
            skill: String(data.get("skill") || "").trim(),
            topic: String(data.get("topic") || "").trim() || null,
            difficulty: data.get("difficulty"),
            questionType: type,
            status: String(data.get("status") || "APPROVED").trim(),
            tags: String(data.get("tags") || "").trim() || null,
            source: String(data.get("source") || "").trim() || null,
            unit: unitId ? { id: Number(unitId) } : null,
            optionA: type === "MCQ" ? String(data.get("optionA") || "").trim() : null,
            optionB: type === "MCQ" ? String(data.get("optionB") || "").trim() : null,
            optionC: type === "MCQ" ? String(data.get("optionC") || "").trim() : null,
            optionD: type === "MCQ" ? String(data.get("optionD") || "").trim() : null,
            correctAnswer: type === "MCQ"
                ? String(data.get("correctAnswerMcq") || "").trim()
                : type === "SCENARIO"
                    ? String(data.get("correctAnswerScenario") || "").trim()
                    : null,
            explanation: type === "MCQ"
                ? String(data.get("explanationMcq") || "").trim() || null
                : type === "SCENARIO"
                    ? String(data.get("explanationScenario") || "").trim() || null
                    : null,
            language: type === "CODING" ? String(data.get("language") || "").trim() : null,
            starterCode: type === "CODING" ? String(data.get("starterCode") || "").trim() || null : null,
            testCases: type === "CODING" ? String(data.get("testCases") || "").trim() : null,
            expectedOutput: type === "CODING" ? String(data.get("expectedOutput") || "").trim() || null : null,
            constraints: type === "CODING" ? String(data.get("constraints") || "").trim() || null : null,
            evaluationType: type === "CODING" ? String(data.get("evaluationType") || "").trim() || null : null
        };
    }

    // ==========================================================================
    // Generate Test Page (Two-Stage Architecture)
    // ==========================================================================

    function getApprovedAvailability(questions) {
        const approved = questions.filter((question) => String(question.status || "").toUpperCase() === "APPROVED");
        return Object.fromEntries(["Easy", "Medium", "Hard"].map((difficulty) => [
            difficulty,
            approved.filter((question) => question.difficulty === difficulty).length
        ]));
    }

    function calculateRequested(total, easyPercent, mediumPercent, hardPercent) {
        const easy = Math.floor((total * easyPercent) / 100);
        const medium = Math.floor((total * mediumPercent) / 100);
        const hard = total - easy - medium;
        return { Easy: easy, Medium: medium, Hard: hard };
    }

    function checkTestAvailability(settings, questions) {
        const availability = getApprovedAvailability(questions);
        const percentages = [settings.easyPercent, settings.mediumPercent, settings.hardPercent];
        const requested = calculateRequested(settings.totalQuestions, settings.easyPercent, settings.mediumPercent, settings.hardPercent);

        if (!Number.isInteger(settings.totalQuestions) || settings.totalQuestions <= 0) {
            return { availability, requested, error: "Total questions must be greater than 0." };
        }
        if (percentages.some((value) => !Number.isInteger(value) || value < 0 || value > 100)) {
            return { availability, requested, error: "Enter whole-number percentages between 0 and 100." };
        }
        const sum = percentages.reduce((acc, val) => acc + val, 0);
        if (sum !== 100) {
            return { availability, requested, error: `Difficulty percentages must sum to 100% (currently ${sum}%).` };
        }

        const shortages = ["Easy", "Medium", "Hard"].filter((diff) => requested[diff] > availability[diff]);
        const messages = shortages.map((diff) => {
            const avail = availability[diff];
            const req = requested[diff];
            return `${diff}: ${avail} available, ${req} requested. Not enough approved questions.`;
        });

        return {
            availability,
            requested,
            shortages,
            error: messages.join(" ")
        };
    }

    function renderTestBuilder(questions) {
        state.questions = Array.isArray(questions) ? questions : [];
        const settings = state.testSettings;
        const check = checkTestAvailability(settings, state.questions);
        const percentagesSum = settings.easyPercent + settings.mediumPercent + settings.hardPercent;
        const hasError = Boolean(check.error || check.shortages?.length);

        app.innerHTML = `${pageHeading("Generate Test", "Configure difficulty distribution and generate an academic assessment.")}
            
            <section class="test-stage" id="stage-1-configuration" aria-labelledby="stage-1-heading">
                <div class="stage-head">
                    <h2 id="stage-1-heading" class="stage-title">STAGE 1: TEST CONFIGURATION</h2>
                    <span class="stage-desc">Approved questions from the bank are evaluated against requested distribution.</span>
                </div>

                <form id="test-form" novalidate>
                    <div class="test-config-panel">
                        <div class="field">
                            <label for="total-questions">Total questions</label>
                            <input id="total-questions" class="control" name="totalQuestions" type="number" min="1" step="1" value="${settings.totalQuestions}" required>
                        </div>
                        <div class="field">
                            <span class="field-label">Difficulty distribution (%)</span>
                            <div class="percentage-inputs">
                                <div class="field">
                                    <label for="easy-percent">Easy</label>
                                    <input id="easy-percent" class="control percentage-input" name="easyPercent" type="number" min="0" max="100" step="1" value="${settings.easyPercent}" required>
                                </div>
                                <div class="field">
                                    <label for="medium-percent">Medium</label>
                                    <input id="medium-percent" class="control percentage-input" name="mediumPercent" type="number" min="0" max="100" step="1" value="${settings.mediumPercent}" required>
                                </div>
                                <div class="field">
                                    <label for="hard-percent">Hard</label>
                                    <input id="hard-percent" class="control percentage-input" name="hardPercent" type="number" min="0" max="100" step="1" value="${settings.hardPercent}" required>
                                </div>
                            </div>
                            <div class="percentage-sum-row ${percentagesSum !== 100 ? "is-invalid" : ""}" id="percentage-sum-display">
                                <span>Total distribution</span>
                                <span id="percentage-total-text">${percentagesSum}%</span>
                            </div>
                        </div>
                    </div>

                    <div class="comparison-grid" id="comparison-grid" aria-label="Requested versus available approved questions">
                        ${renderComparisonCards(check)}
                    </div>

                    <div id="test-form-error" class="form-message" role="status" aria-live="polite">
                        ${check.error ? `<div class="alert">${escapeHtml(check.error)}</div>` : ""}
                    </div>

                    <div class="button-row">
                        <button class="button button-primary" type="submit" ${hasError ? "disabled" : ""}>Generate questions</button>
                        <button class="button button-secondary" type="button" data-action="refresh-availability">Refresh availability</button>
                    </div>
                </form>
            </section>

            <section class="test-stage" id="stage-2-assessment" aria-labelledby="stage-2-heading" style="border-bottom: 0;">
                <div class="stage-head">
                    <h2 id="stage-2-heading" class="stage-title">STAGE 2: GENERATED ASSESSMENT</h2>
                    ${state.generatedQuestions.length ? `<span class="stage-desc">${state.generatedQuestions.length} questions in current assessment</span>` : ""}
                </div>

                <div id="stage-2-content" class="assessment-stage-container">
                    ${renderStage2Content()}
                </div>
            </section>`;
    }

    function renderComparisonCards(check) {
        return ["Easy", "Medium", "Hard"].map((difficulty) => {
            const avail = check.availability[difficulty] ?? 0;
            const req = check.requested[difficulty] ?? 0;
            const isShortage = req > avail;
            return `<div class="comp-card ${isShortage ? "is-shortage" : ""}" data-comp-diff="${difficulty}">
                <div class="comp-card-head">
                    <strong>${difficulty}</strong>
                    <span class="small-text ${isShortage ? "danger-text" : "muted"}">${isShortage ? "Shortage" : "Available"}</span>
                </div>
                <div class="comp-card-rows">
                    <div class="comp-row">
                        <span>Requested</span>
                        <span class="comp-val-bold" data-comp-req="${difficulty}">${req}</span>
                    </div>
                    <div class="comp-row">
                        <span>Available</span>
                        <span class="comp-val-bold" data-comp-avail="${difficulty}">${avail}</span>
                    </div>
                </div>
                <div class="comp-note" data-comp-note="${difficulty}">
                    ${isShortage ? "Not enough approved questions." : "Sufficient approved questions."}
                </div>
            </div>`;
        }).join("");
    }

    function updateLiveAvailability() {
        const form = document.getElementById("test-form");
        if (!form) return;
        const total = parseInt(form.totalQuestions.value, 10) || 0;
        const easyP = parseInt(form.easyPercent.value, 10) || 0;
        const medP = parseInt(form.mediumPercent.value, 10) || 0;
        const hardP = parseInt(form.hardPercent.value, 10) || 0;

        state.testSettings = {
            totalQuestions: total,
            easyPercent: easyP,
            mediumPercent: medP,
            hardPercent: hardP
        };

        const check = checkTestAvailability(state.testSettings, state.questions);
        const sum = easyP + medP + hardP;

        const sumDisplay = document.getElementById("percentage-sum-display");
        const sumText = document.getElementById("percentage-total-text");
        if (sumDisplay && sumText) {
            sumText.textContent = `${sum}%`;
            sumDisplay.classList.toggle("is-invalid", sum !== 100);
        }

        ["Easy", "Medium", "Hard"].forEach((difficulty) => {
            const card = document.querySelector(`.comp-card[data-comp-diff="${difficulty}"]`);
            const reqEl = document.querySelector(`[data-comp-req="${difficulty}"]`);
            const availEl = document.querySelector(`[data-comp-avail="${difficulty}"]`);
            const noteEl = document.querySelector(`[data-comp-note="${difficulty}"]`);
            if (card && reqEl && availEl && noteEl) {
                const req = check.requested[difficulty] ?? 0;
                const avail = check.availability[difficulty] ?? 0;
                const isShortage = req > avail;
                reqEl.textContent = req;
                availEl.textContent = avail;
                card.classList.toggle("is-shortage", isShortage);
                card.querySelector(".comp-card-head span").textContent = isShortage ? "Shortage" : "Available";
                noteEl.textContent = isShortage ? "Not enough approved questions." : "Sufficient approved questions.";
            }
        });

        const errorContainer = document.getElementById("test-form-error");
        if (errorContainer) {
            errorContainer.innerHTML = check.error ? `<div class="alert">${escapeHtml(check.error)}</div>` : "";
        }

        const submitBtn = form.querySelector('[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = Boolean(check.error || check.shortages?.length);
        }
    }

    function renderStage2Content() {
        if (state.testResult) {
            return renderStage2Result(state.testResult);
        }

        const questions = state.generatedQuestions;
        if (!questions.length) {
            return `<div class="empty-state">
                <div class="empty-state-title">No assessment generated yet.</div>
                <div class="empty-state-text">Configure the test above and generate questions to begin.</div>
            </div>`;
        }

        const index = Math.min(Math.max(state.testIndex, 0), questions.length - 1);
        state.testIndex = index;
        const question = questions[index];
        const options = (question.options || []).filter((opt) => opt !== null && opt !== undefined && String(opt).trim());
        const selectedAnswer = state.testAnswers[question.id] || "";
        const progress = ((index + 1) / questions.length) * 100;

        const optionLetters = ["A", "B", "C", "D"];
        const optionsHtml = options.length
            ? `<fieldset class="option-group" aria-label="Answer options">
                ${options.map((opt, optIdx) => {
                    const letter = optionLetters[optIdx] || String(optIdx + 1);
                    const isChecked = selectedAnswer === opt;
                    return `<label class="option-label">
                        <input type="radio" name="test-answer-${question.id}" value="${escapeHtml(opt)}" data-stage2-option="true" data-question-id="${question.id}" ${isChecked ? "checked" : ""}>
                        <span class="option-prefix">${letter}.</span>
                        <span class="option-text">${escapeHtml(opt)}</span>
                    </label>`;
                }).join("")}
            </fieldset>`
            : `<div class="field">
                <label for="test-written-answer">Your answer</label>
                <textarea id="test-written-answer" class="control code-control" name="test-answer-${question.id}" data-stage2-textarea="true" data-question-id="${question.id}" rows="6" placeholder="Enter solution response">${escapeHtml(selectedAnswer)}</textarea>
            </div>`;

        return `<div class="assessment-interface">
            <div class="assessment-interface-header">
                <div class="assessment-q-counter">Question ${index + 1} of ${questions.length}</div>
                <div class="assessment-progress-track" role="progressbar" aria-label="Assessment progress" aria-valuemin="1" aria-valuemax="${questions.length}" aria-valuenow="${index + 1}">
                    <div class="assessment-progress-bar" style="width: ${progress}%;"></div>
                </div>
            </div>

            <div class="assessment-interface-body">
                <div class="assessment-question-text">${escapeHtml(question.questionText || "")}</div>
                <div class="assessment-meta-line">
                    Skill: <strong>${escapeHtml(question.skill || "-")}</strong> &middot;
                    Topic: <strong>${escapeHtml(question.topic || "-")}</strong> &middot;
                    Difficulty: <strong>${escapeHtml(question.difficulty || "-")}</strong>
                </div>
                ${optionsHtml}
            </div>

            <div class="assessment-interface-footer">
                <div class="button-row">
                    <button class="button button-secondary" data-action="stage2-prev" ${index === 0 ? "disabled" : ""}>Previous</button>
                    <button class="button button-secondary" data-action="stage2-next" ${index === questions.length - 1 ? "disabled" : ""}>Next</button>
                </div>
                <button class="button button-primary" data-action="stage2-submit">Submit assessment</button>
            </div>
        </div>`;
    }

    function renderStage2Result(result) {
        const isPass = result.result === "PASS";
        return `<div class="assessment-result-panel">
            <span class="result-status-badge ${isPass ? "pass" : "fail"}">Assessment Result: ${escapeHtml(result.result)}</span>
            <dl class="result-metrics-grid">
                <div class="result-metric-item">
                    <dt>Score</dt>
                    <dd>${escapeHtml(result.score)} / ${escapeHtml(result.totalQuestions)}</dd>
                </div>
                <div class="result-metric-item">
                    <dt>Total Questions</dt>
                    <dd>${escapeHtml(result.totalQuestions)}</dd>
                </div>
                <div class="result-metric-item">
                    <dt>Percentage</dt>
                    <dd>${Number(result.percentage).toFixed(1)}%</dd>
                </div>
            </dl>
            <div class="button-row">
                <button class="button button-primary" data-action="stage2-reset">Generate another test</button>
                <a class="button button-secondary" href="#/dashboard">Dashboard</a>
            </div>
        </div>`;
    }

    async function handleTestSubmit(form) {
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        submit.textContent = "Checking availability...";

        const errorContainer = document.getElementById("test-form-error");
        if (errorContainer) errorContainer.innerHTML = "";

        try {
            state.questions = await API.questions.list();
            const check = checkTestAvailability(state.testSettings, state.questions);
            if (check.error || check.shortages?.length) {
                updateLiveAvailability();
                submit.textContent = "Generate questions";
                return;
            }

            submit.textContent = "Generating...";
            const generated = await API.tests.generate(state.testSettings);
            state.generatedQuestions = Array.isArray(generated) ? generated : [];
            state.testIndex = 0;
            state.testAnswers = {};
            state.testResult = null;

            const stage2 = document.getElementById("stage-2-content");
            if (stage2) {
                stage2.innerHTML = renderStage2Content();
            }

            submit.textContent = "Generate questions";
            submit.disabled = false;

            document.getElementById("stage-2-assessment")?.scrollIntoView({ behavior: "smooth" });
        } catch (error) {
            if (errorContainer) {
                errorContainer.innerHTML = `<div class="alert" role="alert">${escapeHtml(error.message)}</div>`;
            }
            submit.textContent = "Generate questions";
            submit.disabled = false;
        }
    }

    async function refreshAvailability(button) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Refreshing...";
        try {
            state.questions = await API.questions.list();
            updateLiveAvailability();
            showToast("Availability counts refreshed from question bank.");
        } catch (error) {
            showToast(error.message, true);
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    async function submitStage2Assessment() {
        const questions = state.generatedQuestions;
        if (!questions.length) return;

        const unanswered = questions.filter((q) => !String(state.testAnswers[q.id] || "").trim()).length;
        if (unanswered && !window.confirm(`There ${unanswered === 1 ? "is" : "are"} ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Submit assessment anyway?`)) {
            return;
        }

        const submitBtn = document.querySelector('[data-action="stage2-submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting...";
        }

        try {
            const attempt = await API.attempts.create(questions.map((q) => q.id));
            const submission = questions.map((q) => ({
                questionId: q.id,
                answer: String(state.testAnswers[q.id] || "")
            }));
            const result = await API.attempts.submit(attempt.id, submission);

            try {
                localStorage.setItem("examcraft-last-result", JSON.stringify(result));
            } catch {
                // Ignore localStorage errors
            }

            state.testResult = result;
            const stage2 = document.getElementById("stage-2-content");
            if (stage2) {
                stage2.innerHTML = renderStage2Result(result);
            }
        } catch (error) {
            showToast(`Submission failed: ${error.message}`, true);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Submit assessment";
            }
        }
    }

    // ==========================================================================
    // Standalone Assessment / Result Views
    // ==========================================================================

    function readSavedAnswers(id) {
        try {
            return JSON.parse(sessionStorage.getItem(`examcraft-attempt-${id}`) || "{}");
        } catch {
            return {};
        }
    }

    function saveAnswers(id) {
        try {
            sessionStorage.setItem(`examcraft-attempt-${id}`, JSON.stringify(state.answers));
        } catch {
            showToast("Answers could not be saved in this browser session.", true);
        }
    }

    function renderAssessment(attempt) {
        const questions = Array.isArray(attempt.questions) ? attempt.questions : [];
        if (!questions.length) {
            app.innerHTML = `${pageHeading(`Assessment #${attempt.id}`)}
                <div class="empty-state">
                    <div class="empty-state-title">No questions found</div>
                    <div class="empty-state-text">This assessment attempt has no questions associated with it.</div>
                </div>`;
            return;
        }

        const index = Math.min(Math.max(state.questionIndex, 0), questions.length - 1);
        state.questionIndex = index;
        const question = questions[index];
        const options = (question.options || []).filter((opt) => opt !== null && opt !== undefined && String(opt).trim());
        const answer = state.answers[question.id] || "";
        const progress = ((index + 1) / questions.length) * 100;
        const optionLetters = ["A", "B", "C", "D"];

        const answerControl = options.length
            ? `<fieldset class="option-group" aria-label="Answer options">
                ${options.map((opt, optIdx) => {
                    const letter = optionLetters[optIdx] || String(optIdx + 1);
                    return `<label class="option-label">
                        <input type="radio" name="standalone-answer" value="${escapeHtml(opt)}" ${answer === opt ? "checked" : ""}>
                        <span class="option-prefix">${letter}.</span>
                        <span class="option-text">${escapeHtml(opt)}</span>
                    </label>`;
                }).join("")}
            </fieldset>`
            : `<div class="field">
                <label for="standalone-written-answer">Your answer</label>
                <textarea id="standalone-written-answer" class="control code-control" name="standalone-answer" rows="6" placeholder="Enter solution response">${escapeHtml(answer)}</textarea>
            </div>`;

        app.innerHTML = `${pageHeading(`Assessment #${escapeHtml(attempt.id)}`, "Academic assessment in progress.")}
            <div class="assessment-interface" style="max-width: 860px; margin: 0 auto;">
                <div class="assessment-interface-header">
                    <div class="assessment-q-counter">Question ${index + 1} of ${questions.length}</div>
                    <div class="assessment-progress-track" role="progressbar" aria-label="Assessment progress" aria-valuemin="1" aria-valuemax="${questions.length}" aria-valuenow="${index + 1}">
                        <div class="assessment-progress-bar" style="width: ${progress}%;"></div>
                    </div>
                </div>

                <div class="assessment-interface-body">
                    <div class="assessment-question-text">${escapeHtml(question.questionText || "")}</div>
                    <div class="assessment-meta-line">
                        Skill: <strong>${escapeHtml(question.skill || "-")}</strong> &middot;
                        Topic: <strong>${escapeHtml(question.topic || "-")}</strong> &middot;
                        Difficulty: <strong>${escapeHtml(question.difficulty || "-")}</strong>
                    </div>
                    ${answerControl}
                </div>

                <div class="assessment-interface-footer">
                    <div class="button-row">
                        <button class="button button-secondary" data-action="previous-question" ${index === 0 ? "disabled" : ""}>Previous</button>
                        <button class="button button-secondary" data-action="next-question" ${index === questions.length - 1 ? "disabled" : ""}>Next</button>
                    </div>
                    <button class="button button-primary" data-action="submit-attempt">Submit assessment</button>
                </div>
            </div>`;
    }

    async function submitAssessment() {
        if (!state.attempt) return;
        const questions = state.attempt.questions || [];
        const unanswered = questions.filter((question) => !String(state.answers[question.id] || "").trim()).length;
        if (unanswered && !window.confirm(`There ${unanswered === 1 ? "is" : "are"} ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Submit anyway?`)) {
            return;
        }

        const button = document.querySelector('[data-action="submit-attempt"]');
        if (button) {
            button.disabled = true;
            button.textContent = "Submitting...";
        }
        try {
            const answers = questions.map((question) => ({
                questionId: question.id,
                answer: String(state.answers[question.id] || "")
            }));
            const result = await API.attempts.submit(state.attempt.id, answers);
            try {
                localStorage.setItem("examcraft-last-result", JSON.stringify(result));
                sessionStorage.removeItem(`examcraft-attempt-${state.attempt.id}`);
            } catch {
                // Ignore storage error
            }
            window.location.hash = `#/results/${result.id}`;
        } catch (error) {
            showToast(error.message, true);
            if (button) {
                button.disabled = false;
                button.textContent = "Submit assessment";
            }
        }
    }

    function renderResult(attempt) {
        if (!attempt.result || attempt.result === "NOT_SUBMITTED") {
            app.innerHTML = `${pageHeading(`Assessment #${attempt.id} result`)}
                <div class="empty-state">
                    <div class="empty-state-title">Not submitted</div>
                    <div class="empty-state-text">This assessment does not have a submitted result yet.</div>
                    <p style="margin-top: 14px;"><a class="button button-primary" href="#/assessment/${encodeURIComponent(attempt.id)}">Resume assessment</a></p>
                </div>`;
            return;
        }

        const isPass = attempt.result === "PASS";
        app.innerHTML = `${pageHeading(`Assessment #${attempt.id} result`, "Submitted assessment evaluation record.")}
            <div class="assessment-result-panel" style="max-width: 720px; margin: 0 auto;">
                <span class="result-status-badge ${isPass ? "pass" : "fail"}">Assessment Result: ${escapeHtml(attempt.result)}</span>
                <dl class="result-metrics-grid">
                    <div class="result-metric-item">
                        <dt>Score</dt>
                        <dd>${escapeHtml(attempt.score)} / ${escapeHtml(attempt.totalQuestions)}</dd>
                    </div>
                    <div class="result-metric-item">
                        <dt>Total Questions</dt>
                        <dd>${escapeHtml(attempt.totalQuestions)}</dd>
                    </div>
                    <div class="result-metric-item">
                        <dt>Percentage</dt>
                        <dd>${Number(attempt.percentage).toFixed(1)}%</dd>
                    </div>
                </dl>
                <div class="button-row">
                    <a class="button button-primary" href="#/tests">Generate another test</a>
                    <a class="button button-secondary" href="#/dashboard">Dashboard</a>
                </div>
            </div>`;
    }

    function readLastResult() {
        try {
            const result = JSON.parse(localStorage.getItem("examcraft-last-result") || "null");
            return result && result.result && result.result !== "NOT_SUBMITTED" ? result : null;
        } catch {
            return null;
        }
    }

    // ==========================================================================
    // Question Inspection & Delete Confirmation
    // ==========================================================================

    async function inspectQuestion(id) {
        const content = document.getElementById("question-details");
        content.innerHTML = `<p class="loading-state" role="status">Loading question details...</p>`;
        questionDialog.showModal();
        try {
            const question = await API.questions.get(id);
            const fields = [
                ["Question", question.questionText],
                ["Skill", question.skill],
                ["Topic", question.topic],
                ["Unit", question.unit?.name],
                ["Difficulty", question.difficulty],
                ["Question type", question.questionType],
                ["Status", question.status],
                ["Usage count", question.usageCount],
                ["Option A", question.optionA],
                ["Option B", question.optionB],
                ["Option C", question.optionC],
                ["Option D", question.optionD],
                ["Correct answer", question.correctAnswer],
                ["Explanation", question.explanation],
                ["Language", question.language],
                ["Starter code", question.starterCode],
                ["Test cases", question.testCases],
                ["Expected output", question.expectedOutput],
                ["Constraints", question.constraints],
                ["Evaluation type", question.evaluationType],
                ["Tags", question.tags],
                ["Source", question.source]
            ].filter(([, value]) => value !== null && value !== undefined && value !== "");

            content.innerHTML = `<dl>${fields.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>`;
        } catch (error) {
            content.innerHTML = `<div class="alert" role="alert">${escapeHtml(error.message)}</div>`;
        }
    }

    function requestQuestionDelete(id) {
        const question = state.questions.find((item) => String(item.id) === String(id));
        state.pendingDeleteId = id;
        document.getElementById("confirm-title").textContent = "Delete question";
        document.getElementById("confirm-message").textContent = question
            ? `"${question.questionText}" will be marked DELETED and excluded from new tests.`
            : "This question will be marked DELETED.";
        document.getElementById("confirm-action").textContent = "Delete question";
        confirmDialog.showModal();
    }

    async function performQuestionDelete(id) {
        const key = String(id);
        if (state.deletingQuestions.has(key)) return;
        state.deletingQuestions.add(key);
        state.questionDeleteErrors.delete(key);
        updateQuestionRow(key);
        try {
            await API.questions.remove(id);
            const question = state.questions.find((item) => String(item.id) === key);
            if (question) question.status = "DELETED";
            showToast("Question deleted.");
        } catch (error) {
            state.questionDeleteErrors.set(key, error.message);
            showToast(error.message, true);
        } finally {
            state.deletingQuestions.delete(key);
            updateQuestionRow(key);
        }
    }

    async function handleQuestionSubmit(form) {
        const message = document.getElementById("question-form-message");
        const submit = form.querySelector('[type="submit"]');
        const editId = app.dataset.editingQuestionId;
        submit.disabled = true;
        submit.textContent = editId ? "Saving..." : "Creating...";
        message.innerHTML = "";
        try {
            const payload = buildQuestionPayload(form);
            if (editId) {
                await API.questions.update(editId, payload);
                showToast("Question updated successfully.");
            } else {
                await API.questions.create(payload);
                showToast("Question created successfully.");
            }
            window.location.hash = "#/questions";
        } catch (error) {
            message.innerHTML = `<div class="alert" role="alert">${escapeHtml(error.message)}</div>`;
            submit.disabled = false;
            submit.textContent = submit.dataset.label;
        }
    }

    // ==========================================================================
    // Event Delegation
    // ==========================================================================

    document.addEventListener("input", (event) => {
        if (event.target.id === "question-search") {
            state.questionFilters.search = event.target.value;
            renderQuestionRows();
        }

        if (event.target.matches("#total-questions, .percentage-input")) {
            updateLiveAvailability();
        }

        if (event.target.dataset.stage2Option === "true" || event.target.dataset.stage2Textarea === "true") {
            const qId = event.target.dataset.questionId;
            state.testAnswers[qId] = event.target.value;
        }

        if (event.target.name === "standalone-answer" && state.attempt) {
            state.answers[state.attempt.questions[state.questionIndex].id] = event.target.value;
            saveAnswers(state.attempt.id);
        }
    });

    document.addEventListener("change", (event) => {
        if (event.target.id === "filter-difficulty") {
            state.questionFilters.difficulty = event.target.value;
            renderQuestionRows();
        } else if (event.target.id === "filter-type") {
            state.questionFilters.type = event.target.value;
            renderQuestionRows();
        } else if (event.target.id === "filter-status") {
            state.questionFilters.status = event.target.value;
            renderQuestionRows();
        } else if (event.target.id === "question-type") {
            updateTypeFields(event.target.value);
        } else if (event.target.dataset.stage2Option === "true") {
            const qId = event.target.dataset.questionId;
            state.testAnswers[qId] = event.target.value;
        } else if (event.target.name === "standalone-answer" && state.attempt) {
            state.answers[state.attempt.questions[state.questionIndex].id] = event.target.value;
            saveAnswers(state.attempt.id);
        }
    });

    document.addEventListener("submit", (event) => {
        if (event.target.id === "question-form") {
            event.preventDefault();
            if (event.target.reportValidity()) handleQuestionSubmit(event.target);
        } else if (event.target.id === "test-form") {
            event.preventDefault();
            if (event.target.reportValidity()) handleTestSubmit(event.target);
        }
    });

    document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        const { action, id } = button.dataset;

        if (action === "retry") renderRoute();
        if (action === "inspect-question") inspectQuestion(id);
        if (action === "edit-question") window.location.hash = `#/questions/${id}/edit`;
        if (action === "delete-question") requestQuestionDelete(id);
        if (action === "refresh-availability") refreshAvailability(button);

        // Stage 2 actions in Generate Test
        if (action === "stage2-prev" && state.testIndex > 0) {
            state.testIndex -= 1;
            const stage2 = document.getElementById("stage-2-content");
            if (stage2) stage2.innerHTML = renderStage2Content();
        }
        if (action === "stage2-next" && state.testIndex < state.generatedQuestions.length - 1) {
            state.testIndex += 1;
            const stage2 = document.getElementById("stage-2-content");
            if (stage2) stage2.innerHTML = renderStage2Content();
        }
        if (action === "stage2-submit") submitStage2Assessment();
        if (action === "stage2-reset") {
            state.generatedQuestions = [];
            state.testIndex = 0;
            state.testAnswers = {};
            state.testResult = null;
            const stage2 = document.getElementById("stage-2-content");
            if (stage2) stage2.innerHTML = renderStage2Content();
            document.getElementById("stage-1-configuration")?.scrollIntoView({ behavior: "smooth" });
        }

        // Standalone assessment actions
        if (action === "previous-question" && state.questionIndex > 0) {
            state.questionIndex -= 1;
            renderAssessment(state.attempt);
        }
        if (action === "next-question" && state.questionIndex < state.attempt.questions.length - 1) {
            state.questionIndex += 1;
            renderAssessment(state.attempt);
        }
        if (action === "submit-attempt") submitAssessment();
    });

    confirmDialog.addEventListener("close", () => {
        if (confirmDialog.returnValue === "confirm" && state.pendingDeleteId !== null) {
            performQuestionDelete(state.pendingDeleteId);
        }
        state.pendingDeleteId = null;
    });

    window.addEventListener("hashchange", renderRoute);
    renderRoute();
})();