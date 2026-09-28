# User Acceptance Testing Matrix

Run this matrix on a staging deployment using a current desktop browser and one mobile viewport. Use a non-production Clerk tenant and test accounts. Record the browser, build/commit, tester, date, and observed result in the release record. Do not place passwords, session tokens, or real user notes in screenshots.

| ID | Scenario | Steps | Expected result | Result |
| --- | --- | --- | --- | --- |
| AUTH-01 | Signed-out access | Open the frontend in a private browser window with no Clerk session. | Clerk sign-in appears; protected application data is not shown. | Not run |
| AUTH-02 | Successful sign-in | Sign in with a staging account and reload the page. | The dashboard loads, the API receives a bearer token, and the profile belongs to the signed-in account. | Not run |
| AUTH-03 | Sign-out | Sign out using the account menu, then reload. | Clerk session ends and protected data is no longer accessible. | Not run |
| AUTH-04 | Cross-user isolation | Sign in as a second test user and inspect profile, activities, planned shifts, sessions, and analytics. | Only the second user's data appears; another user's resource IDs cannot be read or mutated. | Not run |
| CAL-01 | Calendar navigation | Move between week and day views and navigate to previous/next ranges. | Correct dates and planned shifts load without errors. | Not run |
| CAL-02 | Create a planned shift | Select a valid awake-time slot, enter a title, choose an activity, and submit. | The event appears in the calendar and remains after reload. | Not run |
| CAL-03 | Drag and resize | Drag a planned shift to another awake-time slot, then resize it. | The preview tracks the pointer without layout jitter; saved start/end times match the new slot after reload. | Not run |
| CAL-04 | Sleep boundary restriction | Try to create, drag, or resize a shift through the shaded sleep zone. | The calendar marks the sleep window and rejects an overlapping placement with a clear warning. | Not run |
| CAL-05 | Calendar keyboard access | Navigate calendar controls and dialogs using Tab, Enter, Space, and Escape. | Focus remains visible; dialog actions are operable without a pointer; Escape closes the active dialog. | Not run |
| TIMER-01 | Start and pause | Select an activity, start the timer, wait, pause, and wait again. | Timer advances while running and remains stable while paused. | Not run |
| TIMER-02 | Reload drift stability | Start a timer, note elapsed time, reload the tab, then wait one minute. | The persisted timer resumes from its UTC anchor and elapsed time differs only by normal display/update latency. | Not run |
| TIMER-03 | Pause across reload | Pause the timer, reload, and wait one minute. | The timer remains paused and does not accumulate time until resumed. | Not run |
| TIMER-04 | Keyboard shortcuts | With focus outside text fields, use Space while the timer runs/pauses; use Ctrl/Cmd+M; open the shortcut help and press Escape. | Space pauses/resumes the timer, Ctrl/Cmd+M toggles STANDARD/RUSH, and Escape closes the open dialog. Typing Space in a text input inserts a space without changing the timer. | Not run |
| DED-01 | Zero deduction | Stop a short timer and save with zero deducted minutes. | Session saves and net focus time equals gross minutes. | Not run |
| DED-02 | Partial deduction | Enter a deduction smaller than gross minutes and save. | Session saves with `net_minutes = gross_minutes - deducted_minutes`; analytics refreshes. | Not run |
| DED-03 | Input validation | Try a negative deduction and a deduction greater than gross minutes. | Invalid values cannot be saved; a clear validation message is shown. | Not run |
| DED-04 | Notes handling | Save with empty notes and with a short note. | Empty notes are accepted; a supplied note is saved and displayed only to its owner. | Not run |
| ANA-01 | Weekly progress and cap | Save enough time to meet a test activity's weekly target. | Weekly progress updates and a cap warning is shown once the target is reached. | Not run |
| ANA-02 | Toast accessibility | Trigger success and warning toasts, wait four seconds, and dismiss one manually. | Screen reader announces each via the polite live region; notifications auto-dismiss and the close button works. | Not run |
| ANA-03 | Request diagnostics | Inspect a normal API response and its server log. | Response has `X-Request-ID`; the matching structured log includes the same ID and response latency without tokens or session notes. | Not run |
| RES-01 | Responsive layout | Repeat sign-in, timer, calendar, and deduction flows at a narrow mobile viewport. | Controls remain readable and operable; no critical content is clipped or overlaps dialogs. | Not run |

## Automated live API smoke check

For a staging environment, provide `API_BASE_URL` and a short-lived staging Clerk JWT through the operator's protected environment or secret manager, then run:

```bash
python scripts/live_e2e_check.py
```

The check writes a uniquely named temporary activity and session to exercise session arithmetic, variance, and cap analytics, then deletes the activity and its test session. Confirm the final cleanup row passes. Use a staging test account; if cleanup fails, delete the uniquely named `E2E verification` activity from that account before continuing.

## Acceptance sign-off

- [ ] All authentication and tenant-isolation cases pass.
- [ ] Calendar create, drag, resize, sleep boundary, and keyboard cases pass.
- [ ] Timer persistence and drift cases pass across reloads.
- [ ] Deduction calculations, validation, and analytics update cases pass.
- [ ] Toast accessibility and request diagnostics cases pass.
- [ ] Any failed case has an issue owner and is resolved or explicitly accepted before release.
