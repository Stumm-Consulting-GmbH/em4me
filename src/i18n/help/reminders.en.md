# Reminders

A reminder announces itself at a time you choose and brings a task back into view. It hangs on the reminder marker ⏰ of a task line and is therefore separate from the due date 📅: the due date names the actual deadline (when something should be finished), the reminder marker names the notification time (when the app reminds you of it). Reminders are a switchable extension and build on the [task lists](tasks.md).

## Marker and input paths

Like the other task markers, the marker sits at the end of the line:

```
⏰ YYYY-MM-DD [HH:MM]
```

The time part is optional. Without it, the reminder announces itself at the configured default time (see Settings).

```markdown
- [ ] File tax return ⏰ 2099-04-14
- [ ] Call customer back ⏰ 2099-04-14 09:30
```

- [ ] File tax return ⏰ 2099-04-14
- [ ] Call customer back ⏰ 2099-04-14 09:30

There are several ways to enter it:

- **Command "Set reminder"** (default `Ctrl+Alt+R`): on a task line it opens the date and time picker and writes the marker.
- **Autocomplete**: on a task line the entry "Reminder…" suggests the marker and opens the same picker.
- **Task editing dialog**: the reminder row of the dialog sets or changes the marker together with the other fields.
- **Click on the value**: a click on the ⏰ value or the ⏰ badge opens the pre-filled picker.

## Notification dialog

When a reminder is due, a dialog announces it with the description of the task and a link to the source file. Three paths are open:

- **Done**: advances the task along the configured status chain. If the task carries a recurrence rule, the follow-up instance is created and the ⏰ marker moves into that instance with a shifted time.
- **Remind me later**: postpones the notification time. On offer are the configured snooze options (default 10 minutes, 1 hour, 4 hours, 1 day, 1 week) and a free date choice. The new time is written directly into the marker of the source file.
- **Dismiss** (close or Escape): mutes this reminder until the next app start. The task itself stays unchanged.

## Only while the app is running

Reminders announce themselves **only while the app is running and the area is open**. There is no background service and no notification while the app is closed. If the app is not open at the notification time, nothing is lost even so: at the next start a **catch-up dialog** gathers all reminders that fell due in the meantime and shows them together, with the same actions as in the normal dialog. Outside an open area no monitoring takes place.

While an area is open, the app continuously checks the markers of all area files (on a 30-second cycle over the area index). Optionally a **system notification** can be switched on that appears in addition to the dialog when the window is not in the foreground; a click on it brings the app to the front. It is shown by the operating system: under Linux the desktop environment handles it, and without its notification service only the dialog inside the app remains.

## Reminder list

A sidebar panel lists all reminders of the area, grouped into **Overdue**, **Today**, **Tomorrow** and **Later**. The panel opens via the alarm icon in the status bar or via View → Sidebar → Panels → Reminders.

- Each entry offers the direct actions **Done** and **Later**.
- A click on an entry opens the source file at the corresponding line.
- The **Overdue** group also carries muted reminders and offers **Trigger again** there.

## Settings and extension

The **Reminders** settings section (File → Settings…) controls:

- **Default time**: notification time for markers without a time part (default 09:00).
- **Snooze options**: the list of postpone offers in the dialog and in the list.
- **System notification**: switches the additional notification for a non-foreground window on or off.

Reminders are a switchable **extension** with a dependency on the **Tasks** extension: if "Tasks" is switched off, reminders are inactive too. More on the [Extensions](extensions.md) page.
