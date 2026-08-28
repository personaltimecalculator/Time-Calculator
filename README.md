# Time Calculator v5

Mobile-first UPT/PTO leave planner.

Confirmed logic in this version:
- Default shift 6:15 PM–4:45 AM
- MET always adds exactly +1 hour to actual EOS
- SOS/EOS grace = ±5 minutes around actual schedule
- Lunch grace = ±3 minutes around the scheduled 11:00–11:30 PM lunch punches
- Grace never stacks with or moves because of PTO/UPT
- UPT deductions round uncovered time UP to the next 15-minute block
- UPT balance available for planning rounds DOWN to a full 15-minute block
- Flexible and Standard PTO are exact-minute balances
- PTO reduces the exact uncovered gap first; any remainder covered by UPT is rounded up to a 15-minute block
- Leaving before lunch does not subtract the 30-minute lunch from the absence
- Actual UPT earnings use actual clocked-in work time at 5 minutes/hour, rounded down to a whole minute
- Early work can earn additional UPT but never offsets a later absence

Upload all files to the same GitHub Pages repository root and commit.
