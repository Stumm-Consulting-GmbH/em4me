# Task lists

Task lists are list items with a state box. Beyond the standard states (open, done) there are extended states with their own character, glyph and colour, plus task markers for dates, priority and recurrence at the line end.

## Standard states

```markdown
- [ ] open task
- [x] completed task
```

- [ ] open task
- [x] completed task

In editable files a click on the checkbox completes the task or reopens it — in Reading view and in Live mode. In the read-only manual the click has no effect.

## Extended states

Six predefined states; the character sits between the square brackets:

```markdown
- [/] in progress
- [-] cancelled
- [>] delegated
- [?] question
- [!] important
- [*] starred
```

- [/] in progress
- [-] cancelled
- [>] delegated
- [?] question
- [!] important
- [*] starred

Each state renders as a coloured box with a glyph. A click on the state box advances to the state's **follow-up symbol** (default: complete with `[x]`); this lets chains such as "open → in progress → done" be configured.

## Custom states, type and follow-up symbol

The **Task states** section of the settings page (File → Settings…) manages the set: predefined states can be disabled or recoloured, custom states with a freely chosen character, label and colour can be added. Not allowed are spaces, `x`, `X`, square brackets and the backslash; a warning reports characters used more than once.

Each state additionally carries a **type** and a **follow-up symbol**:

- **Type** determines the meaning of the state: Open, In progress, On hold, Done, Cancelled or Not a task. Only a switch to a state of type **Done** sets the done date and triggers the recurrence; the type **Cancelled** sets the cancelled date. Lines with the type **Not a task** do not count as tasks. The assignment is free — even a character such as `*` may carry the type Done.
- **Follow-up symbol** determines which character the click on the state box sets next. The base states are fixed: `[ ]` becomes `[x]`, `[x]` becomes `[ ]`.

## Task markers: dates

Dates appear as symbol markers with a `YYYY-MM-DD` date at the line end and show in all views as a badge:

```markdown
- [ ] Submit report 📅 2099-03-31
- [ ] Preparation ⏳ 2099-03-24 🛫 2099-03-17
- [ ] Long overdue 📅 2020-01-01
```

- [ ] Submit report 📅 2099-03-31
- [ ] Preparation ⏳ 2099-03-24 🛫 2099-03-17
- [ ] Long overdue 📅 2020-01-01

Set manually are **due** (`📅`), **scheduled** (`⏳`) and **start** (`🛫`). Created automatically are **created** (`➕`), **done** (`✅`) and **cancelled** (`❌`) — see automatic dates. Overdue due dates are highlighted in red; calendrically invalid values (a 30 February, say) are kept and marked as invalid.

After the date an optional **time** `HH:mm` is allowed:

```markdown
- [ ] Dentist appointment 📅 2099-03-31 14:30
```

- [ ] Dentist appointment 📅 2099-03-31 14:30

The time is a format extension of this app; other Markdown programs with the same marker format do not expect a time after the date. Lines without a time are fully interchangeable.

Distinct from this actual deadline is the reminder marker ⏰, which fires a reminder at the given time; it is described on the [Reminders](reminders.md) page.

## Task markers: priority

Six levels; "normal" has no symbol and sits between medium and low:

```markdown
- [ ] Highest 🔺
- [ ] High ⏫
- [ ] Medium 🔼
- [ ] Normal (no marker)
- [ ] Low 🔽
- [ ] Lowest ⏬
```

- [ ] Highest 🔺
- [ ] High ⏫
- [ ] Medium 🔼
- [ ] Normal (no marker)
- [ ] Low 🔽
- [ ] Lowest ⏬

## Task markers: recurrence

A recurrence rule follows `🔁` and, on completion of the task, automatically produces the next instance — with carried-forward dates, open state and, per the setting, above (default) or below the completed line:

```markdown
- [ ] Weekly planning 🔁 every week on Sunday ⏳ 2099-03-01
- [ ] Take out the rubbish 🔁 every 3 days when done 📅 2099-03-05
- [ ] Check rent 🔁 every month on the last 📅 2099-03-31
```

- [ ] Weekly planning 🔁 every week on Sunday ⏳ 2099-03-01
- [ ] Take out the rubbish 🔁 every 3 days when done 📅 2099-03-05
- [ ] Check rent 🔁 every month on the last 📅 2099-03-31

Rule forms: `every day`, `every 3 days`, `every weekday`, `every week`, `every week on Sunday` (also several weekdays), `every 2 weeks`, `every month`, `every month on the 15th`, `every month on the last`, `every 6 months`, `every year`. The addition `when done` counts from the actual completion instead of from the target date.

Behaviour in detail: the calculation base is the due date, failing that scheduled, failing that start — at least one date field is required. If several fields carry dates, their intervals are preserved; times are taken over unchanged. Month rules skip months without the target day (a 31st thus never falls on the 30th). There is no end date or limit on the number of occurrences; rules that cannot be parsed have no effect.

## Automatic dates

On a state change the app writes date markers into the line — each of the three automatics can be turned off individually in the settings section **Tasks**:

- **Done** (`✅`): on a switch to a state of type Done; the switch back removes the date again.
- **Cancelled** (`❌`): likewise for the type Cancelled.
- **Created** (`➕`): when turning a line into a task via the "Task list" command (off by default).

The automatic writes only the date without a time.

## Global filter

The **Global filter** (settings section **Tasks**) decides which checkbox lines count as tasks: only lines that contain the filter text (`#task`, say) get badges and automatic dates; with an empty filter every checkbox line counts. Optionally the filter text is hidden in the views.

## ID and dependencies

A task can carry an **ID** (`🆔`) and depend on other tasks via **predecessor references** (`⛔` with one or more IDs) — finish-to-start relations:

```markdown
- [ ] Pour foundation 🆔 abc12 📅 2099-04-01
- [ ] Build walls ⛔ abc12
```

- [ ] Pour foundation 🆔 abc12 📅 2099-04-01
- [ ] Build walls ⛔ abc12

A task counts as **blocked** as long as at least one predecessor is still open (status types Open, In progress or On hold on both sides); done or cancelled predecessors do not block. Blocked matches of the task query carry a subtle `⛔` marker; the fields `blocked`, `blocking` and `id.set` filter by it (see the Task level of the [Perspective Query](frontmatter-query.md) page).

IDs consist of letters, digits, `_` and `-`. Automatically generated IDs (dialog or autocompletion) are **unique within the search scope**; IDs assigned twice by hand show a `⚠` badge in the matches and can be found via the `id.duplicate` field. In the follow-up instance of a recurrence the ID and predecessor markers are removed so that no duplicate IDs arise.

## Edit dialog

The command **Edit task…** (default `Ctrl+Alt+A`, also in the editor context menu under Insert and as a pencil button on query matches) opens a form for all markers: description, status (from the configured status set), priority, recurrence rule with a hint on an unparseable form, the three manual dates via the date calendar, plus ID, predecessors and successors with a task search over the search scope. On a task line the dialog edits, on an empty line it creates a new task. Switching to a status of type Done sets the done date per the automatic; a successor entry writes the predecessor reference onto the target line (the task itself automatically gets an ID if needed). Each application is a single undo step.

## Autocompletion

On task lines the completion suggests markers after the state box: the three dates (open the date calendar), priority, common recurrence rules, status changes and "Generate ID". The suggestions appear from a configurable typing length (or immediately with `Ctrl+Space`) and replace the typed word on acceptance; minimum typing length and number of suggestions are in the settings section **Tasks**.

## Task queries and write-back

The query scope `LIST TASKS` (page [Perspective Query](frontmatter-query.md), Task level section) lists tasks across the whole search scope — with filters over all marker fields, grouping and layout control. The matches are a work surface: the **state box** advances the status directly in the source file (with chain toggle, automatic dates and recurrence), the **postpone button** moves the relevant date to tomorrow, one week later or a freely chosen date (overdue dates count from today), the **pencil button** opens the edit dialog. Writing also reaches files that are not open; open documents are updated via the editor state and never overtaken, and if a match line has changed in the meantime a notice appears instead of a blind write.

## Urgency score

The score makes task lists sortable without manual work (the default sort of the task query; shown as a value via `SHOW urgency`, filterable and sortable via the `urgency` field). It is the sum of four components:

| Component | Value |
|---|---|
| Due date | 12.0 from seven days overdue, sliding down to 2.4 from fourteen days in the future (due today: 8.8); 0 without a date |
| Priority | Highest 9.0 · High 6.0 · Medium 3.9 · Normal 1.95 · Low 0.0 · Lowest −1.8 |
| Scheduled | +5.0 if the scheduled date is today or earlier |
| Start | −3.0 if the start date is tomorrow or later |

The score calculates on a daily basis; a time after the date has no influence, and calendrically invalid dates count as missing.
