# TimeBank v3

A compact, mobile-first UPT/PTO leave-time calculator.

## Main calculator

- Default shift: **6:15 PM → 4:45 AM**
- Default unpaid lunch: **11:00 PM → 11:30 PM**
- Lunch is always treated as **30 minutes unpaid**
- UPT is usable in **15-minute blocks**
- Flexible PTO and Standard PTO are usable by the minute and can be combined
- UPT accrues at **5 minutes per hour actually worked**
- UPT cap: **80 hours**
- No "next day" badge is shown; an overnight shift is treated as one shift

The page has two calculator modes:

1. **Earliest I can leave**
2. **I want to leave at** — if the requested time cannot be covered, the site shows the earliest available leave time and the shortfall

## Compact layout changes

- Each balance type has an on/off toggle
- Shift details are hidden until **Edit** is tapped
- Priority and local-saving settings are inside **Options**
- Results appear only after **Calculate** is tapped
- UPT Prediction and the 15-minute late checker are collapsed tools
- **Save my entries** is optional and stores data only in that browser/device

## UPT prediction examples

With the fixed prediction lunch of 11:00 PM–11:30 PM:

- 6:15 PM → 4:45 AM = 10 hours worked = **50 min UPT**
- 6:15 PM → 3:45 AM = 9 hours worked = **45 min UPT**

If the selected end time is before lunch, no lunch time is deducted. If it falls during lunch, only the overlapping lunch minutes are deducted.

## Update an existing GitHub Pages site

Upload the files in this folder to the root of the existing GitHub repository and commit the changes. Files with the same names replace the old versions.

Because this version updates the service worker cache, an iPhone may briefly show the old version once. Refresh the page again after GitHub finishes deploying.

This is an unofficial planning tool; the employer's timekeeping system remains the source of truth.
